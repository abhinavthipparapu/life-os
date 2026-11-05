import type { PrismaClient } from "@lifeos/db";
import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { AppError, userId } from "../shared/http.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** With an Idempotency-Key header, a retried create replays the first response and changes nothing. */
export function idempotent(prisma: PrismaClient): RequestHandler {
  return async (req, res, next) => {
    const key = req.get("Idempotency-Key");
    if (!key) return next();
    if (!UUID.test(key))
      throw new AppError(400, "invalid_idempotency_key", "Idempotency-Key must be a UUID");
    const owner = userId(req);
    const action = `${req.method} ${req.originalUrl}`.slice(0, 200);
    const where = { userId_clientOperationId: { userId: owner, clientOperationId: key } };
    try {
      await prisma.syncOperation.create({
        data: {
          userId: owner,
          clientOperationId: key,
          entityType: "http",
          entityId: randomUUID(),
          action,
          result: "accepted",
          occurredAt: new Date(),
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err;
      const prior = await prisma.syncOperation.findUniqueOrThrow({ where });
      if (prior.action !== action)
        throw new AppError(422, "idempotency_key_reused", "Key was used for another request");
      const stored = prior.responseJson as { status: number; body: unknown } | null;
      if (!stored)
        throw new AppError(409, "request_in_progress", "This request is still being processed");
      res.status(stored.status).json(stored.body);
      return;
    }
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      const save =
        res.statusCode < 400
          ? prisma.syncOperation.update({
              where,
              data: { responseJson: { status: res.statusCode, body: body as object } },
            })
          : prisma.syncOperation.delete({ where });
      save
        .catch((err: unknown) => req.log?.error({ err }, "idempotency record failed"))
        .finally(() => json(body));
      return res;
    };
    next();
  };
}
