import { accountDeletion, updatePreferences, updateProfile } from "@lifeos/contracts";
import { Router } from "express";
import { requireRecentAuth } from "../../middleware/auth.js";
import { limiter } from "../../middleware/rate-limit.js";
import { audit } from "../../shared/audit.js";
import type { Deps } from "../../shared/deps.js";
import { notFound, param, parse, send, userId } from "../../shared/http.js";

export function identityRoutes({ prisma, rateLimitStore }: Deps) {
  const router = Router();
  const accountLimit = limiter("account", 5, 3_600_000, rateLimitStore ?? (() => undefined));

  /** The worker fulfils the request from the outbox, so it survives an API restart. */
  const queueRequest = (id: string, kind: "export" | "deletion") =>
    prisma.$transaction(async (tx) => {
      const request = await tx.accountRequest.create({ data: { userId: id, kind } });
      await tx.outboxEvent.create({
        data: { userId: id, type: `account.${kind}`, payload: { requestId: request.id } },
      });
      await audit(tx, {
        actorId: id,
        action: `account.${kind}.request`,
        entityType: "account_request",
        entityId: request.id,
      });
      return request;
    });

  /** Metadata only, at most hourly per device, so a user can see where they are signed in. */
  const touchSession = async (id: string, userAgent: string | null) => {
    const hourAgo = new Date(Date.now() - 3_600_000);
    const { count } = await prisma.userSession.updateMany({
      where: { userId: id, userAgent, lastSeenAt: { lt: hourAgo } },
      data: { lastSeenAt: new Date() },
    });
    if (count > 0) return;
    const existing = await prisma.userSession.count({ where: { userId: id, userAgent } });
    if (existing === 0) await prisma.userSession.create({ data: { userId: id, userAgent } });
  };

  const getProfile = (id: string) =>
    prisma.profile.findUniqueOrThrow({
      where: { authUserId: id },
      include: { preferences: true },
    });

  router.get("/me", async (req, res) => {
    const id = userId(req);
    await touchSession(id, req.get("user-agent")?.slice(0, 200) ?? null);
    send(res, await getProfile(id));
  });

  router.patch("/me", async (req, res) => {
    const id = userId(req);
    const data = parse(updateProfile, req.body);
    await prisma.$transaction(async (tx) => {
      await tx.profile.update({ where: { authUserId: id }, data });
      await audit(tx, {
        actorId: id,
        action: "profile.update",
        entityType: "profile",
        entityId: id,
      });
    });
    send(res, await getProfile(id));
  });

  router.patch("/me/preferences", async (req, res) => {
    const id = userId(req);
    const data = parse(updatePreferences, req.body);
    await prisma.$transaction(async (tx) => {
      await tx.preference.update({ where: { userId: id }, data });
      await audit(tx, {
        actorId: id,
        action: "preferences.update",
        entityType: "preferences",
        entityId: id,
        metadata: { fields: Object.keys(data) },
      });
    });
    send(res, await getProfile(id));
  });

  router.get("/me/requests", async (req, res) =>
    send(
      res,
      await prisma.accountRequest.findMany({
        where: { userId: userId(req) },
        orderBy: { createdAt: "desc" },
        take: 20,
        omit: { resultJson: true },
      }),
    ),
  );
  router.get("/me/requests/:id/download", async (req, res) => {
    const request = await prisma.accountRequest.findFirst({
      where: { id: param(req, "id"), userId: userId(req), kind: "export", status: "completed" },
    });
    if (!request) throw notFound("Export");
    send(res, request.resultJson);
  });
  router.post("/me/export", accountLimit, requireRecentAuth, async (req, res) =>
    send(res, await queueRequest(userId(req), "export"), null, 202),
  );
  router.post("/me/deletion", accountLimit, requireRecentAuth, async (req, res) => {
    parse(accountDeletion, req.body);
    send(res, await queueRequest(userId(req), "deletion"), null, 202);
  });

  return router;
}
