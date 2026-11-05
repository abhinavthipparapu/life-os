import { createTemplate, createTemplateVersion, instantiateTemplate } from "@lifeos/contracts";
import { Router } from "express";
import { z } from "zod";
import { idempotent } from "../../middleware/idempotency.js";
import type { Deps } from "../../shared/deps.js";
import { param, parse, send, userId } from "../../shared/http.js";
import { templateService } from "./service.js";

const versionQuery = z.object({ version: z.coerce.number().int().positive().optional() });
const searchQuery = z.object({ search: z.string().trim().max(120).optional() });

export function templateRoutes({ prisma }: Deps) {
  const router = Router();
  const service = templateService(prisma);

  router.get("/", async (req, res) =>
    send(res, await service.listTemplates(userId(req), parse(searchQuery, req.query).search)),
  );
  router.post("/", async (req, res) =>
    send(
      res,
      await service.createTemplate(userId(req), parse(createTemplate, req.body)),
      null,
      201,
    ),
  );
  router.get("/:id", async (req, res) => {
    const { version } = parse(versionQuery, req.query);
    send(res, await service.getVersion(userId(req), param(req, "id"), version));
  });
  router.post("/:id/versions", async (req, res) =>
    send(
      res,
      await service.createTemplateVersion(
        userId(req),
        param(req, "id"),
        parse(createTemplateVersion, req.body),
      ),
      null,
      201,
    ),
  );
  router.post("/:id/instantiate", idempotent(prisma), async (req, res) =>
    send(
      res,
      await service.instantiateTemplate(
        userId(req),
        param(req, "id"),
        parse(instantiateTemplate, req.body),
      ),
      null,
      201,
    ),
  );
  return router;
}
