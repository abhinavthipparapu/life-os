import { LIMITS, type createCategory, type updateCategory } from "@lifeos/contracts";
import type { PrismaClient } from "@lifeos/db";
import type { z } from "zod";
import { audit } from "../../shared/audit.js";
import { badRequest, notFound } from "../../shared/http.js";
import { uniqueSlug } from "../../shared/slug.js";
import { categoryRepository as repo } from "./repository.js";

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/** Walks up from the proposed parent, rejecting foreign parents, cycles and excess depth. */
async function assertParent(tx: Tx, userId: string, parentId: string, selfId?: string) {
  let depth = 1;
  let cursor: string | null = parentId;
  while (cursor) {
    if (cursor === selfId) throw badRequest("A category cannot be its own ancestor", "cycle");
    const parent: { parentId: string | null } | null = await repo.find(tx, userId, cursor);
    if (!parent) throw notFound("Parent category");
    depth += 1;
    cursor = parent.parentId;
  }
  if (depth > LIMITS.maxCategoryDepth) throw badRequest("Categories are nested too deeply", "too_deep");
}

export function categoryService(prisma: PrismaClient) {
  return {
    listCategories: (userId: string) => repo.list(prisma, userId),

    createCategory: (userId: string, input: z.output<typeof createCategory>) =>
      prisma.$transaction(async (tx) => {
        if (input.parentId) await assertParent(tx, userId, input.parentId);
        const sortOrder = await tx.category.count({ where: { userId, deletedAt: null } });
        const category = await tx.category.create({
          data: { ...input, userId, sortOrder, slug: uniqueSlug(input.name, await repo.slugs(tx, userId)) },
        });
        await audit(tx, { actorId: userId, action: "category.create", entityType: "category", entityId: category.id });
        return category;
      }),

    updateCategory: (userId: string, id: string, input: z.output<typeof updateCategory>) =>
      prisma.$transaction(async (tx) => {
        if (!(await repo.find(tx, userId, id))) throw notFound("Category");
        if (input.parentId) await assertParent(tx, userId, input.parentId, id);
        const category = await tx.category.update({ where: { id }, data: input });
        await audit(tx, { actorId: userId, action: "category.update", entityType: "category", entityId: id });
        return category;
      }),

    reorderCategories: (userId: string, orderedIds: string[]) =>
      prisma.$transaction(async (tx) => {
        const owned = await tx.category.count({ where: { userId, deletedAt: null, id: { in: orderedIds } } });
        if (owned !== new Set(orderedIds).size) throw notFound("Category");
        for (const [sortOrder, id] of orderedIds.entries()) {
          await tx.category.update({ where: { id }, data: { sortOrder } });
        }
        await audit(tx, { actorId: userId, action: "category.reorder", entityType: "category" });
        return repo.list(tx, userId);
      }),

    archiveCategory: (userId: string, id: string) =>
      prisma.$transaction(async (tx) => {
        if (!(await repo.find(tx, userId, id))) throw notFound("Category");
        await tx.category.update({ where: { id }, data: { deletedAt: new Date() } });
        await audit(tx, { actorId: userId, action: "category.archive", entityType: "category", entityId: id });
      }),
  };
}
