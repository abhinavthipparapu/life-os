import { analyticsRange, querySpec } from "@lifeos/contracts";
import { Router } from "express";
import type { Deps } from "../../shared/deps.js";
import { parse, send, userId } from "../../shared/http.js";
import { analyticsService } from "./service.js";

export function analyticsRoutes({ prisma }: Deps) {
  const router = Router();
  const service = analyticsService(prisma);

  router.post("/query", async (req, res) => {
    const { points, meta } = await service.querySeries(userId(req), parse(querySpec, req.body));
    send(res, points, meta);
  });
  router.get("/adherence", async (req, res) => {
    const { from, to, ...scope } = parse(analyticsRange, req.query);
    send(res, await service.computeAdherence(userId(req), from, to, scope));
  });
  return router;
}

export function homeRoutes({ prisma }: Deps) {
  const router = Router();
  const service = analyticsService(prisma);
  router.get("/", async (req, res) => send(res, await service.home(userId(req))));
  return router;
}
