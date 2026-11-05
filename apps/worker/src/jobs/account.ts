import type { JobContext } from "./context.js";

type Json = Parameters<JobContext["prisma"]["accountRequest"]["update"]>[0]["data"]["resultJson"];

/** Gathers everything the user owns into a portable document. */
export async function runExport({ prisma }: JobContext, userId: string, requestId: string) {
  await prisma.accountRequest.update({ where: { id: requestId }, data: { status: "processing" } });
  const where = { userId };
  const [profile, categories, planners, metrics, metricLogs, goals, dashboards, achievements, occurrences] = await Promise.all([
    prisma.profile.findUniqueOrThrow({ where: { authUserId: userId }, include: { preferences: true } }),
    prisma.category.findMany({ where }),
    prisma.planner.findMany({
      where,
      include: { sections: true, fieldDefinitions: true, tasks: { include: { schedules: true, fieldValues: true } } },
    }),
    prisma.metricDefinition.findMany({ where }),
    prisma.metricLog.findMany({ where }),
    prisma.goal.findMany({ where, include: { milestones: true } }),
    prisma.dashboard.findMany({ where, include: { widgets: true } }),
    prisma.userAchievement.findMany({ where, include: { achievement: true } }),
    prisma.taskOccurrence.findMany({ where, include: { events: true } }),
  ]);
  const document = {
    exportedAt: new Date().toISOString(),
    profile,
    categories,
    planners,
    occurrences,
    metrics,
    metricLogs,
    goals,
    dashboards,
    achievements,
  };
  await prisma.accountRequest.update({
    where: { id: requestId },
    data: {
      status: "completed",
      completedAt: new Date(),
      resultJson: JSON.parse(JSON.stringify(document)) as Json,
    },
  });
}

/**
 * Blocks access first, then deletes the login, then the data. If a step fails the outbox retries
 * from the top, and every step is safe to repeat. The login goes before the data so that a person
 * can never sign back in to a half-deleted account.
 */
export async function runDeletion(ctx: JobContext, userId: string) {
  const { prisma } = ctx;
  const exists = await prisma.profile.findUnique({ where: { authUserId: userId } });
  if (!exists) return;
  await prisma.profile.update({ where: { authUserId: userId }, data: { deletedAt: new Date() } });
  await ctx.deleteAuthUser(userId);
  await prisma.$transaction(async (tx) => {
    // Audit rows are kept under retention policy but no longer point at the person.
    await tx.auditEvent.updateMany({ where: { actorId: userId }, data: { actorId: null } });
    await tx.jobDeliveryLog.updateMany({ where: { userId }, data: { userId: null } });
    await tx.profile.delete({ where: { authUserId: userId } });
    await tx.auditEvent.create({ data: { actorId: null, action: "account.deleted", entityType: "profile" } });
  });
}
