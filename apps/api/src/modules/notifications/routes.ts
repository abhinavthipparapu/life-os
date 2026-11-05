import { pageQuery } from "@lifeos/contracts";
import { Router } from "express";
import type { Deps } from "../../shared/deps.js";
import { notFound, paginate, param, parse, send, userId } from "../../shared/http.js";
import { achievementService } from "../achievements/service.js";

export function notificationRoutes({ prisma }: Deps) {
  const router = Router();
  router.get("/", async (req, res) => {
    const q = parse(pageQuery, req.query);
    const rows = await prisma.notification.findMany({
      where: { userId: userId(req) },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const { page, nextCursor } = paginate(rows, q.limit);
    send(res, page, { nextCursor });
  });
  router.post("/read-all", async (req, res) => {
    await prisma.notification.updateMany({
      where: { userId: userId(req), readAt: null },
      data: { readAt: new Date() },
    });
    res.status(204).end();
  });
  router.post("/:id/read", async (req, res) => {
    const { count } = await prisma.notification.updateMany({
      where: { id: param(req, "id"), userId: userId(req) },
      data: { readAt: new Date() },
    });
    if (count === 0) throw notFound("Notification");
    res.status(204).end();
  });
  return router;
}

export function achievementRoutes({ prisma }: Deps) {
  const router = Router();
  const service = achievementService(prisma);
  router.get("/", async (req, res) => send(res, await service.list(userId(req))));
  return router;
}
