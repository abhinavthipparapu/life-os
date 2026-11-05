import { syncBatch, syncChangesQuery } from "@lifeos/contracts";
import { Router } from "express";
import type { Deps } from "../../shared/deps.js";
import { parse, send, userId } from "../../shared/http.js";
import { syncService } from "./service.js";

export function syncRoutes({ prisma }: Deps) {
  const router = Router();
  const service = syncService(prisma);
  router.post("/batch", async (req, res) => {
    const { operations } = parse(syncBatch, req.body);
    send(res, await service.applyBatch(userId(req), operations));
  });
  router.get("/changes", async (req, res) => {
    const { changes, nextCursor, hasMore } = await service.getChanges(userId(req), parse(syncChangesQuery, req.query));
    send(res, changes, { nextCursor, hasMore });
  });
  return router;
}
