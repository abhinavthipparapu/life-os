import type { Prisma, PrismaClient } from "@lifeos/db";
import { occurrenceBuckets } from "./queries.js";

type Db = PrismaClient | Prisma.TransactionClient;

export const OCCURRENCE_KEY = "occurrences";
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);

export interface AggregateRow {
  metricKey: string;
  value: number;
  eligible: number;
  completed: number;
  skipped: number;
  rest: number;
  notApplicable: number;
}

/** Computes one day's truth from the source tables. */
export async function computeDailyAggregates(db: Db, userId: string, date: string): Promise<AggregateRow[]> {
  const [bucket] = await occurrenceBuckets(db, userId, date, date, "day");
  const rows: AggregateRow[] = [];
  if (bucket) {
    const { eligible, completed, skipped, rest, notApplicable } = bucket;
    rows.push({ metricKey: OCCURRENCE_KEY, value: completed, eligible, completed, skipped, rest, notApplicable });
  }
  const logs = await db.metricLog.groupBy({
    by: ["metricId"],
    where: { userId, localDate: asDate(date), value: { not: null } },
    _sum: { value: true },
  });
  if (logs.length) {
    const metrics = await db.metricDefinition.findMany({
      where: { userId, id: { in: logs.map((l) => l.metricId) } },
      select: { id: true, key: true },
    });
    const keys = new Map(metrics.map((m) => [m.id, m.key]));
    for (const log of logs) {
      const metricKey = keys.get(log.metricId);
      if (metricKey) {
        rows.push({ metricKey, value: log._sum.value ?? 0, eligible: 0, completed: 0, skipped: 0, rest: 0, notApplicable: 0 });
      }
    }
  }
  return rows;
}

/** Replaces one user-day. Safe to repeat, so at-least-once delivery cannot double count. */
export async function rebuildDailyAggregates(tx: Prisma.TransactionClient, userId: string, date: string) {
  const rows = await computeDailyAggregates(tx, userId, date);
  await tx.dailyAggregate.deleteMany({ where: { userId, localDate: asDate(date) } });
  if (rows.length) {
    await tx.dailyAggregate.createMany({ data: rows.map((r) => ({ ...r, userId, localDate: asDate(date) })) });
  }
  return rows.length;
}
