import { syncChangesQuery, type SyncOperation, type SyncOutcome } from "@lifeos/contracts";
import type { Prisma, PrismaClient } from "@lifeos/db";
import { z } from "zod";
import { AppError } from "../../shared/http.js";
import { applyOccurrenceAction } from "../occurrences/service.js";

const MAX_CLOCK_SKEW_MS = 86_400_000;
const CHANGE_PAGE = 500;
const OVERLAP_MS = 5_000;

const payloadSchema = z.object({
  value: z.number().finite().optional(),
  note: z.string().max(1000).optional(),
  reason: z.string().max(500).optional(),
  kind: z.enum(["skip", "rest"]).optional(),
});

export interface OperationResult {
  clientOperationId: string;
  outcome: SyncOutcome;
  occurrence?: unknown;
  current?: unknown;
  message?: string;
  celebration?: unknown;
}

export function syncService(prisma: PrismaClient) {
  const log = (userId: string, op: SyncOperation, result: OperationResult) =>
    ({
      userId,
      clientOperationId: op.clientOperationId,
      entityType: op.entityType,
      entityId: op.entityId,
      action: op.action,
      result: result.outcome,
      responseJson: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
      occurredAt: new Date(op.occurredAt),
    }) as const;

  async function applyIdempotentOperation(userId: string, op: SyncOperation): Promise<OperationResult> {
    const key = { userId_clientOperationId: { userId, clientOperationId: op.clientOperationId } };
    const prior = await prisma.syncOperation.findUnique({ where: key });
    if (prior) return { ...(prior.responseJson as object), clientOperationId: op.clientOperationId, outcome: "duplicate" };

    const reject = async (message: string): Promise<OperationResult> => {
      const result: OperationResult = { clientOperationId: op.clientOperationId, outcome: "rejected", message };
      await prisma.syncOperation.create({ data: log(userId, op, result) });
      return result;
    };
    const payload = payloadSchema.safeParse(op.payload);
    if (!payload.success) return reject("Invalid payload");
    if (Date.parse(op.occurredAt) > Date.now() + MAX_CLOCK_SKEW_MS) return reject("occurredAt is in the future");

    try {
      return await prisma.$transaction(async (tx) => {
        const { occurrence, celebration } = await applyOccurrenceAction(tx, userId, op.entityId, op.action, {
          ...payload.data,
          reason: op.action === "skip" ? (payload.data.reason ?? "Skipped offline") : undefined,
          expectedVersion: op.expectedVersion,
          occurredAt: op.occurredAt,
        });
        const result: OperationResult = { clientOperationId: op.clientOperationId, outcome: "accepted", occurrence, celebration };
        await tx.syncOperation.create({ data: log(userId, op, result) });
        return result;
      });
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") {
        return { clientOperationId: op.clientOperationId, outcome: "duplicate" };
      }
      if (err instanceof AppError && err.status === 409) {
        const result: OperationResult = {
          clientOperationId: op.clientOperationId,
          outcome: "conflict",
          current: err.extra.current,
        };
        await prisma.syncOperation.create({ data: log(userId, op, result) });
        return result;
      }
      if (err instanceof AppError && err.status < 500) return reject(err.message);
      throw err;
    }
  }

  return {
    /** Operations replay in order. Each commits alone, so one bad operation never blocks the rest. */
    async applyBatch(userId: string, operations: SyncOperation[]) {
      const results: OperationResult[] = [];
      for (const op of operations) results.push(await applyIdempotentOperation(userId, op));
      return results;
    },

    async getChanges(userId: string, q: z.output<typeof syncChangesQuery>) {
      const startedAt = new Date();
      const since = q.cursor ? new Date(q.cursor) : new Date(0);
      if (Number.isNaN(since.getTime())) throw new AppError(422, "invalid_cursor", "Invalid cursor");
      const where = { userId, updatedAt: { gte: since } };
      const page = { orderBy: { updatedAt: "asc" as const }, take: CHANGE_PAGE };
      const [occurrences, tasks, planners, categories] = await Promise.all([
        prisma.taskOccurrence.findMany({ where, ...page }),
        prisma.task.findMany({ where, ...page }),
        prisma.planner.findMany({ where, ...page }),
        prisma.category.findMany({ where, ...page }),
      ]);
      const full = [occurrences, tasks, planners, categories].filter((rows) => rows.length === CHANGE_PAGE);
      const truncatedAt = full.map((rows) => rows[rows.length - 1]!.updatedAt.getTime());
      // The overlap catches rows from transactions still committing when this read began.
      const next = truncatedAt.length ? Math.min(...truncatedAt) : startedAt.getTime() - OVERLAP_MS;
      return {
        changes: { occurrences, tasks, planners, categories },
        nextCursor: new Date(next).toISOString(),
        hasMore: truncatedAt.length > 0,
      };
    },
  };
}
