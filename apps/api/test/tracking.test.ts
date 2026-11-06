import { localDateOf } from "@lifeos/analytics-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness } from "./helpers.js";

let h: Awaited<ReturnType<typeof createHarness>>;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(() => h.prisma.$disconnect());

type U = Awaited<ReturnType<typeof h.user>>;
const today = localDateOf(new Date(), "UTC");
const shift = (n: number) =>
  new Date(Date.parse(today) + n * 86_400_000).toISOString().slice(0, 10);

async function dailyTask(u: U, title = "Daily", rrule = "FREQ=DAILY;COUNT=1") {
  const p = (await u.post("/api/v1/planners", { name: `P ${title}`, timezone: "UTC" })).body.data;
  const t = (
    await u.post(`/api/v1/planners/${p.id}/tasks`, { title, schedule: { rrule, startsOn: today } })
  ).body.data;
  const occurrences = (
    await u.get(`/api/v1/occurrences?from=${today}&to=${today}&plannerId=${p.id}`)
  ).body.data;
  return { planner: p, task: t, occurrence: occurrences[0] };
}
const backdated = (
  taskId: string,
  userId: string,
  offset: number,
  status: "completed" | "pending" | "rest" | "skipped",
) =>
  h.prisma.taskOccurrence.create({
    data: { userId, taskId, slotKey: "past", date: new Date(`${shift(offset)}T00:00:00Z`), status },
  });

