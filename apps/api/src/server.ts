import { createPrisma } from "@lifeos/db";
import { createAiProvider } from "@lifeos/domain";
import { Redis } from "ioredis";
import { RedisStore, type RedisReply } from "rate-limit-redis";
import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { createTokenVerifier, remoteKeys } from "./middleware/auth.js";

const env = loadEnv();
const prisma = createPrisma(env.DATABASE_URL);
const verifyToken = createTokenVerifier({
  keys: remoteKeys(env.SUPABASE_URL),
  issuer: env.SUPABASE_JWT_ISSUER,
  audience: env.SUPABASE_JWT_AUDIENCE,
});

// Shared limits across instances. Without Redis each instance would count separately.
const redis = env.REDIS_URL ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 }) : null;
const rateLimitStore = (prefix: string) =>
  redis
    ? new RedisStore({
        prefix,
        sendCommand: (command: string, ...args: string[]) => redis.call(command, ...args) as Promise<RedisReply>,
      })
    : undefined;

const server = createApp({
  prisma,
  env,
  verifyToken,
  ai: createAiProvider(env),
  rateLimitStore,
  checkReady: async () => {
    await redis?.ping();
  },
}).listen(env.API_PORT, () => {
  console.log(`LifeOS API listening on port ${env.API_PORT}`);
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    server.close(() => void prisma.$disconnect().then(() => process.exit(0)));
  });
}
