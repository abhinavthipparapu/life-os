import { adherence, dailyScore, localDateOf, streaks } from "@lifeos/analytics-core";
import type { QuerySpec } from "@lifeos/contracts";
import type { PrismaClient } from "@lifeos/db";
import { notFound } from "../../shared/http.js";
import { dailyCounts, metricBuckets, occurrenceBuckets, type ScopeFilter } from "@lifeos/domain";

const DENOMINATOR = "completed + missed; skipped, rest and not-applicable excluded";

export async function userTimezone(prisma: PrismaClient, userId: string) {
  const p = await prisma.profile.findUniqueOrThrow({ where: { authUserId: userId }, select: { timezone: true } });
  return p.timezone;
}

export function analyticsService(prisma: PrismaClient) {
  /** Foreign IDs fail here with the same 404 as missing ones. */
  async function assertScope(userId: string, spec: ScopeFilter & { metricId?: string }) {
    const checks = await Promise.all([
      spec.plannerId ? prisma.planner.count({ where: { id: spec.plannerId, userId, deletedAt: null } }) : 1,
      spec.categoryId ? prisma.category.count({ where: { id: spec.categoryId, userId, deletedAt: null } }) : 1,
      spec.metricId ? prisma.metricDefinition.count({ where: { id: spec.metricId, userId, deletedAt: null } }) : 1,
    ]);
    if (checks.some((c) => c === 0)) throw notFound();
  }

  return {
    async querySeries(userId: string, spec: QuerySpec) {
      await assertScope(userId, spec);
      const timezone = await userTimezone(prisma, userId);
      const meta = { from: spec.from, to: spec.to, grain: spec.grain, timezone };
      if (spec.source === "metric") {
        const measure = spec.measure as "sum" | "avg" | "min" | "max" | "count";
        const points = await metricBuckets(prisma, userId, spec.metricId!, spec.from, spec.to, spec.grain, measure);
        return { points, meta };
      }
      // Future occurrences have not happened yet, so they must not lower adherence.
      const today = localDateOf(new Date(), timezone);
      const to = spec.to < today ? spec.to : today;
      const rows = spec.from > to ? [] : await occurrenceBuckets(prisma, userId, spec.from, to, spec.grain, spec);
      const points = rows.map((r) => {
        const value =
          spec.measure === "adherence"
            ? adherence(r)
            : spec.measure === "skipped"
              ? r.skipped
              : spec.measure === "eligible"
                ? r.eligible
                : r.completed;
        return { bucket: r.bucket, value, eligible: r.eligible, completed: r.completed };
      });
      return { points, meta: { ...meta, to, denominator: DENOMINATOR } };
    },

    async computeAdherence(userId: string, from: string, to: string, scope: ScopeFilter = {}) {
      await assertScope(userId, scope);
      const timezone = await userTimezone(prisma, userId);
      const today = localDateOf(new Date(), timezone);
      const end = to < today ? to : today;
      const rows = from > end ? [] : await occurrenceBuckets(prisma, userId, from, end, "day", scope);
      const totals = rows.reduce(
        (a, r) => ({
          eligible: a.eligible + r.eligible,
          completed: a.completed + r.completed,
          skipped: a.skipped + r.skipped,
          rest: a.rest + r.rest,
          notApplicable: a.notApplicable + r.notApplicable,
        }),
        { eligible: 0, completed: 0, skipped: 0, rest: 0, notApplicable: 0 },
      );
      return { ...totals, adherence: adherence(totals), days: rows, from, to: end, timezone, denominator: DENOMINATOR };
    },

    async home(userId: string) {
      const timezone = await userTimezone(prisma, userId);
      const today = localDateOf(new Date(), timezone);
      const [days, buckets, planners, goals] = await Promise.all([
        dailyCounts(prisma, userId, "2000-01-01", today),
        occurrenceBuckets(prisma, userId, today, today, "day"),
        prisma.planner.findMany({
          where: { userId, deletedAt: null },
          orderBy: { updatedAt: "desc" },
          take: 6,
          select: { id: true, name: true, color: true, icon: true, completedAt: true },
        }),
        prisma.goal.count({ where: { userId, deletedAt: null } }),
      ]);
      const counts = buckets[0] ?? { eligible: 0, completed: 0, skipped: 0, rest: 0, notApplicable: 0 };
      const suggestions: string[] = [];
      if (planners.length === 0) suggestions.push("create_planner");
      else if (counts.eligible === 0) suggestions.push("schedule_task");
      if (goals === 0) suggestions.push("create_goal");
      return { today, timezone, counts, score: dailyScore(counts), streak: streaks(days, today), planners, suggestions };
    },
  };
}
