import { deletePushSubscription, pushSubscription } from "@lifeos/contracts";
import { Router } from "express";
import type { Deps } from "../../shared/deps.js";
import { parse, send, userId } from "../../shared/http.js";

export function pushRoutes({ prisma }: Deps) {
  const router = Router();
  router.post("/", async (req, res) => {
    const owner = userId(req);
    const { endpoint, keys } = parse(pushSubscription, req.body);
    // A browser has one endpoint. Re-registering moves it to whoever is signed in now.
    const row = await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId: owner, endpoint, ...keys },
      update: { userId: owner, ...keys },
      select: { id: true, createdAt: true },
    });
    send(res, row, null, 201);
  });
  router.delete("/", async (req, res) => {
    const { endpoint } = parse(deletePushSubscription, req.body);
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: userId(req) } });
    res.status(204).end();
  });
  return router;
}
