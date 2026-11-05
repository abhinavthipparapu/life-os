import { randomUUID } from "node:crypto";
import { localDateOf } from "@lifeos/analytics-core";
import { createMockProvider, type AiProvider } from "@lifeos/domain";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness } from "./helpers.js";

let h: Awaited<ReturnType<typeof createHarness>>;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(() => h.prisma.$disconnect());

type U = Awaited<ReturnType<typeof h.user>>;
const today = localDateOf(new Date(), "UTC");
const snapshot = {
  name: "Starter",
  sections: [
    {
      name: "Daily",
      tasks: [
        {
          title: "Walk",
          type: "checkbox",
          rrule: "FREQ=DAILY",
          children: [{ title: "Stretch", type: "checkbox" }],
        },
      ],
    },
  ],
};
const plannerCount = (id: string) => h.prisma.planner.count({ where: { userId: id } });

async function occurrence(u: U) {
  const p = (await u.post("/api/v1/planners", { name: "P", timezone: "UTC" })).body.data;
  await u.post(`/api/v1/planners/${p.id}/tasks`, {
    title: "T",
    schedule: { rrule: "FREQ=DAILY;COUNT=2", startsOn: today },
  });
  return (await u.get(`/api/v1/occurrences?from=${today}&to=${today}&plannerId=${p.id}`)).body
    .data[0];
}

describe("templates", () => {
  it("instantiates an editable copy that leaves the template unchanged, and records provenance", async () => {
    const u = await h.user();
    const t = (await u.post("/api/v1/templates", { name: "Mine", snapshot })).body.data;
    const p = await u.post(`/api/v1/templates/${t.id}/instantiate`, {});
    expect(p.status).toBe(201);
    const planner = (await u.get(`/api/v1/planners/${p.body.data.id}`)).body.data;
    expect(planner.tasks).toHaveLength(2);
    await u.patch(`/api/v1/tasks/${planner.tasks[0].id}`, { title: "Edited", expectedVersion: 1 });
    const version = (await u.get(`/api/v1/templates/${t.id}`)).body.data.versions[0];
    expect(version.snapshotJson.sections[0].tasks[0].title).toBe("Walk");
    const install = await h.prisma.templateInstall.findFirstOrThrow({
      where: { plannerId: planner.id },
    });
    expect(install.versionId).toBe(version.id);
  });
  it("creates new versions while old ones stay installable", async () => {
    const u = await h.user();
    const t = (await u.post("/api/v1/templates", { name: "V", snapshot })).body.data;
    const v2 = await u.post(`/api/v1/templates/${t.id}/versions`, {
      snapshot: { ...snapshot, name: "Second" },
    });
    expect(v2.body.data.version).toBe(2);
    expect(
      (await u.get(`/api/v1/templates/${t.id}?version=1`)).body.data.versions[0].snapshotJson.name,
    ).toBe("Starter");
    const old = await u.post(`/api/v1/templates/${t.id}/instantiate`, { version: 1 });
    expect(old.body.data.name).toBe("Starter");
  });
  it("rolls back the whole install when a rule is invalid", async () => {
    const u = await h.user();
    const bad = {
      ...snapshot,
      sections: [
        {
          name: "X",
          tasks: [
            { title: "Ok", type: "checkbox" },
            { title: "Bad", type: "checkbox", rrule: "FREQ=SECONDLY" },
          ],
        },
      ],
    };
    const t = (await u.post("/api/v1/templates", { name: "Bad", snapshot: bad })).body.data;
    expect((await u.post(`/api/v1/templates/${t.id}/instantiate`, {})).status).toBe(400);
    expect(await plannerCount(u.id)).toBe(0);
  });
  it("saves a planner as a template", async () => {
    const u = await h.user();
    const p = (await u.post("/api/v1/planners", { name: "Source" })).body.data;
    await u.post(`/api/v1/planners/${p.id}/tasks`, { title: "One" });
    const t = await u.post("/api/v1/templates", { name: "From planner", plannerId: p.id });
    expect(t.body.data.versions[0].snapshotJson.sections[0].tasks[0].title).toBe("One");
    expect(t.body.data.versions[0].checksum).toHaveLength(64);
  });
  it("replays a retried install with the same Idempotency-Key", async () => {
    const u = await h.user();
    const t = (await u.post("/api/v1/templates", { name: "I", snapshot })).body.data;
    const key = randomUUID();
    const send = () =>
      u.post(`/api/v1/templates/${t.id}/instantiate`, {}).set("Idempotency-Key", key);
    const first = await send();
    const second = await send();
    expect(second.status).toBe(201);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(await plannerCount(u.id)).toBe(1);
  });
});

