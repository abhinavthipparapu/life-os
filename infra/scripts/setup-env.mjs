#!/usr/bin/env node
// Creates a local .env with random secrets and an ES256 signing key. Never overwrites an existing file.
import { existsSync, writeFileSync } from "node:fs";
import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";

if (existsSync(".env")) {
  console.log(".env already exists, leaving it unchanged.");
  process.exit(0);
}
const secret = (n = 24) => randomBytes(n).toString("hex");
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = {
  ...privateKey.export({ format: "jwk" }),
  kid: randomUUID(),
  alg: "ES256",
  use: "sig",
  key_ops: ["sign", "verify"],
};
const pg = secret();
const lines = [
  `POSTGRES_PASSWORD=${pg}`,
  `AUTH_DB_PASSWORD=${secret()}`,
  `AUTH_JWT_SECRET=${secret(32)}`,
  `AUTH_JWT_KEYS='${JSON.stringify([jwk])}'`,
  `DATABASE_URL=postgresql://lifeos:${pg}@127.0.0.1:54322/lifeos`,
  `TEST_DATABASE_URL=postgresql://lifeos:${pg}@127.0.0.1:54322/lifeos_test`,
  `REDIS_URL=redis://127.0.0.1:56379`,
  `SUPABASE_URL=http://127.0.0.1:54321`,
  `SUPABASE_JWT_ISSUER=http://127.0.0.1:54321/auth/v1`,
  `SUPABASE_JWT_AUDIENCE=authenticated`,
  `WEB_ORIGIN=http://localhost:5173`,
  `API_PORT=4000`,
  `AI_PROVIDER=mock`,
  `VITE_API_URL=http://localhost:4000`,
  `VITE_SUPABASE_URL=http://127.0.0.1:54321`,
];
writeFileSync(".env", lines.join("\n") + "\n", { mode: 0o600 });
console.log("Created .env with local-only secrets.");
