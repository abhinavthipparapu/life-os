import { applyQuietHours } from "@lifeos/domain";
import type { JobContext } from "./context.js";
import { claimDelivery } from "./delivery.js";

const WINDOW_MS = 120_000;
const MAX_LEAD_MINUTES = 10_080;
const MINUTE = 60_000;

/** Finds reminders due in the window. The claim makes overlapping scans and retries deliver once. */
export async function scanRemindersJob(ctx: JobContext, now: Date = new Date()) {
  const { prisma } = ctx;
  const occurrences = await prisma.taskOccurrence.findMany({
    where: {
      status: "pending",
      scheduledAt: {
        gte: new Date(now.getTime() - WINDOW_MS),
        lte: new Date(now.getTime() + MAX_LEAD_MINUTES * MINUTE),
      },
      task: {
        deletedAt: null,
        schedules: { some: { deletedAt: null, NOT: { reminderOffsets: { isEmpty: true } } } },
      },
    },
    include: {
      task: {
        select: {
          title: true,
          schedules: { where: { deletedAt: null }, select: { slot: true, reminderOffsets: true } },
        },
      },
      user: { select: { timezone: true, preferences: true, pushSubscriptions: true } },
    },
    take: 1000,
  });

  const summary = { delivered: 0, quiet: 0 };
  for (const occurrence of occurrences) {
    const schedule = occurrence.task.schedules.find((s) => occurrence.slotKey.startsWith(s.slot));
    for (const offset of schedule?.reminderOffsets ?? []) {
      const due = occurrence.scheduledAt!.getTime() - offset * MINUTE;
      if (due > now.getTime() || due < now.getTime() - WINDOW_MS) continue;

      const prefs = occurrence.user.preferences;
      const quiet = applyQuietHours(
        now,
        occurrence.user.timezone,
        prefs?.quietHoursStart,
        prefs?.quietHoursEnd,
      );
      const claimed = await claimDelivery(prisma, {
        userId: occurrence.userId,
        jobName: "reminder",
        dedupeKey: `reminder:${occurrence.id}:${offset}`,
        status: quiet ? "quiet" : "delivered",
      });
      if (!claimed) continue;

      const message = {
        title: occurrence.task.title,
        body: offset === 0 ? "Due now" : `Starts in ${offset} minutes`,
        link: "/app/today",
      };
      // Quiet hours hold back the push only. The reminder still waits in the inbox.
      await prisma.notification.create({ data: { userId: occurrence.userId, ...message } });
      if (quiet) {
        summary.quiet += 1;
        continue;
      }
      summary.delivered += 1;
      if (!prefs?.pushEnabled) continue;
      for (const target of occurrence.user.pushSubscriptions) {
        try {
          const result = await ctx.sendPush(target, message);
          if (result === "gone")
            await prisma.pushSubscription.deleteMany({ where: { endpoint: target.endpoint } });
        } catch (err) {
          ctx.log.error({ err, occurrenceId: occurrence.id }, "push delivery failed");
        }
      }
    }
  }
  return summary;
}
