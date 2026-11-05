import { localDateOf } from "@lifeos/analytics-core";
import { LIMITS, type createTask, type reparentTask, type schedule, type updateTask } from "@lifeos/contracts";
import type { Prisma, PrismaClient } from "@lifeos/db";
import { materializeOccurrences, reconcileFutureOccurrences, validateRule } from "@lifeos/domain";
import type { z } from "zod";
import { audit } from "../../shared/audit.js";
import { badRequest, conflict, notFound } from "../../shared/http.js";
import { ownedPlanner } from "../planners/service.js";
import { writeFieldValues } from "./fields.js";

type Tx = Prisma.TransactionClient;
type ScheduleInput = z.output<typeof schedule>;

const toDate = (d: string) => new Date(`${d}T00:00:00Z`);

async function ownedTask(tx: Tx, userId: string, id: string) {
  const task = await tx.task.findFirst({ where: { id, userId, deletedAt: null } });
  if (!task) throw notFound("Task");
  return task;
}

async function assertSection(tx: Tx, plannerId: string, sectionId?: string | null) {
  if (!sectionId) return;
  const found = await tx.plannerSection.findFirst({ where: { id: sectionId, plannerId, deletedAt: null } });
  if (!found) throw notFound("Section");
}

/** Depth of `id` counted from the root (a root task is 1). Rejects a cycle if `movingId` is an ancestor. */
async function depthOf(tx: Tx, userId: string, plannerId: string, id: string, movingId?: string) {
  let depth = 0;
  let cursor: string | null = id;
  while (cursor) {
    if (cursor === movingId) throw badRequest("A task cannot be moved under itself", "cycle");
    const node: { parentTaskId: string | null; plannerId: string } | null = await tx.task.findFirst({
      where: { id: cursor, userId, deletedAt: null },
      select: { parentTaskId: true, plannerId: true },
    });
    if (!node || node.plannerId !== plannerId) throw notFound("Parent task");
    depth += 1;
    if (depth > LIMITS.maxTaskDepth + 1) throw badRequest("Task tree is too deep", "too_deep");
    cursor = node.parentTaskId;
  }
  return depth;
}

/** Height of the subtree rooted at `id`, counting the task itself. */
async function subtreeHeight(tx: Tx, id: string): Promise<number> {
  let height = 1;
  let level = [id];
  while (level.length) {
    const rows = await tx.task.findMany({
      where: { parentTaskId: { in: level }, deletedAt: null },
      select: { id: true },
    });
    if (rows.length) height += 1;
    level = rows.map((r) => r.id);
  }
  return height;
}

/** Parent must share planner and user, and the move must respect depth and child limits. */
async function validateHierarchy(tx: Tx, userId: string, plannerId: string, parentId: string, moving?: string) {
  const parentDepth = await depthOf(tx, userId, plannerId, parentId, moving);
  const height = moving ? await subtreeHeight(tx, moving) : 1;
  if (parentDepth + height > LIMITS.maxTaskDepth) {
    throw badRequest(`Tasks can nest at most ${LIMITS.maxTaskDepth} levels`, "too_deep");
  }
  const children = await tx.task.count({ where: { parentTaskId: parentId, deletedAt: null, NOT: moving ? { id: moving } : undefined } });
  if (children >= LIMITS.maxChildrenPerTask) {
    throw badRequest(`A task can have at most ${LIMITS.maxChildrenPerTask} subtasks`, "too_many_children");
  }
}

function assertRule(input: ScheduleInput) {
  const check = validateRule(input.rrule);
  if (!check.ok) throw badRequest(check.reason, "invalid_rrule");
  if (input.endsOn && input.endsOn < input.startsOn) throw badRequest("End date is before start date", "invalid_schedule");
}

const scheduleData = (input: ScheduleInput, timezone: string) => ({
  timezone: input.timezone ?? timezone,
  rrule: input.rrule,
  startsOn: toDate(input.startsOn),
  endsOn: input.endsOn ? toDate(input.endsOn) : null,
  localTime: input.localTime ?? null,
  reminderOffsets: input.reminderOffsets,
});

