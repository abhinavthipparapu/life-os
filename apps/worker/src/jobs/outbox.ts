import { rebuildDailyAggregates } from "@lifeos/domain";
import { runDeletion, runExport } from "./account.js";
import type { JobContext } from "./context.js";

const BATCH = 200;
export const MAX_OUTBOX_ATTEMPTS = 5;

interface Row {
  id: bigint;
  user_id: string | null;
  type: string;
  payload: { date?: string; requestId?: string };
}

async function handle(ctx: JobContext, event: Row) {
  const userId = event.user_id;
  if (!userId) return;
  switch (event.type) {
    case "occurrence.changed":
    case "metric.logged":
      if (event.payload.date) {
        const date = event.payload.date;
        await ctx.prisma.$transaction((tx) => rebuildDailyAggregates(tx, userId, date));
      }
      return;
    case "account.export":
      await runExport(ctx, userId, event.payload.requestId!);
      return;
    case "account.deletion":
      await runDeletion(ctx, userId);
      return;
    default:
      ctx.log.error({ type: event.type }, "unknown outbox event");
  }
}

/** SKIP LOCKED lets several workers drain at once without taking the same rows. */
export async function drainOutboxJob(ctx: JobContext) {
  const { prisma } = ctx;
  const stats = { processed: 0, failed: 0 };
  await prisma.$transaction(
    async (tx) => {
      const claimed = await tx.$queryRaw<Row[]>`
        SELECT id, user_id, type, payload FROM outbox_events
        WHERE processed_at IS NULL AND attempts < ${MAX_OUTBOX_ATTEMPTS}
        ORDER BY id LIMIT ${BATCH} FOR UPDATE SKIP LOCKED`;
      for (const event of claimed) {
        try {
          await handle(ctx, event);
          await tx.outboxEvent.update({
            where: { id: event.id },
            data: { processedAt: new Date() },
          });
          stats.processed += 1;
        } catch (err) {
          await tx.outboxEvent.update({
            where: { id: event.id },
            data: { attempts: { increment: 1 } },
          });
          stats.failed += 1;
          ctx.log.error(
            { err, eventId: String(event.id), type: event.type },
            "outbox event failed",
          );
        }
      }
    },
    { timeout: 120_000 },
  );
  return stats;
}
