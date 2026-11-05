import { defineConfig } from "tsup";

// Workspace packages ship as TypeScript, so they are bundled into the deployable output.
export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  outDir: "dist",
  noExternal: [/^@lifeos\//],
  clean: true,
  // Bundled CommonJS dependencies such as pg call require, which ES modules lack by default.
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
});
