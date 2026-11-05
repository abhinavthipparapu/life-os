import { createFieldDefinition, createPlanner, createSection, createTask, listQuery, updatePlanner } from "@lifeos/contracts";
import { Router } from "express";
import { idempotent } from "../../middleware/idempotency.js";
import type { Deps } from "../../shared/deps.js";
import { param, parse, send, userId } from "../../shared/http.js";
import { taskService } from "../tasks/service.js";
import { plannerService } from "./service.js";

export function plannerRoutes({ prisma }: Deps) {
  const router = Router();
  const service = plannerService(prisma);
  const tasks = taskService(prisma);

  router.get("/", async (req, res) => {
    const { page, nextCursor } = await service.listPlanners(userId(req), parse(listQuery, req.query));
    send(res, page, { nextCursor });
  });
  router.post("/", idempotent(prisma), async (req, res) =>
    send(res, await service.createPlanner(userId(req), parse(createPlanner, req.body)), null, 201),
  );
  router.get("/:id", async (req, res) => send(res, await service.getPlanner(userId(req), param(req, "id"))));
  router.patch("/:id", async (req, res) =>
    send(res, await service.updatePlanner(userId(req), param(req, "id"), parse(updatePlanner, req.body))),
  );
  router.delete("/:id", async (req, res) => {
    await service.archivePlanner(userId(req), param(req, "id"));
    res.status(204).end();
  });
  router.post("/:id/clone", idempotent(prisma), async (req, res) =>
    send(res, await service.clonePlanner(userId(req), param(req, "id")), null, 201),
  );
  router.post("/:id/sections", async (req, res) =>
    send(res, await service.createSection(userId(req), param(req, "id"), parse(createSection, req.body)), null, 201),
  );
  router.post("/:id/fields", async (req, res) =>
    send(res, await service.createField(userId(req), param(req, "id"), parse(createFieldDefinition, req.body)), null, 201),
  );
  router.post("/:id/tasks", idempotent(prisma), async (req, res) =>
    send(res, await tasks.createTask(userId(req), param(req, "id"), parse(createTask, req.body)), null, 201),
  );
  return router;
}