describe("occurrence lifecycle", () => {
  it("completes idempotently, with one event for repeated requests", async () => {
    const u = await h.user();
    const { occurrence: o } = await dailyTask(u);
    const url = `/api/v1/occurrences/${o.id}/complete`;
    const results = await Promise.all([u.post(url), u.post(url), u.post(url)]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    const events = await h.prisma.taskEvent.findMany({ where: { occurrenceId: o.id } });
    expect(events).toHaveLength(1);
    const row = await h.prisma.taskOccurrence.findUniqueOrThrow({ where: { id: o.id } });
    expect(row.status).toBe("completed");
    expect(row.version).toBe(2);
  });
  it("records complete, reopen and skip as an audit trail", async () => {
    const u = await h.user();
    const { occurrence: o } = await dailyTask(u);
    await u.post(`/api/v1/occurrences/${o.id}/complete`, { value: 3, note: "ok" });
    await u.post(`/api/v1/occurrences/${o.id}/reopen`);
    await u.post(`/api/v1/occurrences/${o.id}/skip`, { reason: "Travelling" });
    const events = await h.prisma.taskEvent.findMany({
      where: { occurrenceId: o.id },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((e) => e.action)).toEqual(["complete", "reopen", "skip"]);
    expect(events[2]!.reason).toBe("Travelling");
    expect(
      await h.prisma.outboxEvent.count({ where: { userId: u.id, type: "occurrence.changed" } }),
    ).toBe(3);
  });
  it("requires a reason to skip", async () => {
    const u = await h.user();
    const { occurrence: o } = await dailyTask(u);
    expect((await u.post(`/api/v1/occurrences/${o.id}/skip`, {})).status).toBe(422);
  });
  it("returns the current record on a version conflict", async () => {
    const u = await h.user();
    const { occurrence: o } = await dailyTask(u);
    await u.post(`/api/v1/occurrences/${o.id}/skip`, { reason: "x" });
    const res = await u.post(`/api/v1/occurrences/${o.id}/complete`, { expectedVersion: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.current.status).toBe("skipped");
  });
  it("defers by closing the original and creating a new occurrence", async () => {
    const u = await h.user();
    const { occurrence: o, task: t } = await dailyTask(u);
    const res = await u.post(`/api/v1/occurrences/${o.id}/defer`, {
      toDate: shift(2),
      reason: "Busy",
    });
    expect(res.status).toBe(201);
    const original = await h.prisma.taskOccurrence.findUniqueOrThrow({ where: { id: o.id } });
    expect(original.status).toBe("not_applicable");
    const rows = await h.prisma.taskOccurrence.findMany({ where: { taskId: t.id } });
    expect(rows).toHaveLength(2);
    const events = await h.prisma.taskEvent.findMany({ where: { occurrenceId: o.id } });
    expect(events.map((e) => e.action)).toEqual(["defer"]);
  });
  it("reports the day milestone, achievements and one-time planner completion", async () => {
    const u = await h.user();
    const { occurrence: o, planner: p } = await dailyTask(u);
    const first = await u.post(`/api/v1/occurrences/${o.id}/complete`);
    const c = first.body.meta.celebration;
    expect(c.dayComplete).toBe(true);
    expect(c.plannerCompleted.id).toBe(p.id);
    expect(c.achievements.map((a: { key: string }) => a.key).sort()).toEqual([
      "first_completion",
      "perfect_day",
    ]);
    await u.post(`/api/v1/occurrences/${o.id}/reopen`);
    const again = await u.post(`/api/v1/occurrences/${o.id}/complete`);
    expect(again.body.meta.celebration.plannerCompleted).toBeNull();
    expect(again.body.meta.celebration.achievements).toEqual([]);
  });
  it("keeps achievements after a reopen, since nothing is ever lost", async () => {
    const u = await h.user();
    const { occurrence: o } = await dailyTask(u);
    await u.post(`/api/v1/occurrences/${o.id}/complete`);
    await u.post(`/api/v1/occurrences/${o.id}/reopen`);
    expect((await u.get("/api/v1/achievements")).body.data.length).toBeGreaterThan(0);
  });
});

describe("ticking a task from the planner", () => {
  const unscheduled = async (u: U, titles: string[]) => {
    const p = (await u.post("/api/v1/planners", { name: "Loose", timezone: "UTC" })).body.data;
    const tasks = [];
    for (const title of titles)
      tasks.push((await u.post(`/api/v1/planners/${p.id}/tasks`, { title })).body.data);
    return { planner: p, tasks };
  };

  it("creates one occurrence for an unscheduled task, however often it is asked", async () => {
    const u = await h.user();
    const { tasks } = await unscheduled(u, ["Call the bank"]);
    const results = await Promise.all(
      [1, 2, 3].map(() => u.post(`/api/v1/tasks/${tasks[0].id}/today`)),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(new Set(results.map((r) => r.body.data.id)).size).toBe(1);
    expect(results[0]!.body.data.task.planner.name).toBe("Loose");
    expect(await h.prisma.taskOccurrence.count({ where: { taskId: tasks[0].id } })).toBe(1);
  });
  it("returns today's scheduled occurrence instead of adding a second one", async () => {
    const u = await h.user();
    const { task: t, occurrence: o } = await dailyTask(u);
    expect((await u.post(`/api/v1/tasks/${t.id}/today`)).body.data.id).toBe(o.id);
  });
  it("refuses a repeating task that is not due today, so stats stay honest", async () => {
    const u = await h.user();
    const p = (await u.post("/api/v1/planners", { name: "Later", timezone: "UTC" })).body.data;
    const t = (
      await u.post(`/api/v1/planners/${p.id}/tasks`, {
        title: "Next week",
        schedule: { rrule: "FREQ=DAILY", startsOn: shift(7) },
      })
    ).body.data;
    const res = await u.post(`/api/v1/tasks/${t.id}/today`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("not_due_today");
  });
  it("celebrates a planner only once every task has an outcome", async () => {
    const u = await h.user();
    const { planner: p, tasks } = await unscheduled(u, ["One", "Two"]);
    const tick = async (id: string) => {
      const o = (await u.post(`/api/v1/tasks/${id}/today`)).body.data;
      return (await u.post(`/api/v1/occurrences/${o.id}/complete`)).body.meta.celebration;
    };
    expect((await tick(tasks[0].id)).plannerCompleted).toBeNull();
    expect((await tick(tasks[1].id)).plannerCompleted.id).toBe(p.id);
  });
  it("hides this route from other users", async () => {
    const [owner, other] = [await h.user(), await h.user()];
    const { tasks } = await unscheduled(owner, ["Mine"]);
    expect((await other.post(`/api/v1/tasks/${tasks[0].id}/today`)).status).toBe(404);
    expect(await h.prisma.taskOccurrence.count({ where: { taskId: tasks[0].id } })).toBe(0);
  });
});

describe("metrics and goals", () => {
  const metric = async (u: U, kind = "quantity", key = "water") =>
    (await u.post("/api/v1/metrics", { key, label: "Water", kind, unit: "ml" })).body.data;

  it("validates values against the metric kind", async () => {
    const u = await h.user();
    const m = await metric(u, "rating", "mood");
    const log = (value: number) => u.post("/api/v1/metric-logs", { metricId: m.id, value });
    expect((await log(11)).status).toBe(422);
    expect((await log(7)).status).toBe(201);
  });
  it("rejects duplicate metric keys", async () => {
    const u = await h.user();
    await metric(u);
    expect(
      (await u.post("/api/v1/metrics", { key: "water", label: "W", kind: "quantity" })).status,
    ).toBe(409);
  });
  it("stores the local date from the user's timezone, not UTC", async () => {
    const u = await h.user();
    await u.patch("/api/v1/me", { timezone: "Asia/Kolkata" });
    const m = await metric(u);
    const res = await u.post("/api/v1/metric-logs", {
      metricId: m.id,
      value: 1,
      recordedAt: "2026-03-01T20:00:00.000Z",
    });
    expect(res.body.data.localDate.slice(0, 10)).toBe("2026-03-02");
  });
  it("calculates goal progress and marks milestones reached", async () => {
    const u = await h.user();
    const m = await metric(u);
    const g = (
      await u.post("/api/v1/goals", {
        title: "Hydrate",
        metricId: m.id,
        target: 1000,
        period: "daily",
        milestones: [
          { title: "Half", threshold: 500 },
          { title: "All", threshold: 1000 },
        ],
      })
    ).body.data;
    await u.post("/api/v1/metric-logs", { metricId: m.id, value: 300 });
    await u.post("/api/v1/metric-logs", { metricId: m.id, value: 300 });
    const res = (await u.get(`/api/v1/goals/${g.id}`)).body.data;
    expect(res.current).toBe(600);
    expect(res.progress).toBeCloseTo(0.6);
    const reached = (await u.get(`/api/v1/goals/${g.id}`)).body.data.milestones.filter(
      (x: { reachedAt: string }) => x.reachedAt,
    );
    expect(reached.map((x: { title: string }) => x.title)).toEqual(["Half"]);
  });
});

describe("analytics", () => {
  const query = (u: U, spec: object) => u.post("/api/v1/analytics/query", spec);

  it("computes adherence with the documented denominator", async () => {
    const u = await h.user();
    const { task: t } = await dailyTask(u, "Scored", "FREQ=DAILY;COUNT=1");
    await backdated(t.id, u.id, -1, "completed");
    await backdated(t.id, u.id, -2, "pending");
    await backdated(t.id, u.id, -3, "rest");
    await backdated(t.id, u.id, -4, "skipped");
    const res = (await u.get(`/api/v1/analytics/adherence?from=${shift(-4)}&to=${shift(-1)}`)).body
      .data;
    expect(res).toMatchObject({ eligible: 2, completed: 1, skipped: 1, rest: 1, adherence: 0.5 });
    expect(res.denominator).toContain("excluded");
  });
  it("does not count future occurrences against adherence", async () => {
    const u = await h.user();
    const { occurrence: o } = await dailyTask(u, "Long", "FREQ=DAILY");
    await u.post(`/api/v1/occurrences/${o.id}/complete`);
    const res = (await u.get(`/api/v1/analytics/adherence?from=${today}&to=${shift(30)}`)).body
      .data;
    expect(res.adherence).toBe(1);
    expect(res.to).toBe(today);
  });
  it("treats today's unfinished tasks as not yet missed, until the day has passed", async () => {
    const u = await h.user();
    const { task: t } = await dailyTask(u);
    await backdated(t.id, u.id, -1, "completed");
    const res = (await u.get(`/api/v1/analytics/adherence?from=${shift(-1)}&to=${today}`)).body
      .data;
    expect(res).toMatchObject({ eligible: 1, completed: 1, adherence: 1 });
    const series = await query(u, {
      source: "occurrences",
      measure: "adherence",
      from: today,
      to: today,
    });
    expect(series.body.data[0].value).toBeNull();
    expect((await u.get("/api/v1/home")).body.data.counts.eligible).toBe(1);
  });
  it("returns bucketed series for occurrences and metrics", async () => {
    const u = await h.user();
    const { task: t } = await dailyTask(u);
    await backdated(t.id, u.id, -1, "completed");
    const series = await query(u, {
      source: "occurrences",
      measure: "completed",
      grain: "day",
      from: shift(-1),
      to: today,
    });
    expect(series.body.data.find((p: { bucket: string }) => p.bucket === shift(-1)).value).toBe(1);
    const m = (await u.post("/api/v1/metrics", { key: "steps", label: "Steps", kind: "quantity" }))
      .body.data;
    await u.post("/api/v1/metric-logs", { metricId: m.id, value: 100 });
    await u.post("/api/v1/metric-logs", { metricId: m.id, value: 50 });
    const metricSeries = await query(u, {
      source: "metric",
      measure: "sum",
      metricId: m.id,
      from: today,
      to: today,
    });
    expect(metricSeries.body.data[0].value).toBe(150);
  });
  it("rejects anything outside the allowlist, including SQL in any field", async () => {
    const u = await h.user();
    const base = { source: "occurrences", measure: "completed", from: today, to: today };
    expect((await query(u, { ...base, measure: "1; DROP TABLE tasks" })).status).toBe(422);
    expect((await query(u, { ...base, grain: "day') OR 1=1 --" })).status).toBe(422);
    expect((await query(u, { ...base, plannerId: "x' OR '1'='1" })).status).toBe(422);
    expect((await query(u, { ...base, from: "2020-01-01" })).status).toBe(422);
    expect((await query(u, { ...base, measure: "sum" })).status).toBe(422);
    expect(await h.prisma.task.count()).toBeGreaterThan(0);
  });
  it("gives home a score and a streak that ignores unfinished today", async () => {
    const u = await h.user();
    const { task: t, occurrence: o } = await dailyTask(u);
    await backdated(t.id, u.id, -1, "completed");
    await backdated(t.id, u.id, -2, "completed");
    const before = (await u.get("/api/v1/home")).body.data;
    expect(before.score).toBe(0);
    expect(before.streak.current).toBe(2);
    await u.post(`/api/v1/occurrences/${o.id}/complete`);
    const after = (await u.get("/api/v1/home")).body.data;
    expect(after.score).toBe(100);
    expect(after.streak.current).toBe(3);
  });
  it("saves dashboards with widgets", async () => {
    const u = await h.user();
    const widget = {
      title: "Adherence",
      chartType: "line",
      querySpec: { source: "occurrences", measure: "adherence", rangeDays: 30 },
    };
    const d = await u.post("/api/v1/dashboards", { name: "Main", widgets: [widget] });
    expect(d.status).toBe(201);
    expect(d.body.data.widgets).toHaveLength(1);
    const edited = await u.patch(`/api/v1/dashboards/${d.body.data.id}`, {
      widgets: [widget, { ...widget, title: "Two" }],
    });
    expect(edited.body.data.widgets).toHaveLength(2);
  });
});

describe("ownership of tracking and analytics", () => {
  it("hides occurrences, metrics, goals and dashboards from another user", async () => {
    const [owner, other] = [await h.user(), await h.user()];
    const { occurrence: o, planner: p } = await dailyTask(owner);
    const m = (await owner.post("/api/v1/metrics", { key: "secret", label: "S", kind: "quantity" }))
      .body.data;
    await owner.post("/api/v1/metric-logs", { metricId: m.id, value: 42 });
    const g = (
      await owner.post("/api/v1/goals", { title: "G", target: 1, period: "daily", metricId: m.id })
    ).body.data;
    const d = (await owner.post("/api/v1/dashboards", { name: "D" })).body.data;

    for (const action of ["complete", "reopen"]) {
      expect((await other.post(`/api/v1/occurrences/${o.id}/${action}`)).status).toBe(404);
    }
    expect((await other.post(`/api/v1/occurrences/${o.id}/skip`, { reason: "x" })).status).toBe(
      404,
    );
    expect(
      (await other.post(`/api/v1/occurrences/${o.id}/defer`, { toDate: shift(1) })).status,
    ).toBe(404);
    expect(
      (await other.get(`/api/v1/occurrences?from=${today}&to=${today}`)).body.data,
    ).toHaveLength(0);
    expect(
      (await other.get(`/api/v1/occurrences?from=${today}&to=${today}&plannerId=${p.id}`)).body
        .data,
    ).toHaveLength(0);
    expect((await other.post("/api/v1/metric-logs", { metricId: m.id, value: 1 })).status).toBe(
      404,
    );
    expect((await other.get(`/api/v1/metric-logs?metricId=${m.id}`)).status).toBe(404);
    expect((await other.get("/api/v1/metric-logs")).body.data).toHaveLength(0);
    expect(
      (await other.get(`/api/v1/metrics/${m.id}/series?from=${today}&to=${today}`)).status,
    ).toBe(404);
    expect((await other.get(`/api/v1/goals/${g.id}`)).status).toBe(404);
    expect((await other.delete(`/api/v1/goals/${g.id}`)).status).toBe(404);
    expect(
      (
        await other.post("/api/v1/goals", {
          title: "X",
          target: 1,
          period: "daily",
          metricId: m.id,
        })
      ).status,
    ).toBe(404);
    expect((await other.get(`/api/v1/dashboards/${d.id}`)).status).toBe(404);
    expect((await other.patch(`/api/v1/dashboards/${d.id}`, { name: "X" })).status).toBe(404);
    expect((await other.delete(`/api/v1/dashboards/${d.id}`)).status).toBe(404);

    const query = (spec: object) =>
      other.post("/api/v1/analytics/query", { from: today, to: today, ...spec });
    expect((await query({ source: "metric", measure: "sum", metricId: m.id })).status).toBe(404);
    expect(
      (await query({ source: "occurrences", measure: "completed", plannerId: p.id })).status,
    ).toBe(404);
    expect(
      (await other.get(`/api/v1/analytics/adherence?from=${today}&to=${today}&plannerId=${p.id}`))
        .status,
    ).toBe(404);
    const stolen = {
      title: "W",
      chartType: "line",
      querySpec: { source: "metric", measure: "sum", rangeDays: 7, metricId: m.id },
    };
    expect((await other.post("/api/v1/dashboards", { name: "X", widgets: [stolen] })).status).toBe(
      404,
    );
  });
});
