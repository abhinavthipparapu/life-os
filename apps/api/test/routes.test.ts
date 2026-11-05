import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness } from "./helpers.js";

let h: Awaited<ReturnType<typeof createHarness>>;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(() => h.prisma.$disconnect());

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
  name: string;
  handle: { stack?: Layer[] };
  matchers?: ((path: string) => unknown)[];
  slash?: boolean;
}

const ID = "00000000-0000-4000-8000-000000000000";

/** Walks Express's real routing table, so a route added tomorrow is covered automatically. */
function collect(app: Express) {
  const routes: { method: string; path: string }[] = [];
  const mounts = ["/api/v1", "/api/v1/admin"];
  const walk = (stack: Layer[], prefix: string) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) {
          routes.push({ method, path: prefix + layer.route.path });
        }
      } else if (layer.handle.stack) {
        const mount = [
          "/categories",
          "/planners",
          "/tasks",
          "/occurrences",
          "/metrics",
          "/metric-logs",
          "/goals",
          "/dashboards",
          "/analytics",
          "/home",
          "/notifications",
          "/achievements",
          "/templates",
          "/ai",
          "/sync",
          "/push-subscriptions",
        ].find((m) => layer.matchers?.[0]?.(m) && !layer.matchers?.[0]?.("/no-such-mount"));
        const top = mounts.find(
          (m) => layer.matchers?.[0]?.(m) && !layer.matchers?.[0]?.("/no-such-mount"),
        );
        walk(layer.handle.stack, prefix + (top ?? mount ?? ""));
      }
    }
  };
  walk((app as unknown as { router: { stack: Layer[] } }).router.stack, "");
  return routes;
}

describe("every route", () => {
  it("finds the whole API", () => {
    const routes = collect(h.app).filter((r) => r.path.startsWith("/api/"));
    expect(routes.length).toBeGreaterThan(55);
    const paths = routes.map((r) => `${r.method.toUpperCase()} ${r.path}`);
    for (const expected of [
      "GET /api/v1/me",
      "POST /api/v1/categories/",
      "POST /api/v1/planners/:id/clone",
      "POST /api/v1/tasks/:id/reparent",
      "POST /api/v1/occurrences/:id/complete",
      "POST /api/v1/analytics/query",
      "POST /api/v1/ai/planner-drafts/:id/apply",
      "POST /api/v1/sync/batch",
      "GET /api/v1/sync/changes",
    ]) {
      expect(paths).toContain(expected);
    }
  });

  it("refuses anonymous callers on every route", async () => {
    const routes = collect(h.app).filter((r) => r.path.startsWith("/api/"));
    const open: string[] = [];
    for (const { method, path } of routes) {
      const url = path.replace(/:[a-z]+/gi, ID);
      const res = await (request(h.app) as unknown as Record<string, (u: string) => request.Test>)[
        method
      ]!(url);
      if (res.status !== 401) open.push(`${method} ${path} -> ${res.status}`);
    }
    expect(open).toEqual([]);
  });
});
