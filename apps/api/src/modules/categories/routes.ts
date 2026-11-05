import { createCategory, reorderCategories, updateCategory } from "@lifeos/contracts";
import { Router } from "express";
import type { Deps } from "../../shared/deps.js";
import { param, parse, send, userId } from "../../shared/http.js";
import { categoryService } from "./service.js";

export function categoryRoutes({ prisma }: Deps) {
  const router = Router();
  const service = categoryService(prisma);

  router.get("/", async (req, res) => send(res, await service.listCategories(userId(req))));
  router.post("/", async (req, res) =>
    send(res, await service.createCategory(userId(req), parse(createCategory, req.body)), null, 201),
  );
  router.post("/reorder", async (req, res) => {
    const { orderedIds } = parse(reorderCategories, req.body);
    send(res, await service.reorderCategories(userId(req), orderedIds));
  });
  router.patch("/:id", async (req, res) =>
    send(res, await service.updateCategory(userId(req), param(req, "id"), parse(updateCategory, req.body))),
  );
  router.delete("/:id", async (req, res) => {
    await service.archiveCategory(userId(req), param(req, "id"));
    res.status(204).end();
  });
  return router;
}
