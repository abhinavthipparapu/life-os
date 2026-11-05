import { aggregate, goalProgress, localDateOf } from "@lifeos/analytics-core";
import type { createGoal } from "@lifeos/contracts";
import type { PrismaClient } from "@lifeos/db";
import type { z } from "zod";
import { audit } from "../../shared/audit.js";
import { notFound } from "../../shared/http.js";
import { userTimezone } from "../analytics/service.js";

function periodStart(period: string, today: string, startsOn: Date | null): string {
  const d = new Date(`${today}T00:00:00Z`);
  if (period === "weekly") d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  if (period === "monthly") d.setUTCDate(1);
  if (period === "yearly") d.setUTCMonth(0, 1);
  if (period === "total") return startsOn ? startsOn.toISOString().slice(0, 10) : "2000-01-01";
  return d.toISOString().slice(0, 10);
}

export function goalService(prisma: PrismaClient) {
  type GoalRow = NonNullable<Awaited<ReturnType<typeof fetchGoal>>>;
  const fetchGoal = (userId: string, id: string) =>
    prisma.goal.findFirst({
      where: { id, userId, deletedAt: null },
      include: { metric: true, milestones: { orderBy: { threshold: "asc" } } },
    });

  async function calculateProgress(userId: string, goal: GoalRow, today: string) {
    if (!goal.metricId || !goal.metric) return { ...goal, current: 0, progress: 0 };
    const from = periodStart(goal.period, today, goal.startsOn);
    const logs = await prisma.metricLog.findMany({
      where: {
        userId,
        metricId: goal.metricId,
        localDate: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${today}T00:00:00Z`) },
      },
      orderBy: { recordedAt: "asc" },
      select: { value: true },
    });
    const values = logs.flatMap((l) => (l.value === null ? [] : [l.value]));
    const current = aggregate(values, goal.metric.aggregation) ?? 0;
    const reached = goal.milestones.filter((m) => !m.reachedAt && current >= m.threshold);
    if (reached.length) {
      await prisma.goalMilestone.updateMany({
        where: { id: { in: reached.map((m) => m.id) }, goalId: goal.id },
        data: { reachedAt: new Date() },
      });
    }
    return { ...goal, current, progress: goalProgress(current, goal.target), periodStart: from };
  }

  return {
    async list(userId: string) {
      const today = localDateOf(new Date(), await userTimezone(prisma, userId));
      const goals = await prisma.goal.findMany({
        where: { userId, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { metric: true, milestones: { orderBy: { threshold: "asc" } } },
      });
      return Promise.all(goals.map((g) => calculateProgress(userId, g, today)));
    },

    async get(userId: string, id: string) {
      const goal = await fetchGoal(userId, id);
      if (!goal) throw notFound("Goal");
      const today = localDateOf(new Date(), await userTimezone(prisma, userId));
      return calculateProgress(userId, goal, today);
    },

    createGoal: (userId: string, input: z.output<typeof createGoal>) =>
      prisma.$transaction(async (tx) => {
        if (input.metricId) {
          const owned = await tx.metricDefinition.findFirst({
            where: { id: input.metricId, userId, deletedAt: null },
          });
          if (!owned) throw notFound("Metric");
        }
        const { milestones, startsOn, endsOn, ...data } = input;
        const goal = await tx.goal.create({
          data: {
            ...data,
            userId,
            startsOn: startsOn ? new Date(`${startsOn}T00:00:00Z`) : null,
            endsOn: endsOn ? new Date(`${endsOn}T00:00:00Z`) : null,
            milestones: milestones ? { create: milestones } : undefined,
          },
          include: { milestones: true },
        });
        await audit(tx, {
          actorId: userId,
          action: "goal.create",
          entityType: "goal",
          entityId: goal.id,
        });
        return goal;
      }),

    archive: (userId: string, id: string) =>
      prisma.$transaction(async (tx) => {
        const { count } = await tx.goal.updateMany({
          where: { id, userId, deletedAt: null },
          data: { deletedAt: new Date() },
        });
        if (count === 0) throw notFound("Goal");
        await audit(tx, {
          actorId: userId,
          action: "goal.archive",
          entityType: "goal",
          entityId: id,
        });
      }),
  };
}
