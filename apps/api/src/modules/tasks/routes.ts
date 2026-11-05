import { reparentTask, updateTask } from "@lifeos/contracts";
import { Router } from "express";
import type { Deps } from "../../shared/deps.js";
import { param, parse, send, userId } from "../../shared/http.js";
import { taskService } from "./service.js";

export function taskRoutes({ prisma }: Deps) {
  const router = Router();
  const service = taskService(prisma);

  router.get("/:id", async (req, res) =>
    send(res, await service.getTask(userId(req), param(req, "id"))),
  );
  router.patch("/:id", async (req, res) =>
    send(res, await service.updateTask(userId(req), param(req, "id"), parse(updateTask, req.body))),
  );
  router.delete("/:id", async (req, res) => {
    await service.archiveTask(userId(req), param(req, "id"));
    res.status(204).end();
  });
  router.post("/:id/reparent", async (req, res) =>
    send(res, await service.moveTask(userId(req), param(req, "id"), parse(reparentTask, req.body))),
  );
  return router;
}
