import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness } from "./helpers.js";

let h: Awaited<ReturnType<typeof createHarness>>;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(() => h.prisma.$disconnect());

type U = Awaited<ReturnType<typeof h.user>>;
const snapshot = {
  name: "S",
  sections: [{ name: "A", tasks: [{ title: "T", type: "checkbox" }] }],
};
const planner = async (u: U) => (await u.post("/api/v1/planners", { name: "P" })).body.data;
const metric = async (u: U, kind = "quantity", key = "water") =>
  (await u.post("/api/v1/metrics", { key, label: "Water", kind })).body.data;

describe("sections", () => {
  it("renames, and deleting keeps the tasks", async () => {
    const u = await h.user();
    const p = await planner(u);
    const s = (await u.post(`/api/v1/planners/${p.id}/sections`, { name: "Old" })).body.data;
    const t = (
      await u.post(`/api/v1/planners/${p.id}/tasks`, { title: "Keep me", sectionId: s.id })
    ).body.data;
    const url = `/api/v1/planners/${p.id}/sections/${s.id}`;
    expect((await u.patch(url, { name: "New" })).body.data.name).toBe("New");
    expect((await u.delete(url)).status).toBe(204);
    const after = (await u.get(`/api/v1/planners/${p.id}`)).body.data;
    expect(after.sections).toHaveLength(0);
    expect(after.tasks.find((x: { id: string }) => x.id === t.id).sectionId).toBeNull();
    expect((await u.delete(url)).status).toBe(404);
  });
  it("refuses a section from another of the user's planners", async () => {
    const u = await h.user();
    const [a, b] = [await planner(u), await planner(u)];
    const s = (await u.post(`/api/v1/planners/${a.id}/sections`, { name: "A" })).body.data;
    expect((await u.patch(`/api/v1/planners/${b.id}/sections/${s.id}`, { name: "X" })).status).toBe(
      404,
    );
  });
});

describe("custom fields", () => {
  const field = async (u: U, plannerId: string) =>
    (
      await u.post(`/api/v1/planners/${plannerId}/fields`, {
        key: "effort",
        label: "Effort",
        type: "number",
        validation: { max: 5 },
      })
    ).body.data;

  it("edits the label and rules, but never the key or type", async () => {
    const u = await h.user();
    const p = await planner(u);
    const f = await field(u, p.id);
    const res = await u.patch(`/api/v1/planners/${p.id}/fields/${f.id}`, {
      label: "Energy",
      key: "hack",
      type: "text",
      validation: { max: 10 },
    });
    expect(res.body.data).toMatchObject({ label: "Energy", key: "effort", type: "number" });
    const t = await u.post(`/api/v1/planners/${p.id}/tasks`, { title: "T", fields: { effort: 8 } });
    expect(t.status).toBe(201);
  });
  it("deletes the field and its values, and frees the key", async () => {
    const u = await h.user();
    const p = await planner(u);
    const f = await field(u, p.id);
    const t = (
      await u.post(`/api/v1/planners/${p.id}/tasks`, { title: "T", fields: { effort: 3 } })
    ).body.data;
    expect((await u.delete(`/api/v1/planners/${p.id}/fields/${f.id}`)).status).toBe(204);
    expect(await h.prisma.fieldValue.count({ where: { taskId: t.id } })).toBe(0);
    expect((await field(u, p.id)).key).toBe("effort");
  });
});

describe("goals", () => {
  it("edits target and period, and recalculates progress", async () => {
    const u = await h.user();
    const m = await metric(u);
    const g = (
      await u.post("/api/v1/goals", { title: "G", target: 100, period: "daily", metricId: m.id })
    ).body.data;
    await u.post("/api/v1/metric-logs", { metricId: m.id, value: 50 });
    expect((await u.get(`/api/v1/goals/${g.id}`)).body.data.progress).toBeCloseTo(0.5);
    const res = await u.patch(`/api/v1/goals/${g.id}`, {
      title: "New",
      target: 200,
      period: "weekly",
    });
    expect(res.body.data).toMatchObject({ title: "New", target: 200, period: "weekly" });
    expect((await u.get(`/api/v1/goals/${g.id}`)).body.data.progress).toBeCloseTo(0.25);
    expect((await u.patch(`/api/v1/goals/${g.id}`, { target: -1 })).status).toBe(422);
  });
});

describe("metrics", () => {
  it("edits the label and unit, but never the key or kind", async () => {
    const u = await h.user();
    const m = await metric(u);
    const res = await u.patch(`/api/v1/metrics/${m.id}`, {
      label: "H2O",
      unit: "ml",
      key: "hack",
      kind: "text",
    });
    expect(res.body.data).toMatchObject({
      label: "H2O",
      unit: "ml",
      key: "water",
      kind: "quantity",
    });
  });
  it("refuses to delete a metric in use by a goal or chart, then frees its key", async () => {
    const u = await h.user();
    const m = await metric(u);
    const g = (
      await u.post("/api/v1/goals", { title: "G", target: 1, period: "daily", metricId: m.id })
    ).body.data;
    const widget = {
      title: "W",
      chartType: "line",
      querySpec: { source: "metric", measure: "sum", rangeDays: 7, metricId: m.id },
    };
    const d = (await u.post("/api/v1/dashboards", { name: "D", widgets: [widget] })).body.data;
    expect((await u.delete(`/api/v1/metrics/${m.id}`)).body.error.code).toBe("metric_in_use");
    await u.delete(`/api/v1/goals/${g.id}`);
    expect((await u.delete(`/api/v1/metrics/${m.id}`)).body.error.code).toBe("metric_in_use");
    await u.delete(`/api/v1/dashboards/${d.id}`);
    expect((await u.delete(`/api/v1/metrics/${m.id}`)).status).toBe(204);
    expect((await u.get("/api/v1/metrics")).body.data).toHaveLength(0);
    expect((await metric(u)).key).toBe("water");
  });
});

