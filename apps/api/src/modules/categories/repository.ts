import type { Prisma, PrismaClient } from "@lifeos/db";

type Db = PrismaClient | Prisma.TransactionClient;

/** Every method takes the owner id, so an unscoped query cannot be written by accident. */
export const categoryRepository = {
  list: (db: Db, userId: string) =>
    db.category.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
  find: (db: Db, userId: string, id: string) =>
    db.category.findFirst({ where: { id, userId, deletedAt: null } }),
  slugs: async (db: Db, userId: string) => {
    const rows = await db.category.findMany({ where: { userId }, select: { slug: true } });
    return new Set(rows.map((r) => r.slug));
  },
};