describe("AI guardrails", () => {
  it("generates a preview with no workspace side effects, and applies only on approval", async () => {
    const u = await h.user();
    const draft = await u.post("/api/v1/ai/planner-drafts", { prompt: "Build a study plan" });
    expect(draft.status).toBe(201);
    expect(draft.body.data.status).toBe("preview");
    expect(await plannerCount(u.id)).toBe(0);
    const applied = await u.post(`/api/v1/ai/planner-drafts/${draft.body.data.id}/apply`, {});
    expect(applied.status).toBe(201);
    expect(await plannerCount(u.id)).toBe(1);
    expect((await u.post(`/api/v1/ai/planner-drafts/${draft.body.data.id}/apply`, {})).status).toBe(
      409,
    );
    expect(await plannerCount(u.id)).toBe(1);
  });
  it("applies edits made in the preview and validates them again", async () => {
    const u = await h.user();
    const { id } = (await u.post("/api/v1/ai/planner-drafts", { prompt: "Build a study plan" }))
      .body.data;
    const invalid = { ...snapshot, sections: [] };
    expect(
      (await u.post(`/api/v1/ai/planner-drafts/${id}/apply`, { snapshot: invalid })).status,
    ).toBe(422);
    const res = await u.post(`/api/v1/ai/planner-drafts/${id}/apply`, {
      snapshot: { ...snapshot, name: "Edited" },
    });
    expect(res.body.data.name).toBe("Edited");
  });
  it("rejects schema-invalid, over-limit and invalid-schedule model output without saving", async () => {
    const outputs: unknown[] = [
      { nonsense: true },
      {
        name: "Huge",
        sections: [
          {
            name: "S",
            tasks: Array.from({ length: 201 }, (_, i) => ({ title: `T${i}`, type: "checkbox" })),
          },
        ],
      },
      {
        name: "Bad",
        sections: [
          { name: "S", tasks: [{ title: "T", type: "checkbox", rrule: "FREQ=MINUTELY" }] },
        ],
      },
    ];
    for (const value of outputs) {
      const provider: AiProvider = {
        ...createMockProvider(),
        completeJson: async () => ({ value, tokens: 10, model: "x" }),
      };
      const hx = await createHarness({ ai: provider });
      const u = await hx.user();
      const res = await u.post("/api/v1/ai/planner-drafts", { prompt: "Plan something for me" });
      expect(res.status).toBe(502);
      expect(await hx.prisma.aiDraft.count({ where: { userId: u.id } })).toBe(0);
      await hx.prisma.$disconnect();
    }
  });
  it("rejects unsafe prompts and unsafe model output, and never calls the model for a bad prompt", async () => {
    let calls = 0;
    const base = createMockProvider();
    const provider: AiProvider = {
      ...base,
      completeJson: async (...args) => {
        calls += 1;
        return base.completeJson(...args);
      },
    };
    const hx = await createHarness({ ai: provider });
    const u = await hx.user();
    const res = await u.post("/api/v1/ai/planner-drafts", { prompt: "plan for starving myself" });
    expect(res.body.error.code).toBe("unsafe_content");
    expect(calls).toBe(0);
    await hx.prisma.$disconnect();

    const evil: AiProvider = {
      ...base,
      completeJson: async () => ({
        value: {
          name: "x",
          sections: [{ name: "s", tasks: [{ title: "purging plan", type: "checkbox" }] }],
        },
        tokens: 1,
        model: "m",
      }),
    };
    const hy = await createHarness({ ai: evil });
    const v = await hy.user();
    expect(
      (await v.post("/api/v1/ai/planner-drafts", { prompt: "plan my week please" })).body.error
        .code,
    ).toBe("unsafe_content");
    await hy.prisma.$disconnect();
  });
  it("redacts contact details before they reach the provider", async () => {
    let seen = "";
    const base = createMockProvider();
    const provider: AiProvider = {
      ...base,
      completeJson: async (s, u, m) => ((seen = u), base.completeJson(s, u, m)),
    };
    const hx = await createHarness({ ai: provider });
    const u = await hx.user();
    await u.post("/api/v1/ai/planner-drafts", {
      prompt: "plan for jane@example.com call +1 415 555 2671",
    });
    expect(seen).not.toContain("jane@example.com");
    expect(seen).not.toContain("555");
    await hx.prisma.$disconnect();
  });
  it("enforces the monthly budget before calling the provider, and records usage", async () => {
    const hx = await createHarness({ env: { AI_MONTHLY_TOKEN_BUDGET: "3000" } });
    const u = await hx.user();
    expect(
      (await u.post("/api/v1/ai/planner-drafts", { prompt: "first plan please" })).status,
    ).toBe(201);
    expect((await u.get("/api/v1/ai/usage")).body.data.used).toBeGreaterThan(0);
    await hx.prisma.aiUsage.create({
      data: { userId: u.id, feature: "x", model: "m", tokens: 2900 },
    });
    const blocked = await u.post("/api/v1/ai/planner-drafts", { prompt: "second plan please" });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("ai_budget_exceeded");
    await hx.prisma.$disconnect();
  });
  it("serves a repeated prompt from cache without spending tokens", async () => {
    const u = await h.user();
    await u.post("/api/v1/ai/planner-drafts", { prompt: "same prompt again" });
    const used = (await u.get("/api/v1/ai/usage")).body.data.used;
    const again = await u.post("/api/v1/ai/planner-drafts", { prompt: "same prompt again" });
    expect(again.body.meta.cached).toBe(true);
    expect((await u.get("/api/v1/ai/usage")).body.data.used).toBe(used);
  });
  it("requires opt-in for sensitive data and keeps sensitive metrics out of context", async () => {
    const u = await h.user();
    expect(
      (
        await u.post("/api/v1/ai/planner-drafts", {
          prompt: "plan with my health",
          includeSensitive: true,
        })
      ).status,
    ).toBe(403);
    expect((await u.post("/api/v1/ai/insights", { includeSensitive: true })).status).toBe(403);
    const m = (
      await u.post("/api/v1/metrics", {
        key: "medication",
        label: "Medication",
        kind: "quantity",
        isSensitive: true,
      })
    ).body.data;
    await u.post("/api/v1/metric-logs", { metricId: m.id, value: 2 });
    const stream = await u.post("/api/v1/ai/insights", {});
    expect(stream.text).not.toContain("Medication");
    expect(
      (await u.post("/api/v1/ai/ask", { question: "how much medication did I take" })).body.data
        .answer,
    ).not.toContain("Medication");
  });
  it("answers with exact server-calculated values, whatever the model says", async () => {
    const u = await h.user();
    const m = (
      await u.post("/api/v1/metrics", {
        key: "water",
        label: "Water",
        kind: "quantity",
        unit: "ml",
      })
    ).body.data;
    await u.post("/api/v1/metric-logs", { metricId: m.id, value: 750 });
    const res = await u.post("/api/v1/ai/ask", { question: "how much water did I drink" });
    expect(res.body.data.answer).toContain("750 ml");
    expect(res.body.data.sources[0].value).toBe(750);
  });
  it("streams insights with their source metrics first", async () => {
    const u = await h.user();
    const res = await u.post("/api/v1/ai/insights", { rangeDays: 30 });
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.text.indexOf("event: sources")).toBeLessThan(res.text.indexOf("event: delta"));
    expect(res.text).toContain("event: done");
  });
  it("proposes schedule changes, reports conflicts, and changes nothing until approved", async () => {
    const u = await h.user();
    const p = (await u.post("/api/v1/planners", { name: "S" })).body.data;
    const t = (
      await u.post(`/api/v1/planners/${p.id}/tasks`, {
        title: "A",
        schedule: { rrule: "FREQ=DAILY", startsOn: today, localTime: "12:00" },
      })
    ).body.data;
    const res = await u.post("/api/v1/ai/schedule-suggestions", { plannerId: p.id });
    expect(res.status).toBe(201);
    expect(res.body.data.proposals[0].current).toBe("12:00");
    const read = () => h.prisma.taskSchedule.findFirstOrThrow({ where: { taskId: t.id } });
    expect((await read()).localTime).toBe("12:00");
    await u.post(`/api/v1/ai/schedule-drafts/${res.body.data.draft.id}/apply`);
    expect((await read()).localTime).toBe("07:00");
  });
  it("drops proposals for tasks outside the planner", async () => {
    const base = createMockProvider();
    const foreign = randomUUID();
    const provider: AiProvider = {
      ...base,
      completeJson: async () => ({
        value: { proposals: [{ taskId: foreign, localTime: "09:00", reason: "x" }] },
        tokens: 1,
        model: "m",
      }),
    };
    const hx = await createHarness({ ai: provider });
    const u = await hx.user();
    const p = (await u.post("/api/v1/planners", { name: "S" })).body.data;
    await u.post(`/api/v1/planners/${p.id}/tasks`, {
      title: "A",
      schedule: { rrule: "FREQ=DAILY", startsOn: today },
    });
    expect(
      (await u.post("/api/v1/ai/schedule-suggestions", { plannerId: p.id })).body.data.proposals,
    ).toEqual([]);
    await hx.prisma.$disconnect();
  });
});

