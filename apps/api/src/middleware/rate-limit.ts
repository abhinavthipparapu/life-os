import type { RequestHandler } from "express";
import { rateLimit, type Store } from "express-rate-limit";
import type { ApiEnvelope } from "@lifeos/contracts";

export type StoreFactory = (prefix: string) => Store | undefined;

/** Keyed by user after auth, so one account cannot exhaust shared IP limits. Store is Redis in production. */
export function limiter(name: string, limit: number, windowMs: number, store: StoreFactory): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    store: store(`rl:${name}:`),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.id ?? req.ip ?? "unknown",
    validate: { keyGeneratorIpFallback: false },
    handler: (_req, res) => {
      const body: ApiEnvelope<never> = {
        data: null,
        meta: null,
        error: { type: "about:blank", title: "Too many requests", status: 429, code: "rate_limited" },
      };
      res.status(429).type("application/problem+json").json(body);
    },
  });
}
