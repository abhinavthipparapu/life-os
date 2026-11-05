import { defineConfig, devices } from "@playwright/test";

// Runs against the real local stack, including Supabase Auth and the mail sink. Start it with `pnpm db:up`.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "pnpm exec tsx --env-file=../../.env src/server.ts",
      cwd: "../api",
      // Production behavior, so the admin test proves the real MFA path.
      env: { ADMIN_REQUIRE_MFA: "true" },
      url: "http://localhost:4000/health/ready",
      reuseExistingServer: false,
    },
    {
      command: "pnpm exec tsx --env-file=../../.env src/worker.ts",
      cwd: "../worker",
      wait: { stdout: /LifeOS worker started/ },
    },
    { command: "pnpm dev", url: "http://localhost:5173", reuseExistingServer: true },
  ],
});