describe("offline sync", () => {
  const op = (o: { id: string; version: number }, over: object = {}) => ({
    clientOperationId: randomUUID(),
    entityType: "occurrence",
    entityId: o.id,
    action: "complete",
    expectedVersion: o.version,
    occurredAt: new Date().toISOString(),
    payload: {},
    ...over,
  });
  const batch = (u: U, operations: object[]) => u.post("/api/v1/sync/batch", { operations });

  it("accepts an operation, then reports the replay as a duplicate with no second event", async () => {
    const u = await h.user();
    const o = await occurrence(u);
    const operation = op(o);
    expect((await batch(u, [operation])).body.data[0].outcome).toBe("accepted");
    expect((await batch(u, [operation])).body.data[0].outcome).toBe("duplicate");
    expect(await h.prisma.taskEvent.count({ where: { occurrenceId: o.id } })).toBe(1);
  });
  it("preserves the offline completion time", async () => {
    const u = await h.user();
    const o = await occurrence(u);
    const occurredAt = new Date(Date.now() - 3_600_000).toISOString();
    await batch(u, [op(o, { occurredAt })]);
    const row = await h.prisma.taskOccurrence.findUniqueOrThrow({ where: { id: o.id } });
    expect(row.completedAt?.toISOString()).toBe(occurredAt);
  });
  it("returns the server record and version on conflict", async () => {
    const u = await h.user();
    const o = await occurrence(u);
    await u.post(`/api/v1/occurrences/${o.id}/skip`, { reason: "Done elsewhere" });
    const [res] = (await batch(u, [op(o)])).body.data;
    expect(res.outcome).toBe("conflict");
    expect(res.current.status).toBe("skipped");
    expect(res.current.version).toBe(2);
  });
  it("treats two devices completing the same occurrence as accepted, not a conflict", async () => {
    const u = await h.user();
    const o = await occurrence(u);
    await batch(u, [op(o)]);
    expect((await batch(u, [op(o)])).body.data[0].outcome).toBe("accepted");
    expect(await h.prisma.taskEvent.count({ where: { occurrenceId: o.id } })).toBe(1);
  });
  it("handles a mixed batch in order, without one failure blocking the rest", async () => {
    const u = await h.user();
    const o = await occurrence(u);
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const res = await batch(u, [
      op({ id: randomUUID(), version: 1 }),
      op(o, { occurredAt: future }),
      op(o),
      op(o, { action: "reopen", expectedVersion: 2 }),
    ]);
    expect(res.body.data.map((r: { outcome: string }) => r.outcome)).toEqual([
      "rejected",
      "rejected",
      "accepted",
      "accepted",
    ]);
  });
  it("rejects another user's occurrence and leaves it unchanged", async () => {
    const [owner, other] = [await h.user(), await h.user()];
    const o = await occurrence(owner);
    expect((await batch(other, [op(o)])).body.data[0].outcome).toBe("rejected");
    const row = await h.prisma.taskOccurrence.findUniqueOrThrow({ where: { id: o.id } });
    expect(row.status).toBe("pending");
  });
  it("keeps operation ids separate per user", async () => {
    const [a, b] = [await h.user(), await h.user()];
    const [oa, ob] = [await occurrence(a), await occurrence(b)];
    const clientOperationId = randomUUID();
    expect((await batch(a, [op(oa, { clientOperationId })])).body.data[0].outcome).toBe("accepted");
    expect((await batch(b, [op(ob, { clientOperationId })])).body.data[0].outcome).toBe("accepted");
  });
  it("limits batch size", async () => {
    const u = await h.user();
    const o = await occurrence(u);
    expect(
      (
        await batch(
          u,
          Array.from({ length: 101 }, () => op(o)),
        )
      ).status,
    ).toBe(422);
  });
  it("returns only the caller's changes since the cursor", async () => {
    const [a, b] = [await h.user(), await h.user()];
    const o = await occurrence(a);
    await occurrence(b);
    const first = await a.get("/api/v1/sync/changes");
    expect(first.body.data.occurrences.every((x: { userId: string }) => x.userId === a.id)).toBe(
      true,
    );
    expect(first.body.data.planners).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 20));
    await a.post(`/api/v1/occurrences/${o.id}/complete`);
    const next = await a.get(
      `/api/v1/sync/changes?cursor=${encodeURIComponent(first.body.meta.nextCursor)}`,
    );
    expect(next.body.data.occurrences.map((x: { id: string }) => x.id)).toContain(o.id);
  });
});

