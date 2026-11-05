import type { createFieldDefinition, createPlanner, createSection, listQuery, updatePlanner } from "@lifeos/contracts";
import type { Prisma, PrismaClient } from "@lifeos/db";
import type { z } from "zod";
import { audit } from "../../shared/audit.js";
import { AppError, conflict, notFound, paginate } from "../../shared/http.js";
import { uniqueSlug } from "../../shared/slug.js";
import { materializeSnapshot, plannerSlugs, plannerToSnapshot } from "./snapshot.js";

type Db = PrismaClient | Prisma.TransactionClient;

export async function ownedPlanner(db: Db, userId: string, id: string) {
  const planner = await db.planner.findFirst({ where: { id, userId, deletedAt: null } });
  if (!planner) throw notFound("Planner");
  return planner;
}

async function assertCategory(db: Db, userId: string, categoryId?: string | null) {
  if (!categoryId) return;
  const found = await db.category.findFirst({ where: { id: categoryId, userId, deletedAt: null } });
  if (!found) throw notFound("Category");
}

export function plannerService(prisma: PrismaClient) {
  return {
    async listPlanners(userId: string, q: z.output<typeof listQuery>) {
      const rows = await prisma.planner.findMany({
        where: {
          userId,
          deletedAt: null,
          ...(q.categoryId ? { categoryId: q.categoryId } : {}),
          ...(q.search ? { name: { contains: q.search, mode: "insensitive" as const } } : {}),
        },
        orderBy: [{ [q.sort]: q.order }, { id: "asc" }],
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        include: { category: { select: { id: true, name: true, color: true } }, _count: { select: { tasks: { where: { deletedAt: null } } } } },
      });
      return paginate(rows, q.limit);
    },

    async getPlanner(userId: string, id: string) {
      const planner = await prisma.planner.findFirst({
        where: { id, userId, deletedAt: null },
        include: {
          sections: { where: { deletedAt: null }, orderBy: { position: "asc" } },
          fieldDefinitions: { where: { deletedAt: null } },
          tasks: {
            where: { deletedAt: null },
            orderBy: { sortOrder: "asc" },
            include: { schedules: { where: { deletedAt: null } }, fieldValues: true },
          },
        },
      });
      if (!planner) throw notFound("Planner");
      return planner;
    },

    createPlanner: (userId: string, input: z.output<typeof createPlanner>) =>
      prisma.$transaction(async (tx) => {
        await assertCategory(tx, userId, input.categoryId);
        const profile = await tx.profile.findUniqueOrThrow({ where: { authUserId: userId } });
        const planner = await tx.planner.create({
          data: {
            ...input,
            userId,
            timezone: input.timezone ?? profile.timezone,
            slug: uniqueSlug(input.name, await plannerSlugs(tx, userId)),
          },
        });
        await audit(tx, { actorId: userId, action: "planner.create", entityType: "planner", entityId: planner.id });
        return planner;
      }),

    updatePlanner: (userId: string, id: string, input: z.output<typeof updatePlanner>) =>
      prisma.$transaction(async (tx) => {
        const current = await ownedPlanner(tx, userId, id);
        await assertCategory(tx, userId, input.categoryId);
        const { expectedVersion, ...data } = input;
        const { count } = await tx.planner.updateMany({
          where: { id, userId, version: expectedVersion },
          data: { ...data, version: { increment: 1 } },
        });
        if (count === 0) throw conflict("This planner was changed elsewhere", current);
        await audit(tx, { actorId: userId, action: "planner.update", entityType: "planner", entityId: id });
        return tx.planner.findUniqueOrThrow({ where: { id } });
      }),

    archivePlanner: (userId: string, id: string) =>
      prisma.$transaction(async (tx) => {
        await ownedPlanner(tx, userId, id);
        await tx.planner.update({ where: { id }, data: { deletedAt: new Date() } });
        await audit(tx, { actorId: userId, action: "planner.archive", entityType: "planner", entityId: id });
      }),

    clonePlanner: (userId: string, id: string) =>
      prisma.$transaction(
        async (tx) => {
          const source = await ownedPlanner(tx, userId, id);
          const snapshot = await plannerToSnapshot(tx, userId, id);
          const clone = await materializeSnapshot(tx, snapshot, {
            userId,
            timezone: source.timezone,
            categoryId: source.categoryId,
            name: `${source.name} (copy)`,
          });
          await audit(tx, {
            actorId: userId,
            action: "planner.clone",
            entityType: "planner",
            entityId: clone.id,
            metadata: { sourceId: id },
          });
          return clone;
        },
        { timeout: 20_000 },
      ),

    createSection: (userId: string, plannerId: string, input: z.output<typeof createSection>) =>
      prisma.$transaction(async (tx) => {
        await ownedPlanner(tx, userId, plannerId);
        const position = input.position ?? (await tx.plannerSection.count({ where: { plannerId, deletedAt: null } }));
        const section = await tx.plannerSection.create({ data: { plannerId, name: input.name, position } });
        await audit(tx, { actorId: userId, action: "section.create", entityType: "section", entityId: section.id });
        return section;
      }),

    createField: (userId: string, plannerId: string, input: z.output<typeof createFieldDefinition>) =>
      prisma.$transaction(async (tx) => {
        await ownedPlanner(tx, userId, plannerId);
        const taken = await tx.fieldDefinition.findUnique({ where: { plannerId_key: { plannerId, key: input.key } } });
        if (taken) throw new AppError(409, "duplicate_key", "A field with this key already exists");
        const field = await tx.fieldDefinition.create({
          data: { plannerId, key: input.key, label: input.label, type: input.type, validationJson: input.validation },
        });
        await audit(tx, { actorId: userId, action: "field.create", entityType: "field", entityId: field.id });
        return field;
      }),
  };
}
