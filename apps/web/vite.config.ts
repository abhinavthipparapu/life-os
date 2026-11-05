import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Only VITE_-prefixed values reach the browser, so server secrets in .env stay out of the bundle.
  envDir: resolve(import.meta.dirname, "../.."),
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
      "@lifeos/ui/components": resolve(import.meta.dirname, "../../packages/ui/src/components"),
      "@lifeos/ui/lib": resolve(import.meta.dirname, "../../packages/ui/src/lib"),
      "@lifeos/ui/hooks": resolve(import.meta.dirname, "../../packages/ui/src/hooks"),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src/offline",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: false,
      injectManifest: { globPatterns: ["**/*.{js,css,html,svg,woff2}"], maximumFileSizeToCacheInBytes: 4_000_000 },
      manifest: {
        name: "LifeOS",
        short_name: "LifeOS",
        description: "Plan your life your way, with planners you design yourself.",
        theme_color: "#1FAD82",
        background_color: "#F5F7FB",
        display: "standalone",
        start_url: "/app",
        icons: [{ src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
    }),
  ],
  server: { port: 5173, strictPort: true },
  test: { environment: "jsdom", setupFiles: ["./src/test-setup.ts"], exclude: ["e2e/**", "node_modules/**"] },
});
