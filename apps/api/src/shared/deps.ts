import type { PrismaClient } from "@lifeos/db";
import type { AiProvider } from "@lifeos/domain";
import type { Env } from "../config/env.js";
import type { TokenVerifier } from "../middleware/auth.js";
import type { StoreFactory } from "../middleware/rate-limit.js";

export interface Deps {
  prisma: PrismaClient;
  env: Env;
  verifyToken: TokenVerifier;
  ai: AiProvider;
  rateLimitStore?: StoreFactory;
  checkReady?: () => Promise<void>;
}
