import { randomUUID } from "node:crypto";
import cors from "cors";
import express, { Router } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { requireAuth, requireRole } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import { limiter } from "./middleware/rate-limit.js";
import { adminRoutes } from "./modules/admin/routes.js";
import { aiRoutes } from "./modules/ai/routes.js";
import { analyticsRoutes, homeRoutes } from "./modules/analytics/routes.js";
import { categoryRoutes } from "./modules/categories/routes.js";
import { dashboardRoutes } from "./modules/dashboards/routes.js";
import { goalRoutes } from "./modules/goals/routes.js";
import { identityRoutes } from "./modules/identity/routes.js";
import { metricLogRoutes, metricRoutes } from "./modules/metrics/routes.js";
import { achievementRoutes, notificationRoutes } from "./modules/notifications/routes.js";
import { occurrenceRoutes } from "./modules/occurrences/routes.js";
import { plannerRoutes } from "./modules/planners/routes.js";
import { pushRoutes } from "./modules/push/routes.js";
import { syncRoutes } from "./modules/sync/routes.js";
import { taskRoutes } from "./modules/tasks/routes.js";
import { templateRoutes } from "./modules/templates/routes.js";
import type { Deps } from "./shared/deps.js";

export function createApp(deps: Deps) {
  const { env, prisma } = deps;
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN.split(","), credentials: false, maxAge: 600 }));
  app.use(express.json({ limit: "256kb" }));
  // Echoed to the client, so a user's error report can be matched to server logs.
  app.use((req, res, next) => {
    const id = /^[\w-]{8,64}$/.test(req.get("x-request-id") ?? "") ? req.get("x-request-id")! : randomUUID();
    res.setHeader("x-request-id", id);
    req.requestId = id;
    next();
  });
  if (env.NODE_ENV !== "test") {
    app.use(
      pinoHttp({
        genReqId: (req) => (req as express.Request).requestId ?? randomUUID(),
        redact: ["req.headers.authorization", "req.headers.cookie"],
        customProps: (req) => ({ userId: (req as express.Request).user?.id }),
      }),
    );
  }

  app.get("/health/live", (_req, res) => void res.json({ status: "ok" }));
  app.get("/health/ready", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      await deps.checkReady?.();
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });

  const store = deps.rateLimitStore ?? (() => undefined);
  const perMinute = env.RATE_LIMIT_PER_MINUTE;
  const MINUTE = 60_000;
  const auth = requireAuth(prisma, deps.verifyToken);

  // Separate tree, so a request reaches admin code only after the role check.
  const requireMfa = env.ADMIN_REQUIRE_MFA ?? env.NODE_ENV === "production";
  app.use(
    "/api/v1/admin",
    auth,
    limiter("admin", 60, MINUTE, store),
    requireRole(["admin", "support"], requireMfa),
    adminRoutes(deps),
  );

  const v1 = Router();
  v1.use(limiter("ip", perMinute * 2, MINUTE, store));
  v1.use(auth);
  v1.use(limiter("user", perMinute, MINUTE, store));
  v1.use(identityRoutes(deps));
  v1.use("/categories", categoryRoutes(deps));
  v1.use("/planners", plannerRoutes(deps));
  v1.use("/tasks", taskRoutes(deps));
  v1.use("/occurrences", occurrenceRoutes(deps));
  v1.use("/metrics", metricRoutes(deps));
  v1.use("/metric-logs", metricLogRoutes(deps));
  v1.use("/goals", goalRoutes(deps));
  v1.use("/dashboards", dashboardRoutes(deps));
  v1.use("/analytics", analyticsRoutes(deps));
  v1.use("/home", homeRoutes(deps));
  v1.use("/notifications", notificationRoutes(deps));
  v1.use("/achievements", achievementRoutes(deps));
  v1.use("/templates", limiter("templates", 60, MINUTE, store), templateRoutes(deps));
  v1.use("/ai", limiter("ai", 20, MINUTE, store), aiRoutes(deps));
  v1.use("/sync", limiter("sync", 120, MINUTE, store), syncRoutes(deps));
  v1.use("/push-subscriptions", pushRoutes(deps));
  app.use("/api/v1", v1);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
