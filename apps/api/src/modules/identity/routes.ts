import { updatePreferences, updateProfile } from "@lifeos/contracts";
import { Router } from "express";
import { audit } from "../../shared/audit.js";
import type { Deps } from "../../shared/deps.js";
import { parse, send, userId } from "../../shared/http.js";

export function identityRoutes({ prisma }: Deps) {
  const router = Router();

  const getProfile = (id: string) =>
    prisma.profile.findUniqueOrThrow({
      where: { authUserId: id },
      include: { preferences: true },
    });

  router.get("/me", async (req, res) => send(res, await getProfile(userId(req))));

  router.patch("/me", async (req, res) => {
    const id = userId(req);
    const data = parse(updateProfile, req.body);
    await prisma.$transaction(async (tx) => {
      await tx.profile.update({ where: { authUserId: id }, data });
      await audit(tx, { actorId: id, action: "profile.update", entityType: "profile", entityId: id });
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

  return router;
}
