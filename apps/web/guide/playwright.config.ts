import { defineConfig } from "@playwright/test";

// Wide enough for the desktop sidebar, which starts at 1024px.
const size = { width: 1120, height: 700 };

// Records the production build, so dev-only notices never appear. Run with `pnpm guide:record`.
export default defineConfig({
  testDir: ".",
  testMatch: "record.spec.ts",
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  outputDir: "/tmp/lifeos-guide/results",
  use: {
    baseURL: "http://localhost:5173",
    viewport: size,
    video: { mode: "on", size },
    timezoneId: "Asia/Kolkata",
    colorScheme: "light",
    reducedMotion: "no-preference",
  },
  webServer: [
    {
      command: "pnpm exec tsx --env-file=../../.env src/server.ts",
      cwd: "../../api",
      url: "http://localhost:4000/health/ready",
      reuseExistingServer: false,
    },
    {
      command: "pnpm exec tsx --env-file=../../.env src/worker.ts",
      cwd: "../../worker",
      wait: { stdout: /LifeOS worker started/ },
    },
    {
      command: "pnpm exec vite build && pnpm exec vite preview --port 5173 --strictPort",
      cwd: "..",
      url: "http://localhost:5173",
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
