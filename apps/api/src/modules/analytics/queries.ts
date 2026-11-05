import type { DayResult } from "@lifeos/analytics-core";
import { Prisma, type PrismaClient } from "@lifeos/db";

type Db = PrismaClient | Prisma.TransactionClient;

export interface ScopeFilter {
  plannerId?: string;
  categoryId?: string;
}

const scopeSql = ({ plannerId, categoryId }: ScopeFilter) => Prisma.sql`
  ${plannerId ? Prisma.sql`AND t.planner_id = ${plannerId}::uuid` : Prisma.empty}
  ${categoryId ? Prisma.sql`AND p.category_id = ${categoryId}::uuid` : Prisma.empty}`;

// Column expressions come from these constants, never from request text. Values are bound parameters.
export const GRAIN_SQL = {
  day: Prisma.sql`'day'`,
  week: Prisma.sql`'week'`,
  month: Prisma.sql`'month'`,
} as const;

export const METRIC_MEASURE_SQL = {
  sum: Prisma.sql`SUM(l.value)`,
  avg: Prisma.sql`AVG(l.value)`,
  min: Prisma.sql`MIN(l.value)`,
  max: Prisma.sql`MAX(l.value)`,
  count: Prisma.sql`COUNT(*)`,
} as const;

export interface OccurrenceBucket {
  bucket: string;
  eligible: number;
  completed: number;
  skipped: number;
  rest: number;
  notApplicable: number;
}

/** Every query is pinned to user_id. Eligible is completed plus still-pending past occurrences. */
export async function occurrenceBuckets(
  db: Db,
  userId: string,
  from: string,
  to: string,
  grain: keyof typeof GRAIN_SQL,
  scope: ScopeFilter = {},
): Promise<OccurrenceBucket[]> {
  const rows = await db.$queryRaw<
    { bucket: string; completed: bigint; pending: bigint; skipped: bigint; rest: bigint; na: bigint }[]
  >(Prisma.sql`
    SELECT to_char(date_trunc(${GRAIN_SQL[grain]}, o.date), 'YYYY-MM-DD') AS bucket,
      COUNT(*) FILTER (WHERE o.status = 'completed') AS completed,
      COUNT(*) FILTER (WHERE o.status = 'pending') AS pending,
      COUNT(*) FILTER (WHERE o.status = 'skipped') AS skipped,
      COUNT(*) FILTER (WHERE o.status = 'rest') AS rest,
      COUNT(*) FILTER (WHERE o.status = 'not_applicable') AS na
    FROM task_occurrences o
    JOIN tasks t ON t.id = o.task_id AND t.user_id = ${userId}::uuid
    JOIN planners p ON p.id = t.planner_id AND p.user_id = ${userId}::uuid
    WHERE o.user_id = ${userId}::uuid
      AND o.date BETWEEN ${from}::date AND ${to}::date
      AND t.deleted_at IS NULL AND p.deleted_at IS NULL
      ${scopeSql(scope)}
    GROUP BY 1 ORDER BY 1`);
  return rows.map((r) => ({
    bucket: r.bucket,
    eligible: Number(r.completed) + Number(r.pending),
    completed: Number(r.completed),
    skipped: Number(r.skipped),
    rest: Number(r.rest),
    notApplicable: Number(r.na),
  }));
}

export async function dailyCounts(db: Db, userId: string, from: string, to: string): Promise<DayResult[]> {
  const rows = await occurrenceBuckets(db, userId, from, to, "day");
  return rows.map((r) => ({ date: r.bucket, eligible: r.eligible, completed: r.completed }));
}

export async function metricBuckets(
  db: Db,
  userId: string,
  metricId: string,
  from: string,
  to: string,
  grain: keyof typeof GRAIN_SQL,
  measure: keyof typeof METRIC_MEASURE_SQL,
) {
  const rows = await db.$queryRaw<{ bucket: string; value: number | bigint | null }[]>(Prisma.sql`
    SELECT to_char(date_trunc(${GRAIN_SQL[grain]}, l.local_date), 'YYYY-MM-DD') AS bucket,
      ${METRIC_MEASURE_SQL[measure]} AS value
    FROM metric_logs l
    WHERE l.user_id = ${userId}::uuid AND l.metric_id = ${metricId}::uuid
      AND l.local_date BETWEEN ${from}::date AND ${to}::date
    GROUP BY 1 ORDER BY 1`);
  return rows.map((r) => ({ bucket: r.bucket, value: r.value === null ? null : Number(r.value) }));
}
