import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { config } from "dotenv";

const root = resolve(import.meta.dirname, "../../..");

export default function setup() {
  config({ path: resolve(root, ".env"), quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !url.includes("lifeos_test"))
    throw new Error("TEST_DATABASE_URL must target lifeos_test");
  execSync("pnpm prisma migrate deploy", {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
