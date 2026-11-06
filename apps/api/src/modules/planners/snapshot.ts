import {
  normalizeTaskTarget,
  plannerSnapshot,
  type PlannerSnapshot,
  type PlanTask,
} from "@lifeos/contracts";
import type { Prisma } from "@lifeos/db";
import { validateRule, materializeOccurrences } from "@lifeos/domain";
import { localDateOf } from "@lifeos/analytics-core";
import { badRequest, notFound } from "../../shared/http.js";
import { uniqueSlug } from "../../shared/slug.js";

type Tx = Prisma.TransactionClient;

export async function plannerSlugs(tx: Tx, userId: string) {
  const rows = await tx.planner.findMany({ where: { userId }, select: { slug: true } });
  return new Set(rows.map((r) => r.slug));
}

interface TaskRow {
  id: string;
  parentTaskId: string | null;
  sectionId: string | null;
  title: string;
  description: string | null;
  type: PlanTask["type"];
  targetValue: number | null;
  targetUnit: string | null;
  sortOrder: number;
  schedules: { rrule: string; localTime: string | null }[];
}

/** Reads a planner into the portable shape used for clones, templates and AI drafts. */
export async function plannerToSnapshot(
  tx: Tx,
  userId: string,
  plannerId: string,
): Promise<PlannerSnapshot> {
  const planner = await tx.planner.findFirst({
    where: { id: plannerId, userId, deletedAt: null },
    include: {
      sections: { where: { deletedAt: null }, orderBy: { position: "asc" } },
      fieldDefinitions: { where: { deletedAt: null } },
      tasks: {
        where: { deletedAt: null },
        orderBy: { sortOrder: "asc" },
        include: { schedules: { where: { deletedAt: null } } },
      },
    },
  });
  if (!planner) throw notFound("Planner");
  const toPlan = (t: TaskRow): PlanTask => ({
    title: t.title,
    description: t.description,
    type: t.type,
    targetValue: t.targetValue,
    targetUnit: t.targetUnit,
    rrule: t.schedules[0]?.rrule ?? null,
    localTime: t.schedules[0]?.localTime ?? null,
    children: planner.tasks.filter((c) => c.parentTaskId === t.id).map(toPlan),
  });
  const roots = planner.tasks.filter((t) => !t.parentTaskId);
  const sections = planner.sections.map((s) => ({
    name: s.name,
    tasks: roots.filter((t) => t.sectionId === s.id).map(toPlan),
  }));
  const loose = roots.filter((t) => !t.sectionId).map(toPlan);
  if (loose.length || sections.length === 0) sections.push({ name: "Tasks", tasks: loose });
  return plannerSnapshot.parse({
    name: planner.name,
    description: planner.description,
    color: planner.color,
    icon: planner.icon,
    sections,
    fields: planner.fieldDefinitions.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      validation: f.validationJson,
    })),
  });
}

interface MaterializeOptions {
  userId: string;
  timezone: string;
  categoryId?: string | null;
  name?: string;
  startsOn?: string;
}

/** Copies a snapshot into new user-owned rows. Call inside a transaction so a copy is all-or-nothing. */
export async function materializeSnapshot(
  tx: Tx,
  snapshot: PlannerSnapshot,
  options: MaterializeOptions,
) {
  const { userId, timezone } = options;
  const startsOn = options.startsOn ?? localDateOf(new Date(), timezone);
  if (options.categoryId) {
    const owned = await tx.category.findFirst({
      where: { id: options.categoryId, userId, deletedAt: null },
    });
    if (!owned) throw notFound("Category");
  }
  const name = options.name ?? snapshot.name;
  const planner = await tx.planner.create({
    data: {
      userId,
      name,
      slug: uniqueSlug(name, await plannerSlugs(tx, userId)),
      description: snapshot.description ?? null,
      categoryId: options.categoryId ?? null,
      timezone,
      color: snapshot.color,
      icon: snapshot.icon,
    },
  });
  if (snapshot.fields?.length) {
    await tx.fieldDefinition.createMany({
      data: snapshot.fields.map((f) => ({
        plannerId: planner.id,
        key: f.key,
        label: f.label,
        type: f.type,
        validationJson: f.validation,
      })),
    });
  }
  const insert = async (
    task: PlanTask,
    sectionId: string,
    parentTaskId: string | null,
    sortOrder: number,
  ) => {
    const created = await tx.task.create({
      data: {
        userId,
        plannerId: planner.id,
        sectionId,
        parentTaskId,
        sortOrder,
        title: task.title,
        description: task.description ?? null,
        type: task.type,
        ...normalizeTaskTarget(task),
      },
    });
    if (task.rrule) {
      const check = validateRule(task.rrule);
      if (!check.ok) throw badRequest(`"${task.title}": ${check.reason}`, "invalid_rrule");
      const schedule = await tx.taskSchedule.create({
        data: {
          taskId: created.id,
          timezone,
          rrule: task.rrule,
          startsOn: new Date(`${startsOn}T00:00:00Z`),
          localTime: task.localTime ?? null,
        },
      });
      await materializeOccurrences(tx, userId, schedule);
    }
    for (const [i, child] of (task.children ?? []).entries()) {
      await insert(child, sectionId, created.id, i);
    }
  };
  for (const [position, section] of snapshot.sections.entries()) {
    const row = await tx.plannerSection.create({
      data: { plannerId: planner.id, name: section.name, position },
    });
    for (const [i, task] of section.tasks.entries()) await insert(task, row.id, null, i);
  }
  return planner;
}
