import { localDateOf } from "@lifeos/analytics-core";
import { addDays, computeDailyAggregates, rebuildDailyAggregates } from "@lifeos/domain";
import type { JobContext } from "./context.js";

const LOOKBACK_DAYS = 7;

/** Nightly check that incremental aggregates still match the source data. Repairs and counts drift. */
export async function reconcileAggregatesJob({ prisma, log }: JobContext, now: Date = new Date()) {
  let drift = 0;
  const profiles = await prisma.profile.findMany({
    where: { deletedAt: null },
    select: { authUserId: true, timezone: true },
  });
  for (const { authUserId: userId, timezone } of profiles) {
    const today = localDateOf(now, timezone);
    for (let i = 0; i < LOOKBACK_DAYS; i += 1) {
      const date = addDays(today, -i);
      const expected = await computeDailyAggregates(prisma, userId, date);
      const stored = await prisma.dailyAggregate.findMany({
        where: { userId, localDate: new Date(`${date}T00:00:00Z`) },
      });
      const same =
        stored.length === expected.length &&
        expected.every((e) => {
          const s = stored.find((row) => row.metricKey === e.metricKey);
          return (
            s && s.value === e.value && s.eligible === e.eligible && s.completed === e.completed
          );
        });
      if (!same) {
        drift += 1;
        await prisma.$transaction((tx) => rebuildDailyAggregates(tx, userId, date));
      }
    }
  }
  if (drift > 0) log.error({ drift }, "aggregate drift repaired");
  return { drift, users: profiles.length };
}
