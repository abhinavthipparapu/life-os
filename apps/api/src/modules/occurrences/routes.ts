import { completeOccurrence, deferOccurrence, occurrenceQuery, reopenOccurrence, skipOccurrence } from "@lifeos/contracts";
import { Router } from "express";
import type { Deps } from "../../shared/deps.js";
import { param, parse, send, userId } from "../../shared/http.js";
import { occurrenceService } from "./service.js";

export function occurrenceRoutes({ prisma }: Deps) {
  const router = Router();
  const service = occurrenceService(prisma);

  router.get("/", async (req, res) => {
    const { from, to, plannerId } = parse(occurrenceQuery, req.query);
    send(res, await service.list(userId(req), from, to, plannerId));
  });
  router.post("/:id/complete", async (req, res) => {
    const input = parse(completeOccurrence, req.body);
    const { occurrence, celebration } = await service.act(userId(req), param(req, "id"), "complete", input);
    send(res, occurrence, { celebration });
  });
  router.post("/:id/skip", async (req, res) => {
    const input = parse(skipOccurrence, req.body);
    const { occurrence } = await service.act(userId(req), param(req, "id"), "skip", input);
    send(res, occurrence);
  });
  router.post("/:id/reopen", async (req, res) => {
    const input = parse(reopenOccurrence, req.body);
    const { occurrence } = await service.act(userId(req), param(req, "id"), "reopen", input);
    send(res, occurrence);
  });
  router.post("/:id/defer", async (req, res) =>
    send(res, await service.defer(userId(req), param(req, "id"), parse(deferOccurrence, req.body)), null, 201),
  );
  return router;
}
