import { streaks } from "@lifeos/analytics-core";
import { ACHIEVEMENTS } from "@lifeos/contracts";
import type { Prisma, PrismaClient } from "@lifeos/db";
import { dailyCounts } from "@lifeos/domain";

type Tx = Prisma.TransactionClient;

async function awardAchievement(tx: Tx, userId: string, key: string) {
  const spec = ACHIEVEMENTS.find((a) => a.key === key)!;
  const achievement = await tx.achievement.upsert({ where: { key }, update: {}, create: spec });
  const { count } = await tx.userAchievement.createMany({
    data: [{ userId, achievementId: achievement.id }],
    skipDuplicates: true,
  });
  return count > 0 ? achievement : null;
}

export interface Celebration {
  dayComplete: boolean;
  plannerCompleted: { id: string; name: string } | null;
  achievements: { key: string; title: string; description: string; icon: string }[];
}

/** Runs after the state change, so a celebration only ever reports a committed result. */
export async function evaluateMilestones(
  tx: Tx,
  userId: string,
  date: string,
  today: string,
  plannerId: string,
): Promise<Celebration> {
  const earned: string[] = [];
  const total = await tx.taskOccurrence.count({ where: { userId, status: "completed" } });
  if (total >= 1) earned.push("first_completion");
  if (total >= 100) earned.push("total_100");

  const days = await dailyCounts(tx, userId, "2000-01-01", today);
  const day = days.find((d) => d.date === date);
  const dayComplete = Boolean(day && day.eligible > 0 && day.completed >= day.eligible);
  if (dayComplete) earned.push("perfect_day");
  const { current } = streaks(days, today);
  if (current >= 7) earned.push("streak_7");
  if (current >= 30) earned.push("streak_30");

  const achievements = [];
  for (const key of earned) {
    const awarded = await awardAchievement(tx, userId, key);
    if (awarded) achievements.push(awarded);
  }

  // completedAt is set once, so the hero sequence plays only the first time.
  let plannerCompleted: Celebration["plannerCompleted"] = null;
  const remaining = await tx.taskOccurrence.count({
    where: { userId, status: "pending", task: { plannerId, deletedAt: null } },
  });
  // Every task needs an outcome, so ticking one task in a mostly unscheduled planner is not "done".
  const untouched = await tx.task.count({
    where: {
      userId,
      plannerId,
      deletedAt: null,
      occurrences: { none: { status: { in: ["completed", "skipped", "rest"] } } },
    },
  });
  if (remaining === 0 && untouched === 0) {
    const { count } = await tx.planner.updateMany({
      where: { id: plannerId, userId, completedAt: null },
      data: { completedAt: new Date() },
    });
    if (count > 0) {
      const planner = await tx.planner.findUniqueOrThrow({ where: { id: plannerId } });
      plannerCompleted = { id: planner.id, name: planner.name };
    }
  }
  return {
    dayComplete,
    plannerCompleted,
    achievements: achievements.map(({ key, title, description, icon }) => ({
      key,
      title,
      description,
      icon,
    })),
  };
}

export function achievementService(prisma: PrismaClient) {
  return {
    list: (userId: string) =>
      prisma.userAchievement.findMany({
        where: { userId },
        include: { achievement: true },
        orderBy: { awardedAt: "desc" },
      }),
  };
}
