import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createPrisma } from "@lifeos/db";
import { createMockProvider, type AiProvider } from "@lifeos/domain";
import { config } from "dotenv";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import request from "supertest";
import { createApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { createTokenVerifier } from "../src/middleware/auth.js";

config({ path: resolve(import.meta.dirname, "../../../.env"), quiet: true });

export const ISSUER = "https://issuer.test/auth/v1";
export const AUDIENCE = "authenticated";

export async function createHarness(
  overrides: { ai?: AiProvider; env?: Record<string, string> } = {},
) {
  const databaseUrl = process.env.TEST_DATABASE_URL!;
  const env = loadEnv({
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl,
    SUPABASE_JWT_ISSUER: ISSUER,
    RATE_LIMIT_PER_MINUTE: "100000",
    ...overrides.env,
  });
  const prisma = createPrisma(databaseUrl);
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "test", alg: "ES256", use: "sig" };
  const verifyToken = createTokenVerifier({
    keys: createLocalJWKSet({ keys: [jwk] }),
    issuer: ISSUER,
    audience: AUDIENCE,
  });

  const sign = (
    claims: Record<string, unknown>,
    sub: string,
    over: { iss?: string; aud?: string; exp?: string; iat?: number } = {},
  ) =>
    new SignJWT({ role: "authenticated", ...claims })
      .setProtectedHeader({ alg: "ES256", kid: "test" })
      .setSubject(sub)
      .setIssuer(over.iss ?? ISSUER)
      .setAudience(over.aud ?? AUDIENCE)
      .setIssuedAt(over.iat)
      .setExpirationTime(over.exp ?? "1h")
      .sign(privateKey);

  const app = createApp({ prisma, env, verifyToken, ai: overrides.ai ?? createMockProvider() });

  /** A signed-in test user, with request helpers that carry their real signed token. */
  async function user() {
    const id = randomUUID();
    const token = await sign({ email: `${id}@test.local` }, id);
    const auth = { Authorization: `Bearer ${token}` };
    return {
      id,
      token,
      get: (url: string) => request(app).get(url).set(auth),
      post: (url: string, body: object = {}) => request(app).post(url).set(auth).send(body),
      patch: (url: string, body: object = {}) => request(app).patch(url).set(auth).send(body),
      delete: (url: string, body?: object) => request(app).delete(url).set(auth).send(body),
    };
  }
  return { app, prisma, sign, user };
}