describe("metric logs", () => {
  const sum = async (u: U, metricId: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await u.post("/api/v1/analytics/query", {
      source: "metric",
      measure: "sum",
      metricId,
      from: today,
      to: today,
    });
    return res.body.data[0]?.value ?? null;
  };
  it("corrects a value, updates charts, and queues the aggregate rebuild", async () => {
    const u = await h.user();
    const m = await metric(u);
    const log = (await u.post("/api/v1/metric-logs", { metricId: m.id, value: 9999 })).body.data;
    expect((await u.patch(`/api/v1/metric-logs/${log.id}`, { value: 250 })).body.data.value).toBe(
      250,
    );
    expect(await sum(u, m.id)).toBe(250);
    expect(
      await h.prisma.outboxEvent.count({ where: { userId: u.id, type: "metric.logged" } }),
    ).toBe(2);
  });
  it("validates corrections against the metric's kind", async () => {
    const u = await h.user();
    const m = await metric(u, "rating", "mood");
    const log = (await u.post("/api/v1/metric-logs", { metricId: m.id, value: 5 })).body.data;
    expect((await u.patch(`/api/v1/metric-logs/${log.id}`, { value: 11 })).status).toBe(422);
  });
  it("deletes an entry and charts follow", async () => {
    const u = await h.user();
    const m = await metric(u);
    const log = (await u.post("/api/v1/metric-logs", { metricId: m.id, value: 10 })).body.data;
    expect((await u.delete(`/api/v1/metric-logs/${log.id}`)).status).toBe(204);
    expect(await sum(u, m.id)).toBeNull();
  });
});

describe("templates", () => {
  it("renames, and deleting leaves installed planners and versions intact", async () => {
    const u = await h.user();
    const t = (await u.post("/api/v1/templates", { name: "Mine", snapshot })).body.data;
    const p = (await u.post(`/api/v1/templates/${t.id}/instantiate`, {})).body.data;
    expect((await u.patch(`/api/v1/templates/${t.id}`, { name: "Renamed" })).body.data.name).toBe(
      "Renamed",
    );
    expect((await u.delete(`/api/v1/templates/${t.id}`)).status).toBe(204);
    expect((await u.get(`/api/v1/templates/${t.id}`)).status).toBe(404);
    expect((await u.get(`/api/v1/planners/${p.id}`)).status).toBe(200);
    expect(await h.prisma.templateVersion.count({ where: { templateId: t.id } })).toBe(1);
  });
  it("never lets a user change a starter template", async () => {
    const u = await h.user();
    await u.get("/api/v1/me");
    const starter = await h.prisma.template.create({
      data: {
        name: "Starter",
        visibility: "starter",
        versions: { create: { version: 1, snapshotJson: snapshot, checksum: "x" } },
      },
    });
    expect((await u.patch(`/api/v1/templates/${starter.id}`, { name: "Mine now" })).status).toBe(
      404,
    );
    expect((await u.delete(`/api/v1/templates/${starter.id}`)).status).toBe(404);
    await h.prisma.template.delete({ where: { id: starter.id } });
  });
});

describe("ownership of the new routes", () => {
  it("refuses every edit and delete from another user", async () => {
    const [owner, other] = [await h.user(), await h.user()];
    const p = await planner(owner);
    const s = (await owner.post(`/api/v1/planners/${p.id}/sections`, { name: "S" })).body.data;
    const f = (
      await owner.post(`/api/v1/planners/${p.id}/fields`, {
        key: "k",
        label: "K",
        type: "text",
        validation: {},
      })
    ).body.data;
    const m = await metric(owner);
    const log = (await owner.post("/api/v1/metric-logs", { metricId: m.id, value: 1 })).body.data;
    const g = (await owner.post("/api/v1/goals", { title: "G", target: 1, period: "daily" })).body
      .data;
    const t = (await owner.post("/api/v1/templates", { name: "T", snapshot })).body.data;
    const own = await metric(other, "quantity", "own");

    const attempts = [
      other.patch(`/api/v1/planners/${p.id}/sections/${s.id}`, { name: "X" }),
      other.delete(`/api/v1/planners/${p.id}/sections/${s.id}`),
      other.patch(`/api/v1/planners/${p.id}/fields/${f.id}`, { label: "X" }),
      other.delete(`/api/v1/planners/${p.id}/fields/${f.id}`),
      other.patch(`/api/v1/metrics/${m.id}`, { label: "X" }),
      other.delete(`/api/v1/metrics/${m.id}`),
      other.patch(`/api/v1/metric-logs/${log.id}`, { value: 2 }),
      other.delete(`/api/v1/metric-logs/${log.id}`),
      other.patch(`/api/v1/goals/${g.id}`, { title: "X" }),
      other.patch(`/api/v1/templates/${t.id}`, { name: "X" }),
      other.delete(`/api/v1/templates/${t.id}`),
    ];
    for (const attempt of attempts) expect((await attempt).status).toBe(404);
    expect((await owner.patch(`/api/v1/goals/${g.id}`, { metricId: own.id })).status).toBe(404);
    expect((await owner.get(`/api/v1/planners/${p.id}`)).body.data.sections[0].name).toBe("S");
    expect((await owner.get("/api/v1/metrics")).body.data[0].label).toBe("Water");
  });
});
