import cors from "cors";
import express, { Router } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { requireAuth } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import { categoryRoutes } from "./modules/categories/routes.js";
import { identityRoutes } from "./modules/identity/routes.js";
import { plannerRoutes } from "./modules/planners/routes.js";
import { taskRoutes } from "./modules/tasks/routes.js";
import type { Deps } from "./shared/deps.js";

export function createApp(deps: Deps) {
  const { env, prisma } = deps;
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN.split(","), credentials: false, maxAge: 600 }));
  app.use(express.json({ limit: "256kb" }));
  if (env.NODE_ENV !== "test") {
    app.use(
      pinoHttp({
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

  const v1 = Router();
  v1.use(requireAuth(prisma, deps.verifyToken));
  v1.use(identityRoutes(deps));
  v1.use("/categories", categoryRoutes(deps));
  v1.use("/planners", plannerRoutes(deps));
  v1.use("/tasks", taskRoutes(deps));
  app.use("/api/v1", v1);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
