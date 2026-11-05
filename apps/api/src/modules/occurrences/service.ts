import { localDateOf } from "@lifeos/analytics-core";
import type { Prisma, PrismaClient } from "@lifeos/db";
import { audit } from "../../shared/audit.js";
import { badRequest, conflict, notFound } from "../../shared/http.js";
import { evaluateMilestones, type Celebration } from "../achievements/service.js";

type Tx = Prisma.TransactionClient;
export type OccurrenceAction = "complete" | "skip" | "reopen";

export interface ActionInput {
  expectedVersion?: number;
  value?: number;
  note?: string;
  reason?: string;
  kind?: "skip" | "rest";
  occurredAt?: string;
}

const NO_CELEBRATION: Celebration = { dayComplete: false, plannerCompleted: null, achievements: [] };
const dateString = (d: Date) => d.toISOString().slice(0, 10);

function targetStatus(action: OccurrenceAction, kind?: "skip" | "rest") {
  if (action === "complete") return "completed" as const;
  if (action === "reopen") return "pending" as const;
  return kind === "rest" ? ("rest" as const) : ("skipped" as const);
}

/**
 * The single path for occurrence state changes, shared by the REST routes and offline replay.
 * Repeating an action already in effect is a no-op, which is what makes completion idempotent.
 * The row lock serializes concurrent devices.
 */
export async function applyOccurrenceAction(
  tx: Tx,
  userId: string,
  id: string,
  action: OccurrenceAction,
  input: ActionInput,
) {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM task_occurrences WHERE id = ${id}::uuid AND user_id = ${userId}::uuid FOR UPDATE`;
  if (locked.length === 0) throw notFound("Occurrence");
  const occurrence = await tx.taskOccurrence.findUniqueOrThrow({
    where: { id },
    include: { task: { select: { plannerId: true, deletedAt: true, planner: { select: { timezone: true } } } } },
  });
  if (occurrence.task.deletedAt) throw notFound("Occurrence");

  const status = targetStatus(action, input.kind);
  if (occurrence.status === status) return { occurrence, celebration: NO_CELEBRATION, changed: false };
  if (input.expectedVersion !== undefined && input.expectedVersion !== occurrence.version) {
    throw conflict("This occurrence was changed elsewhere", occurrence);
  }
  if (action === "reopen" && occurrence.status === "not_applicable") {
    throw badRequest("A deferred occurrence cannot be reopened", "invalid_transition");
  }

  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  const updated = await tx.taskOccurrence.update({
    where: { id },
    data: {
      status,
      version: { increment: 1 },
      completedAt: action === "complete" ? occurredAt : null,
      value: action === "complete" ? (input.value ?? null) : null,
      ...(input.note === undefined ? {} : { note: input.note }),
    },
  });
  await tx.taskEvent.create({
    data: {
      occurrenceId: id,
      actorId: userId,
      action,
      reason: input.reason ?? null,
      occurredAt,
      payload: { from: occurrence.status, to: status, value: input.value ?? null },
    },
  });
  const date = dateString(occurrence.date);
  await tx.outboxEvent.create({ data: { userId, type: "occurrence.changed", payload: { date, occurrenceId: id } } });
  await audit(tx, { actorId: userId, action: `occurrence.${action}`, entityType: "occurrence", entityId: id });

  const today = localDateOf(new Date(), occurrence.task.planner.timezone);
  const celebration =
    action === "complete"
      ? await evaluateMilestones(tx, userId, date, today, occurrence.task.plannerId)
      : NO_CELEBRATION;
  return { occurrence: updated, celebration, changed: true };
}

export function occurrenceService(prisma: PrismaClient) {
  return {
    list: (userId: string, from: string, to: string, plannerId?: string) =>
      prisma.taskOccurrence.findMany({
        where: {
          userId,
          date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
          task: { deletedAt: null, ...(plannerId ? { plannerId } : {}), planner: { deletedAt: null } },
        },
        orderBy: [{ date: "asc" }, { scheduledAt: "asc" }, { id: "asc" }],
        take: 2000,
        include: {
          task: {
            select: {
              id: true,
              title: true,
              type: true,
              targetValue: true,
              targetUnit: true,
              plannerId: true,
              planner: { select: { name: true, color: true } },
            },
          },
        },
      }),

    act: (userId: string, id: string, action: OccurrenceAction, input: ActionInput) =>
      prisma.$transaction((tx) => applyOccurrenceAction(tx, userId, id, action, input)),

    /** History stays immutable: the original closes as not-applicable and a new instance is created. */
    defer: (userId: string, id: string, input: { toDate: string; expectedVersion?: number; reason?: string }) =>
      prisma.$transaction(async (tx) => {
        const source = await tx.taskOccurrence.findFirst({ where: { id, userId } });
        if (!source) throw notFound("Occurrence");
        if (source.status !== "pending") throw badRequest("Only pending occurrences can be deferred", "invalid_transition");
        if (input.expectedVersion !== undefined && input.expectedVersion !== source.version) {
          throw conflict("This occurrence was changed elsewhere", source);
        }
        const from = dateString(source.date);
        if (input.toDate === from) throw badRequest("Choose a different date", "invalid_transition");
        const moved = await tx.taskOccurrence.create({
          data: {
            userId,
            taskId: source.taskId,
            slotKey: `${source.slotKey}:deferred:${from}`,
            date: new Date(`${input.toDate}T00:00:00Z`),
          },
        });
        await tx.taskOccurrence.update({
          where: { id },
          data: { status: "not_applicable", version: { increment: 1 } },
        });
        await tx.taskEvent.create({
          data: {
            occurrenceId: id,
            actorId: userId,
            action: "defer",
            reason: input.reason ?? null,
            payload: { toDate: input.toDate, movedTo: moved.id },
          },
        });
        await tx.outboxEvent.createMany({
          data: [from, input.toDate].map((date) => ({ userId, type: "occurrence.changed", payload: { date } })),
        });
        await audit(tx, { actorId: userId, action: "occurrence.defer", entityType: "occurrence", entityId: id });
        return moved;
      }),
  };
}
