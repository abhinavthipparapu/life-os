import { localDateOf } from "@lifeos/analytics-core";
import { addDays, materializeOccurrences } from "@lifeos/domain";
import type { JobContext } from "./context.js";

const LOW_WATER_DAYS = 30;
const BATCH = 200;

/** Keeps every active schedule 30 to 60 days ahead. Safe to repeat: inserts skip existing keys. */
export async function generateOccurrencesJob({ prisma, log }: JobContext, now: Date = new Date()) {
  const threshold = new Date(`${addDays(localDateOf(now, "UTC"), LOW_WATER_DAYS)}T00:00:00Z`);
  let created = 0;
  let cursor: string | undefined;
  for (;;) {
    const schedules = await prisma.taskSchedule.findMany({
      where: {
        deletedAt: null,
        OR: [{ generatedUntil: null }, { generatedUntil: { lt: threshold } }],
        task: { deletedAt: null, planner: { deletedAt: null } },
      },
      include: { task: { select: { userId: true } } },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const schedule of schedules) {
      created += await prisma.$transaction((tx) => materializeOccurrences(tx, schedule.task.userId, schedule, now));
    }
    if (schedules.length < BATCH) break;
    cursor = schedules[schedules.length - 1]!.id;
  }
  log.info({ created }, "occurrences generated");
  return created;
}
