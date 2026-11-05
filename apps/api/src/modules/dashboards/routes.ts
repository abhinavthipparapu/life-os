import { createDashboard, updateDashboard, type widget } from "@lifeos/contracts";
import type { Prisma, PrismaClient } from "@lifeos/db";
import { Router } from "express";
import type { z } from "zod";
import { audit } from "../../shared/audit.js";
import type { Deps } from "../../shared/deps.js";
import { notFound, param, parse, send, userId } from "../../shared/http.js";

type Widget = z.output<typeof widget>;
type Tx = Prisma.TransactionClient;

/** A saved widget can reference only this user's records, checked when it is saved. */
async function assertWidgets(tx: Tx, owner: string, widgets: Widget[]) {
  for (const { querySpec: q } of widgets) {
    const planner = q.plannerId
      ? await tx.planner.count({ where: { id: q.plannerId, userId: owner } })
      : 1;
    const category = q.categoryId
      ? await tx.category.count({ where: { id: q.categoryId, userId: owner } })
      : 1;
    const metric = q.metricId
      ? await tx.metricDefinition.count({ where: { id: q.metricId, userId: owner } })
      : 1;
    if (!planner || !category || !metric) throw notFound();
  }
}

const widgetRows = (widgets: Widget[]) =>
  widgets.map((w, i) => ({
    title: w.title,
    chartType: w.chartType,
    querySpecJson: w.querySpec,
    layoutJson: w.layout ?? { x: (i % 2) * 6, y: Math.floor(i / 2) * 4, w: 6, h: 4 },
  }));

const include = { widgets: { orderBy: { createdAt: "asc" as const } } };

function find(prisma: PrismaClient | Tx, owner: string, id: string) {
  return prisma.dashboard.findFirst({ where: { id, userId: owner, deletedAt: null }, include });
}

export function dashboardRoutes({ prisma }: Deps) {
  const router = Router();

  router.get("/", async (req, res) =>
    send(
      res,
      await prisma.dashboard.findMany({
        where: { userId: userId(req), deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 100,
        include,
      }),
    ),
  );
  router.post("/", async (req, res) => {
    const owner = userId(req);
    const input = parse(createDashboard, req.body);
    const dashboard = await prisma.$transaction(async (tx) => {
      await assertWidgets(tx, owner, input.widgets);
      const row = await tx.dashboard.create({
        data: { userId: owner, name: input.name, widgets: { create: widgetRows(input.widgets) } },
        include,
      });
      await audit(tx, {
        actorId: owner,
        action: "dashboard.create",
        entityType: "dashboard",
        entityId: row.id,
      });
      return row;
    });
    send(res, dashboard, null, 201);
  });
  router.get("/:id", async (req, res) => {
    const dashboard = await find(prisma, userId(req), param(req, "id"));
    if (!dashboard) throw notFound("Dashboard");
    send(res, dashboard);
  });
  router.patch("/:id", async (req, res) => {
    const owner = userId(req);
    const id = param(req, "id");
    const input = parse(updateDashboard, req.body);
    const dashboard = await prisma.$transaction(async (tx) => {
      if (!(await find(tx, owner, id))) throw notFound("Dashboard");
      if (input.widgets) {
        await assertWidgets(tx, owner, input.widgets);
        await tx.dashboardWidget.deleteMany({ where: { dashboardId: id } });
        await tx.dashboardWidget.createMany({
          data: widgetRows(input.widgets).map((w) => ({ ...w, dashboardId: id })),
        });
      }
      if (input.name) await tx.dashboard.update({ where: { id }, data: { name: input.name } });
      await audit(tx, {
        actorId: owner,
        action: "dashboard.update",
        entityType: "dashboard",
        entityId: id,
      });
      return find(tx, owner, id);
    });
    send(res, dashboard);
  });
  router.delete("/:id", async (req, res) => {
    const owner = userId(req);
    const id = param(req, "id");
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.dashboard.updateMany({
        where: { id, userId: owner, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (count === 0) throw notFound("Dashboard");
      await audit(tx, {
        actorId: owner,
        action: "dashboard.archive",
        entityType: "dashboard",
        entityId: id,
      });
    });
    res.status(204).end();
  });
  return router;
}
