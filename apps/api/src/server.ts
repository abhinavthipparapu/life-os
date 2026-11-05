import { createPrisma } from "@lifeos/db";
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

const server = createApp({ prisma, env, verifyToken }).listen(env.API_PORT, () => {
  console.log(`LifeOS API listening on port ${env.API_PORT}`);
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    server.close(() => void prisma.$disconnect().then(() => process.exit(0)));
  });
}
