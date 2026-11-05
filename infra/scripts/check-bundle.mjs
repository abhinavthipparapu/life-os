#!/usr/bin/env node
// Fails if the browser bundle contains anything that looks like a server secret (section 7).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = "apps/web/dist";
const banned = [
  /service_role/,
  /SUPABASE_SERVICE_ROLE_KEY/,
  /DATABASE_URL/,
  /OPENAI_API_KEY/,
  /VAPID_PRIVATE_KEY/,
  /postgres(ql)?:\/\//,
  /sk-[A-Za-z0-9]{20,}/,
];
for (const name of [
  "POSTGRES_PASSWORD",
  "AUTH_JWT_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VAPID_PRIVATE_KEY",
  "OPENAI_API_KEY",
]) {
  const value = process.env[name];
  if (value && value.length > 8)
    banned.push(new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(js|mjs|css|html|json|webmanifest)$/.test(path)) files.push(path);
  }
};
walk(root);

const hits = files.flatMap((file) => {
  const text = readFileSync(file, "utf8");
  return banned
    .filter((pattern) => pattern.test(text))
    .map((pattern) => `${file}: ${pattern.source.slice(0, 40)}`);
});
if (hits.length) {
  console.error(`Possible secrets in the browser bundle:\n${hits.join("\n")}`);
  process.exit(1);
}
console.log(`Checked ${files.length} files. No server secrets found.`);
