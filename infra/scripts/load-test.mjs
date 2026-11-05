#!/usr/bin/env node
// Small load test for the hot read and write paths. Usage: node load-test.mjs [concurrency] [seconds]
const concurrency = Number(process.argv[2] ?? 20);
const seconds = Number(process.argv[3] ?? 15);
const { VITE_API_URL: api, SUPABASE_URL: auth, SEED_DEMO_PASSWORD: password } = process.env;

const login = await fetch(`${auth}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "demo@lifeos.local", password }),
});
const { access_token: token } = await login.json();
const headers = { Authorization: `Bearer ${token}`, "content-type": "application/json" };
const today = new Date().toISOString().slice(0, 10);
const paths = ["/api/v1/home", `/api/v1/occurrences?from=${today}&to=${today}`, "/api/v1/planners"];

const timings = [];
let failures = 0;
const end = Date.now() + seconds * 1000;
await Promise.all(
  Array.from({ length: concurrency }, async (_, worker) => {
    for (let i = worker; Date.now() < end; i += 1) {
      const started = performance.now();
      const res = await fetch(`${api}${paths[i % paths.length]}`, { headers }).catch(() => null);
      await res?.arrayBuffer();
      timings.push(performance.now() - started);
      if (!res?.ok) failures += 1;
    }
  }),
);
timings.sort((a, b) => a - b);
const p = (q) => Math.round(timings[Math.floor(timings.length * q)] ?? 0);
console.log(
  `${timings.length} requests, ${Math.round(timings.length / seconds)}/s, p50 ${p(0.5)}ms, p95 ${p(0.95)}ms, p99 ${p(0.99)}ms, ${failures} failed`,
);
