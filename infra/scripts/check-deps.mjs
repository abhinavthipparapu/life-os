#!/usr/bin/env node
// pnpm silently adds exclusions when a declared range needs a release newer than its cooling-off
// period. Those bypass the supply-chain policy, so CI fails if any appear.
import { readFileSync } from "node:fs";

if (readFileSync("pnpm-workspace.yaml", "utf8").includes("minimumReleaseAgeExclude")) {
  console.error("pnpm-workspace.yaml contains minimumReleaseAgeExclude. Pin an older version instead.");
  process.exit(1);
}
console.log("No release-age exclusions.");
