#!/usr/bin/env node
// Post-deploy smoke test. Exits non-zero so the pipeline stops and the deploy can be rolled back.
const base = process.argv[2];
if (!base) throw new Error("Usage: smoke.mjs <api-url>");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function check(path, expected) {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const res = await fetch(`${base}${path}`).catch(() => null);
    if (res?.status === expected) return console.log(`ok ${path} -> ${expected}`);
    await delay(10_000);
  }
  throw new Error(`${path} did not return ${expected}`);
}

await check("/health/live", 200);
await check("/health/ready", 200);
await check("/api/v1/me", 401);