describe("push subscriptions", () => {
  const sub = { endpoint: "https://push.example.com/abc", keys: { p256dh: "k", auth: "a" } };
  it("registers and unregisters, and only the owner can remove one", async () => {
    const [a, b] = [await h.user(), await h.user()];
    const endpoint = `${sub.endpoint}/${randomUUID()}`;
    expect((await a.post("/api/v1/push-subscriptions", { ...sub, endpoint })).status).toBe(201);
    await b.delete("/api/v1/push-subscriptions", { endpoint });
    expect(await h.prisma.pushSubscription.count({ where: { endpoint } })).toBe(1);
    await a.delete("/api/v1/push-subscriptions", { endpoint });
    expect(await h.prisma.pushSubscription.count({ where: { endpoint } })).toBe(0);
  });
});

describe("account export and deletion", () => {
  it("refuses sensitive actions on a token older than five minutes and accepts a fresh one", async () => {
    const u = await h.user();
    const withIat = async (secondsAgo: number) => {
      const iat = Math.floor(Date.now() / 1000) - secondsAgo;
      const token = await h.sign({ email: "x@test.local" }, u.id, { iat });
      return { Authorization: `Bearer ${token}` };
    };
    const stale = await request(h.app)
      .post("/api/v1/me/export")
      .set(await withIat(600))
      .send({});
    expect(stale.status).toBe(403);
    expect(stale.body.error.code).toBe("reauthentication_required");
    const deletion = await request(h.app)
      .post("/api/v1/me/deletion")
      .set(await withIat(600))
      .send({ confirm: "DELETE" });
    expect(deletion.status).toBe(403);
    expect(
      (
        await request(h.app)
          .post("/api/v1/me/export")
          .set(await withIat(10))
          .send({})
      ).status,
    ).toBe(202);
  });
  it("queues export and deletion through the outbox", async () => {
    const u = await h.user();
    expect((await u.post("/api/v1/me/export")).status).toBe(202);
    expect((await u.post("/api/v1/me/deletion", {})).status).toBe(422);
    expect((await u.post("/api/v1/me/deletion", { confirm: "DELETE" })).status).toBe(202);
    const events = await h.prisma.outboxEvent.findMany({ where: { userId: u.id } });
    expect(events.map((e) => e.type).sort()).toEqual(["account.deletion", "account.export"]);
    expect((await u.get("/api/v1/me/requests")).body.data).toHaveLength(2);
  });
});

