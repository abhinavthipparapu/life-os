import {
  createMetric,
  createMetricLog,
  metricLogQuery,
  seriesQuery,
  updateMetric,
  updateMetricLog,
} from "@lifeos/contracts";
import { Router } from "express";
import type { Deps } from "../../shared/deps.js";
import { param, parse, send, userId } from "../../shared/http.js";
import { metricService } from "./service.js";

export function metricRoutes({ prisma }: Deps) {
  const router = Router();
  const service = metricService(prisma);
  router.get("/", async (req, res) => send(res, await service.list(userId(req))));
  router.post("/", async (req, res) =>
    send(res, await service.defineMetric(userId(req), parse(createMetric, req.body)), null, 201),
  );
  router.patch("/:id", async (req, res) =>
    send(
      res,
      await service.updateMetric(userId(req), param(req, "id"), parse(updateMetric, req.body)),
    ),
  );
  router.delete("/:id", async (req, res) => {
    await service.archiveMetric(userId(req), param(req, "id"));
    res.status(204).end();
  });
  router.get("/:id/series", async (req, res) => {
    const { from, to, grain } = parse(seriesQuery, req.query);
    send(res, await service.getSeries(userId(req), param(req, "id"), from, to, grain));
  });
  return router;
}

export function metricLogRoutes({ prisma }: Deps) {
  const router = Router();
  const service = metricService(prisma);
  router.get("/", async (req, res) => {
    const { page, nextCursor } = await service.listLogs(
      userId(req),
      parse(metricLogQuery, req.query),
    );
    send(res, page, { nextCursor });
  });
  router.post("/", async (req, res) =>
    send(res, await service.recordValue(userId(req), parse(createMetricLog, req.body)), null, 201),
  );
  router.patch("/:id", async (req, res) =>
    send(
      res,
      await service.updateLog(userId(req), param(req, "id"), parse(updateMetricLog, req.body)),
    ),
  );
  router.delete("/:id", async (req, res) => {
    await service.deleteLog(userId(req), param(req, "id"));
    res.status(204).end();
  });
  return router;
}
