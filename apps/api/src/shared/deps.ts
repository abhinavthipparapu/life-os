import type { PrismaClient } from "@lifeos/db";
import type { Env } from "../config/env.js";
import type { TokenVerifier } from "../middleware/auth.js";

export interface Deps {
  prisma: PrismaClient;
  env: Env;
  verifyToken: TokenVerifier;
  checkReady?: () => Promise<void>;
}