describe("admin", () => {
  const promote = (id: string, role: "admin" | "support") =>
    h.prisma.profile.update({ where: { authUserId: id }, data: { role } });
  const routes: ["get" | "post", string, object?][] = [
    ["get", "/api/v1/admin/audit-events"],
    ["get", "/api/v1/admin/users?email=a@b.c"],
    ["get", "/api/v1/admin/jobs/health"],
    ["post", `/api/v1/admin/users/${randomUUID()}/revoke`, { confirm: "REVOKE", reason: "test" }],
  ];

  it("hides every admin route from regular users and anonymous callers", async () => {
    const u = await h.user();
    for (const [method, url, body] of routes) {
      expect((await u[method](url, body as object)).status).toBe(404);
      expect((await request(h.app)[method](url)).status).toBe(401);
    }
  });
  it("requires MFA for admins when enabled", async () => {
    const hx = await createHarness({ env: { ADMIN_REQUIRE_MFA: "true" } });
    const u = await hx.user();
    await u.get("/api/v1/me");
    await hx.prisma.profile.update({ where: { authUserId: u.id }, data: { role: "admin" } });
    expect((await u.get("/api/v1/admin/jobs/health")).body.error.code).toBe("mfa_required");
    const token = await hx.sign({ aal: "aal2", email: "a@test.local" }, u.id);
    const ok = await request(hx.app)
      .get("/api/v1/admin/jobs/health")
      .set("Authorization", `Bearer ${token}`);
    expect(ok.status).toBe(200);
    await hx.prisma.$disconnect();
  });
  it("revokes access with confirmation and audits it, and lookups reveal no personal data", async () => {
    const [admin, target] = [await h.user(), await h.user()];
    await admin.get("/api/v1/me");
    await target.post("/api/v1/planners", { name: "Secret plan" });
    await promote(admin.id, "admin");
    const url = `/api/v1/admin/users/${target.id}/revoke`;
    expect((await admin.post(url, { reason: "abuse" })).status).toBe(422);
    expect((await admin.post(url, { confirm: "REVOKE", reason: "abuse" })).status).toBe(204);
    expect((await target.get("/api/v1/me")).status).toBe(403);
    const event = await h.prisma.auditEvent.findFirstOrThrow({
      where: { action: "admin.revoke_access", entityId: target.id },
    });
    expect(event.actorId).toBe(admin.id);
    const lookup = await admin.get(`/api/v1/admin/users?email=${target.id}@test.local`);
    expect(lookup.body.data).toHaveLength(1);
    expect(JSON.stringify(lookup.body)).not.toContain("Secret plan");
  });
});