export function taskService(prisma: PrismaClient) {
  return {
    async getTask(userId: string, id: string) {
      const task = await prisma.task.findFirst({
        where: { id, userId, deletedAt: null },
        include: {
          schedules: { where: { deletedAt: null } },
          fieldValues: { include: { fieldDefinition: true } },
          children: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } },
          occurrences: { orderBy: { date: "desc" }, take: 30, include: { events: { orderBy: { createdAt: "desc" } } } },
        },
      });
      if (!task) throw notFound("Task");
      return task;
    },

    createTask: (userId: string, plannerId: string, input: z.output<typeof createTask>) =>
      prisma.$transaction(async (tx) => {
        const planner = await ownedPlanner(tx, userId, plannerId);
        await assertSection(tx, plannerId, input.sectionId);
        if (input.parentTaskId) await validateHierarchy(tx, userId, plannerId, input.parentTaskId);
        const total = await tx.task.count({ where: { plannerId, deletedAt: null } });
        if (total >= LIMITS.maxTasksPerPlanner) {
          throw badRequest(`A planner can hold at most ${LIMITS.maxTasksPerPlanner} tasks`, "too_many_tasks");
        }
        if (input.schedule) assertRule(input.schedule);
        const { schedule: scheduleInput, fields, ...data } = input;
        const sortOrder = await tx.task.count({
          where: { plannerId, parentTaskId: input.parentTaskId ?? null, deletedAt: null },
        });
        const task = await tx.task.create({ data: { ...data, userId, plannerId, sortOrder } });
        await writeFieldValues(tx, plannerId, task.id, fields ?? {}, true);
        if (scheduleInput) {
          const row = await tx.taskSchedule.create({
            data: { taskId: task.id, slot: scheduleInput.slot, ...scheduleData(scheduleInput, planner.timezone) },
          });
          await materializeOccurrences(tx, userId, row);
        }
        await audit(tx, { actorId: userId, action: "task.create", entityType: "task", entityId: task.id });
        return task;
      }),

    updateTask: (userId: string, id: string, input: z.output<typeof updateTask>) =>
      prisma.$transaction(async (tx) => {
        const current = await ownedTask(tx, userId, id);
        await assertSection(tx, current.plannerId, input.sectionId);
        const { expectedVersion, schedule: scheduleInput, fields, ...data } = input;
        if (scheduleInput) assertRule(scheduleInput);
        const { count } = await tx.task.updateMany({
          where: { id, userId, version: expectedVersion },
          data: { ...data, version: { increment: 1 } },
        });
        if (count === 0) throw conflict("This task was changed elsewhere", current);
        if (fields) await writeFieldValues(tx, current.plannerId, id, fields, false);
        if (scheduleInput !== undefined) {
          const planner = await ownedPlanner(tx, userId, current.plannerId);
          const existing = await tx.taskSchedule.findFirst({ where: { taskId: id, deletedAt: null } });
          if (scheduleInput === null) {
            if (existing) {
              await tx.taskSchedule.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
              const today = toDate(localDateOf(new Date(), existing.timezone));
              await tx.taskOccurrence.deleteMany({
                where: { taskId: id, status: "pending", date: { gte: today }, events: { none: {} } },
              });
            }
          } else {
            const row = await tx.taskSchedule.upsert({
              where: { taskId_slot: { taskId: id, slot: scheduleInput.slot } },
              create: { taskId: id, slot: scheduleInput.slot, ...scheduleData(scheduleInput, planner.timezone) },
              update: { ...scheduleData(scheduleInput, planner.timezone), deletedAt: null },
            });
            await reconcileFutureOccurrences(tx, userId, row);
          }
        }
        await audit(tx, { actorId: userId, action: "task.update", entityType: "task", entityId: id });
        return tx.task.findUniqueOrThrow({ where: { id } });
      }),

    moveTask: (userId: string, id: string, input: z.output<typeof reparentTask>) =>
      prisma.$transaction(async (tx) => {
        const current = await ownedTask(tx, userId, id);
        if (input.parentTaskId) {
          await validateHierarchy(tx, userId, current.plannerId, input.parentTaskId, id);
        }
        const { count } = await tx.task.updateMany({
          where: { id, userId, version: input.expectedVersion },
          data: {
            parentTaskId: input.parentTaskId,
            ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
            version: { increment: 1 },
          },
        });
        if (count === 0) throw conflict("This task was changed elsewhere", current);
        await audit(tx, {
          actorId: userId,
          action: "task.reparent",
          entityType: "task",
          entityId: id,
          metadata: { from: current.parentTaskId, to: input.parentTaskId },
        });
        return tx.task.findUniqueOrThrow({ where: { id } });
      }),

    archiveTask: (userId: string, id: string) =>
      prisma.$transaction(async (tx) => {
        await ownedTask(tx, userId, id);
        const ids = [id];
        for (let level = [id]; level.length; ) {
          const rows = await tx.task.findMany({
            where: { parentTaskId: { in: level }, deletedAt: null },
            select: { id: true },
          });
          level = rows.map((r) => r.id);
          ids.push(...level);
        }
        await tx.task.updateMany({ where: { id: { in: ids }, userId }, data: { deletedAt: new Date() } });
        await tx.taskOccurrence.deleteMany({
          where: { taskId: { in: ids }, userId, status: "pending", events: { none: {} } },
        });
        await audit(tx, { actorId: userId, action: "task.archive", entityType: "task", entityId: id });
      }),
  };
}
