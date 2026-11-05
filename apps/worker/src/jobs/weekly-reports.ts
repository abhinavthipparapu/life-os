import {
  buildInsightContext,
  estimateUsage,
  INSIGHT_SYSTEM,
  monthlyTokensUsed,
} from "@lifeos/domain";
import type { JobContext } from "./context.js";
import { claimDelivery } from "./delivery.js";

const OUTPUT_TOKENS = 400;

function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return `${d.getUTCFullYear()}-W${Math.ceil(((d.getTime() - start) / 86_400_000 + 1) / 7)}`;
}

/** Runs only for opted-in users, inside their monthly budget, and never includes sensitive metrics. */
export async function weeklyReportsJob(ctx: JobContext, now: Date = new Date()) {
  const { prisma, ai } = ctx;
  const users = await prisma.preference.findMany({
    where: { aiWeeklyReportOptIn: true, user: { deletedAt: null, accessRevokedAt: null } },
    select: { userId: true, user: { select: { timezone: true } } },
  });
  const summary = { sent: 0, overBudget: 0 };
  for (const { userId, user } of users) {
    const context = await buildInsightContext(prisma, userId, user.timezone, 7, false);
    const estimated = estimateUsage(INSIGHT_SYSTEM, context.prompt) + OUTPUT_TOKENS;
    if ((await monthlyTokensUsed(prisma, userId, now)) + estimated > ctx.aiMonthlyBudget) {
      summary.overBudget += 1;
      continue;
    }
    const claimed = await claimDelivery(prisma, {
      userId,
      jobName: "weekly-report",
      dedupeKey: `weekly:${userId}:${isoWeek(now)}`,
      status: "delivered",
    });
    if (!claimed) continue;
    let body = "";
    const stream = ai.streamText(INSIGHT_SYSTEM, context.prompt, OUTPUT_TOKENS);
    for (;;) {
      const next = await stream.next();
      if (next.done) {
        await prisma.aiUsage.create({
          data: {
            userId,
            feature: "weekly_report",
            model: next.value.model,
            tokens: next.value.tokens,
          },
        });
        break;
      }
      body += next.value;
    }
    await prisma.notification.create({
      data: {
        userId,
        title: "Your weekly report",
        body: body.trim().slice(0, 2000),
        link: "/app/analytics",
      },
    });
    summary.sent += 1;
  }
  return summary;
}