describe("feature flags", () => {
  it("turns AI off without a deploy", async () => {
    const hx = await createHarness({ env: { FEATURE_AI: "false" } });
    const u = await hx.user();
    const res = await u.post("/api/v1/ai/planner-drafts", { prompt: "plan my week please" });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("feature_disabled");
    await hx.prisma.$disconnect();
  });
});

describe("rate limiting", () => {
  it("returns a problem response once a user is over the limit", async () => {
    const hx = await createHarness({ env: { RATE_LIMIT_PER_MINUTE: "3" } });
    const u = await hx.user();
    const statuses = [];
    for (let i = 0; i < 5; i += 1) statuses.push((await u.get("/api/v1/me")).status);
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
    await hx.prisma.$disconnect();
  });
});

describe("ownership of templates, AI drafts and account requests", () => {
  it("hides private templates and drafts from other users", async () => {
    const [owner, other] = [await h.user(), await h.user()];
    const t = (await owner.post("/api/v1/templates", { name: "Private", snapshot })).body.data;
    const d = (await owner.post("/api/v1/ai/planner-drafts", { prompt: "my private plan" })).body
      .data;
    const p = (await owner.post("/api/v1/planners", { name: "Mine" })).body.data;
    expect(
      (await other.get("/api/v1/templates")).body.data.map((x: { id: string }) => x.id),
    ).not.toContain(t.id);
    expect((await other.get(`/api/v1/templates/${t.id}`)).status).toBe(404);
    expect((await other.post(`/api/v1/templates/${t.id}/instantiate`, {})).status).toBe(404);
    expect((await other.post(`/api/v1/templates/${t.id}/versions`, { snapshot })).status).toBe(404);
    expect((await other.post("/api/v1/templates", { name: "Steal", plannerId: p.id })).status).toBe(
      404,
    );
    expect((await other.get(`/api/v1/ai/planner-drafts/${d.id}`)).status).toBe(404);
    expect((await other.post(`/api/v1/ai/planner-drafts/${d.id}/apply`, {})).status).toBe(404);
    expect((await other.post("/api/v1/ai/schedule-suggestions", { plannerId: p.id })).status).toBe(
      404,
    );
    expect((await other.get("/api/v1/me/requests")).body.data).toHaveLength(0);
    expect((await other.get("/api/v1/notifications")).body.data).toHaveLength(0);
  });
  it("lets users install a starter template but not create versions of it", async () => {
    const [u] = [await h.user()];
    await u.get("/api/v1/me");
    const starter = await h.prisma.template.create({
      data: {
        name: "Starter",
        visibility: "starter",
        versions: { create: { version: 1, snapshotJson: snapshot, checksum: "x" } },
      },
    });
    expect((await u.post(`/api/v1/templates/${starter.id}/instantiate`, {})).status).toBe(201);
    expect((await u.post(`/api/v1/templates/${starter.id}/versions`, { snapshot })).status).toBe(
      404,
    );
    await h.prisma.template.delete({ where: { id: starter.id } });
  });
  it("keeps installed planners when the source template's owner deletes their account", async () => {
    const [author, installer] = [await h.user(), await h.user()];
    const t = (await author.post("/api/v1/templates", { name: "Shared", snapshot })).body.data;
    await h.prisma.template.update({ where: { id: t.id }, data: { visibility: "public" } });
    const p = (await installer.post(`/api/v1/templates/${t.id}/instantiate`, {})).body.data;
    await h.prisma.profile.delete({ where: { authUserId: author.id } });
    expect((await installer.get(`/api/v1/planners/${p.id}`)).status).toBe(200);
    const install = await h.prisma.templateInstall.findFirstOrThrow({ where: { plannerId: p.id } });
    expect(install.versionId).toBeNull();
  });
});
