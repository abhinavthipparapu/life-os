import { createGoal } from "@lifeos/contracts";
import { Router } from "express";
import type { Deps } from "../../shared/deps.js";
import { param, parse, send, userId } from "../../shared/http.js";
import { goalService } from "./service.js";

export function goalRoutes({ prisma }: Deps) {
  const router = Router();
  const service = goalService(prisma);
  router.get("/", async (req, res) => send(res, await service.list(userId(req))));
  router.post("/", async (req, res) =>
    send(res, await service.createGoal(userId(req), parse(createGoal, req.body)), null, 201),
  );
  router.get("/:id", async (req, res) =>
    send(res, await service.get(userId(req), param(req, "id"))),
  );
  router.delete("/:id", async (req, res) => {
    await service.archive(userId(req), param(req, "id"));
    res.status(204).end();
  });
  return router;
}
