import { adminAuditQuery, adminRevoke, adminUserLookup } from "@lifeos/contracts";
import { Router } from "express";
import { audit } from "../../shared/audit.js";
import type { Deps } from "../../shared/deps.js";
import { notFound, paginate, param, parse, send, userId } from "../../shared/http.js";

const HOUR_MS = 3_600_000;

/** Mounted behind requireRole. Every lookup is itself audited. */
export function adminRoutes({ prisma }: Deps) {
  const router = Router();

  router.get("/audit-events", async (req, res) => {
    const q = parse(adminAuditQuery, req.query);
    const rows = await prisma.auditEvent.findMany({
      where: { ...(q.actorId ? { actorId: q.actorId } : {}), ...(q.action ? { action: q.action } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const { page, nextCursor } = paginate(rows, q.limit);
    send(res, page, { nextCursor });
  });

  // Support sees account status only, never the user's plans or tracked data.
  router.get("/users", async (req, res) => {
    const { email } = parse(adminUserLookup, req.query);
    const users = await prisma.profile.findMany({
      where: { email: { equals: email, mode: "insensitive" } },
      take: 5,
      select: { authUserId: true, email: true, role: true, createdAt: true, accessRevokedAt: true, deletedAt: true },
    });
    await audit(prisma, { actorId: userId(req), action: "admin.user_lookup", entityType: "profile", metadata: { found: users.length } });
    send(res, users);
  });

  router.post("/users/:id/revoke", async (req, res) => {
    const actor = userId(req);
    const id = param(req, "id");
    const { reason } = parse(adminRevoke, req.body);
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.profile.updateMany({
        where: { authUserId: id, accessRevokedAt: null },
        data: { accessRevokedAt: new Date() },
      });
      if (count === 0) throw notFound("User");
      await audit(tx, { actorId: actor, action: "admin.revoke_access", entityType: "profile", entityId: id, metadata: { reason } });
    });
    res.status(204).end();
  });

  router.get("/jobs/health", async (_req, res) => {
    const since = new Date(Date.now() - 24 * HOUR_MS);
    const [pendingOutbox, oldest, failures, recent] = await Promise.all([
      prisma.outboxEvent.count({ where: { processedAt: null } }),
      prisma.outboxEvent.findFirst({ where: { processedAt: null }, orderBy: { id: "asc" }, select: { createdAt: true } }),
      prisma.jobDeliveryLog.count({ where: { status: "failed", createdAt: { gte: since } } }),
      prisma.jobDeliveryLog.groupBy({ by: ["jobName", "status"], where: { createdAt: { gte: since } }, _count: true }),
    ]);
    send(res, {
      pendingOutbox,
      oldestPendingSeconds: oldest ? Math.round((Date.now() - oldest.createdAt.getTime()) / 1000) : 0,
      failuresLast24h: failures,
      jobs: recent.map((r) => ({ job: r.jobName, status: r.status, count: r._count })),
    });
  });
  return router;
}
