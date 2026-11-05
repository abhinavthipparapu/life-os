import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness } from "./helpers.js";

let h: Awaited<ReturnType<typeof createHarness>>;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(() => h.prisma.$disconnect());

type U = Awaited<ReturnType<typeof h.user>>;
const planner = async (u: U, name = "Fitness") => (await u.post("/api/v1/planners", { name })).body.data;
const task = async (u: U, plannerId: string, body: object) => u.post(`/api/v1/planners/${plannerId}/tasks`, body);
const today = new Date().toISOString().slice(0, 10);

describe("planners", () => {
  it("creates, searches, paginates and archives", async () => {
    const u = await h.user();
    for (const n of ["Alpha", "Beta", "Gamma"]) await planner(u, n);
    const first = await u.get("/api/v1/planners?limit=2&sort=name&order=asc");
    expect(first.body.data.map((p: { name: string }) => p.name)).toEqual(["Alpha", "Beta"]);
    const next = await u.get(`/api/v1/planners?limit=2&sort=name&order=asc&cursor=${first.body.meta.nextCursor}`);
    expect(next.body.data.map((p: { name: string }) => p.name)).toEqual(["Gamma"]);
    expect(next.body.meta.nextCursor).toBeNull();
    expect((await u.get("/api/v1/planners?search=bet")).body.data).toHaveLength(1);
    expect((await u.get("/api/v1/planners?sort=password")).status).toBe(422);
    expect((await u.delete(`/api/v1/planners/${first.body.data[0].id}`)).status).toBe(204);
    expect((await u.get("/api/v1/planners")).body.data).toHaveLength(2);
  });
  it("detects stale edits and returns the current record", async () => {
    const u = await h.user();
    const p = await planner(u);
    expect((await u.patch(`/api/v1/planners/${p.id}`, { name: "New", expectedVersion: 1 })).body.data.version).toBe(2);
    const stale = await u.patch(`/api/v1/planners/${p.id}`, { name: "Old", expectedVersion: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.current.name).toBe("New");
  });
  it("clones sections, nested tasks and fields without touching the original", async () => {
    const u = await h.user();
    const p = await planner(u);
    const section = (await u.post(`/api/v1/planners/${p.id}/sections`, { name: "Morning" })).body.data;
    await u.post(`/api/v1/planners/${p.id}/fields`, { key: "effort", label: "Effort", type: "number", validation: {} });
    const parent = (await task(u, p.id, { title: "Run", sectionId: section.id })).body.data;
    await task(u, p.id, { title: "Stretch", sectionId: section.id, parentTaskId: parent.id });
    const clone = await u.post(`/api/v1/planners/${p.id}/clone`);
    expect(clone.status).toBe(201);
    const copy = (await u.get(`/api/v1/planners/${clone.body.data.id}`)).body.data;
    expect(copy.name).toBe("Fitness (copy)");
    expect(copy.sections.map((s: { name: string }) => s.name)).toEqual(["Morning"]);
    expect(copy.fieldDefinitions).toHaveLength(1);
    const child = copy.tasks.find((t: { title: string }) => t.title === "Stretch");
    expect(copy.tasks.find((t: { id: string }) => t.id === child.parentTaskId).title).toBe("Run");
    await u.patch(`/api/v1/tasks/${child.id}`, { title: "Changed", expectedVersion: 1 });
    const original = (await u.get(`/api/v1/planners/${p.id}`)).body.data;
    expect(original.tasks.map((t: { title: string }) => t.title).sort()).toEqual(["Run", "Stretch"]);
  });
});

describe("task hierarchy", () => {
  async function chain(u: U, plannerId: string, length: number) {
    const ids: string[] = [];
    for (let i = 0; i < length; i += 1) {
      const res = await task(u, plannerId, { title: `T${i}`, parentTaskId: ids[i - 1] });
      ids.push(res.body.data.id);
    }
    return ids;
  }
  it("enforces maximum depth of 5", async () => {
    const u = await h.user();
    const p = await planner(u);
    const ids = await chain(u, p.id, 5);
    expect((await task(u, p.id, { title: "Too deep", parentTaskId: ids[4] })).body.error.code).toBe("too_deep");
  });
  it("prevents cycles, including moving a task under itself", async () => {
    const u = await h.user();
    const p = await planner(u);
    const [a, b, c] = await chain(u, p.id, 3);
    const move = (id: string, parentTaskId: string) => u.post(`/api/v1/tasks/${id}/reparent`, { parentTaskId, expectedVersion: 1 });
    expect((await move(a!, c!)).body.error.code).toBe("cycle");
    expect((await move(a!, a!)).body.error.code).toBe("cycle");
    void b;
  });
  it("counts the moved subtree toward the depth limit", async () => {
    const u = await h.user();
    const p = await planner(u);
    const deep = await chain(u, p.id, 4);
    const sub = await chain(u, p.id, 2);
    const res = await u.post(`/api/v1/tasks/${sub[0]}/reparent`, { parentTaskId: deep[3], expectedVersion: 1 });
    expect(res.body.error.code).toBe("too_deep");
  });
  it("refuses a parent from a different planner of the same user", async () => {
    const u = await h.user();
    const [p1, p2] = [await planner(u, "One"), await planner(u, "Two")];
    const other = (await task(u, p2.id, { title: "Other" })).body.data;
    expect((await task(u, p1.id, { title: "X", parentTaskId: other.id })).status).toBe(404);
  });
  it("archives descendants with their parent", async () => {
    const u = await h.user();
    const p = await planner(u);
    const [a] = await chain(u, p.id, 3);
    await u.delete(`/api/v1/tasks/${a}`);
    expect((await u.get(`/api/v1/planners/${p.id}`)).body.data.tasks).toHaveLength(0);
  });
});

describe("custom fields", () => {
  it("validates type, options, range and required on write", async () => {
    const u = await h.user();
    const p = await planner(u);
    const field = (b: object) => u.post(`/api/v1/planners/${p.id}/fields`, b);
    await field({ key: "effort", label: "Effort", type: "number", validation: { min: 1, max: 10, required: true } });
    await field({ key: "mood", label: "Mood", type: "select", validation: { options: ["good", "bad"] } });
    expect((await task(u, p.id, { title: "No effort" })).status).toBe(422);
    expect((await task(u, p.id, { title: "Bad", fields: { effort: 11 } })).status).toBe(422);
    expect((await task(u, p.id, { title: "Bad", fields: { effort: "high" } })).status).toBe(422);
    expect((await task(u, p.id, { title: "Bad", fields: { effort: 5, mood: "meh" } })).status).toBe(422);
    expect((await task(u, p.id, { title: "Bad", fields: { effort: 5, unknown: 1 } })).status).toBe(422);
    const ok = await task(u, p.id, { title: "Good", fields: { effort: 5, mood: "good" } });
    expect(ok.status).toBe(201);
    const values = await h.prisma.fieldValue.findMany({ where: { taskId: ok.body.data.id }, orderBy: { valueNumber: "asc" } });
    expect(values.find((v) => v.valueNumber !== null)?.valueNumber).toBe(5);
  });
  it("rolls back the task when a field value is invalid", async () => {
    const u = await h.user();
    const p = await planner(u);
    await task(u, p.id, { title: "Rollback", fields: { nope: 1 } });
    expect((await u.get(`/api/v1/planners/${p.id}`)).body.data.tasks).toHaveLength(0);
  });
});

describe("recurrence", () => {
  const daily = { rrule: "FREQ=DAILY", startsOn: today };
  const count = (taskId: string) => h.prisma.taskOccurrence.count({ where: { taskId } });

  it("generates occurrences through the 60 day horizon", async () => {
    const u = await h.user();
    const p = await planner(u);
    const t = (await task(u, p.id, { title: "Daily", schedule: daily })).body.data;
    expect(await count(t.id)).toBeGreaterThanOrEqual(60);
  });
  it("rejects invalid and sub-daily rules", async () => {
    const u = await h.user();
    const p = await planner(u);
    const res = await task(u, p.id, { title: "X", schedule: { ...daily, rrule: "FREQ=SECONDLY" } });
    expect(res.body.error.code).toBe("invalid_rrule");
  });
  it("keeps completed history when the schedule changes", async () => {
    const u = await h.user();
    const p = await planner(u);
    const t = (await task(u, p.id, { title: "Daily", schedule: daily })).body.data;
    const done = await h.prisma.taskOccurrence.findFirstOrThrow({ where: { taskId: t.id }, orderBy: { date: "asc" } });
    await h.prisma.taskOccurrence.update({ where: { id: done.id }, data: { status: "completed" } });
    await u.patch(`/api/v1/tasks/${t.id}`, { expectedVersion: 1, schedule: { rrule: "FREQ=WEEKLY", startsOn: today } });
    const after = await h.prisma.taskOccurrence.findUniqueOrThrow({ where: { id: done.id } });
    expect(after.status).toBe("completed");
    const remaining = await count(t.id);
    expect(remaining).toBeLessThan(15);
    expect(remaining).toBeGreaterThan(5);
  });
});

describe("ownership of planners and tasks", () => {
  it("hides every planner and task route from another user", async () => {
    const [owner, other] = [await h.user(), await h.user()];
    const p = await planner(owner);
    const t = (await task(owner, p.id, { title: "Secret" })).body.data;
    expect((await other.get(`/api/v1/planners/${p.id}`)).status).toBe(404);
    expect((await other.patch(`/api/v1/planners/${p.id}`, { name: "X", expectedVersion: 1 })).status).toBe(404);
    expect((await other.delete(`/api/v1/planners/${p.id}`)).status).toBe(404);
    expect((await other.post(`/api/v1/planners/${p.id}/clone`)).status).toBe(404);
    expect((await other.post(`/api/v1/planners/${p.id}/sections`, { name: "X" })).status).toBe(404);
    expect((await other.post(`/api/v1/planners/${p.id}/fields`, { key: "x", label: "X", type: "text", validation: {} })).status).toBe(404);
    expect((await task(other, p.id, { title: "X" })).status).toBe(404);
    expect((await other.get(`/api/v1/tasks/${t.id}`)).status).toBe(404);
    expect((await other.patch(`/api/v1/tasks/${t.id}`, { title: "X", expectedVersion: 1 })).status).toBe(404);
    expect((await other.delete(`/api/v1/tasks/${t.id}`)).status).toBe(404);
    expect((await other.post(`/api/v1/tasks/${t.id}/reparent`, { parentTaskId: null, expectedVersion: 1 })).status).toBe(404);
    const own = await planner(other, "Mine");
    expect((await task(other, own.id, { title: "X", parentTaskId: t.id })).status).toBe(404);
    expect((await owner.get(`/api/v1/tasks/${t.id}`)).body.data.title).toBe("Secret");
  });
});
