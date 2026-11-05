import { adherence, localDateOf } from "@lifeos/analytics-core";
import type { Prisma, PrismaClient } from "@lifeos/db";
import { occurrenceBuckets } from "../queries.js";
import { addDays } from "../recurrence.js";

type Db = PrismaClient | Prisma.TransactionClient;

export const INSIGHT_SYSTEM =
  "You explain a person's own tracking numbers in a warm, factual tone. Use only the numbers provided. " +
  "Never invent statistics, never shame the reader, and give no medical advice. Reply in under 120 words.";

export interface SourceMetric {
  label: string;
  value: number | null;
  unit?: string | null;
}

/** All statistics are computed here on the server. The model only receives and explains them. */
export async function buildInsightContext(
  db: Db,
  userId: string,
  timezone: string,
  days: number,
  includeSensitive: boolean,
) {
  const to = localDateOf(new Date(), timezone);
  const from = addDays(to, -(days - 1));
  const buckets = await occurrenceBuckets(db, userId, from, to, "day");
  const totals = buckets.reduce(
    (a, b) => ({
      eligible: a.eligible + b.eligible,
      completed: a.completed + b.completed,
      skipped: a.skipped + b.skipped,
    }),
    { eligible: 0, completed: 0, skipped: 0 },
  );
  const rate = adherence(totals);
  const sources: SourceMetric[] = [
    { label: "Tasks completed", value: totals.completed },
    { label: "Tasks eligible", value: totals.eligible },
    { label: "Tasks skipped", value: totals.skipped },
    { label: "Adherence", value: rate === null ? null : Math.round(rate * 1000) / 10, unit: "%" },
  ];
  const metrics = await db.metricDefinition.findMany({
    where: {
      userId,
      deletedAt: null,
      kind: { not: "text" },
      ...(includeSensitive ? {} : { isSensitive: false }),
    },
    take: 20,
  });
  for (const metric of metrics) {
    const result = await db.metricLog.aggregate({
      where: {
        userId,
        metricId: metric.id,
        localDate: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
      },
      _avg: { value: true },
      _count: true,
    });
    if (result._count > 0) {
      sources.push({
        label: `${metric.label} (average)`,
        value: result._avg.value,
        unit: metric.unit,
      });
    }
  }
  const prompt = [
    `Period: ${from} to ${to}.`,
    ...sources.map((s) => `${s.label}: ${s.value ?? "no data"}${s.unit ? ` ${s.unit}` : ""}`),
  ].join("\n");
  return { prompt, sources, from, to };
}

export async function monthlyTokensUsed(
  db: Db,
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const { _sum } = await db.aiUsage.aggregate({
    where: { userId, createdAt: { gte: start } },
    _sum: { tokens: true },
  });
  return _sum.tokens ?? 0;
}
