import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { localDateOf } from "@lifeos/analytics-core";
import { createPrisma } from "@lifeos/db";
import { applyQuietHours, createMockProvider, rebuildDailyAggregates } from "@lifeos/domain";
import { config } from "dotenv";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { reconcileAggregatesJob } from "../src/jobs/aggregates.js";
import type { JobContext, PushTarget } from "../src/jobs/context.js";
import { generateOccurrencesJob } from "../src/jobs/occurrences.js";
import { drainOutboxJob, MAX_OUTBOX_ATTEMPTS } from "../src/jobs/outbox.js";
import { scanRemindersJob } from "../src/jobs/reminders.js";
import { weeklyReportsJob } from "../src/jobs/weekly-reports.js";

config({ path: resolve(import.meta.dirname, "../../../.env"), quiet: true });
const prisma = createPrisma(process.env.TEST_DATABASE_URL!);
afterAll(() => prisma.$disconnect());

const today = localDateOf(new Date(), "UTC");
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
let pushes: PushTarget[];
let authDeletes: string[];
let failAuth: boolean;

const ctx = (over: Partial<JobContext> = {}): JobContext => ({
  prisma,
  ai: createMockProvider(),
  aiMonthlyBudget: 100_000,
  log: { info: () => {}, error: () => {} },
  sendPush: async (t) => {
    pushes.push(t);
    return "sent";
  },
  deleteAuthUser: async (id) => {
    if (failAuth) throw new Error("auth down");
    authDeletes.push(id);
  },
  ...over,
});

beforeEach(async () => {
  pushes = [];
  authDeletes = [];
  failAuth = false;
  await prisma.outboxEvent.updateMany({ where: { processedAt: null }, data: { processedAt: new Date() } });
});

async function user(prefs: object = {}, timezone = "UTC") {
  const id = randomUUID();
  await prisma.profile.create({
    data: { authUserId: id, email: `${id}@t.local`, timezone, preferences: { create: prefs } },
  });
  return id;
}
async function task(userId: string, schedule?: object) {
  const planner = await prisma.planner.create({ data: { userId, name: "P", slug: randomUUID() } });
  return prisma.task.create({
    data: {
      userId,
      plannerId: planner.id,
      title: "Stretch",
      schedules: schedule
        ? { create: { timezone: "UTC", rrule: "FREQ=DAILY", startsOn: asDate(today), ...schedule } }
        : undefined,
    },
  });
}

describe("generateOccurrencesJob", () => {
  it("generates ahead and is idempotent", async () => {
    const u = await user();
    const t = await task(u, {});
    await generateOccurrencesJob(ctx());
    const first = await prisma.taskOccurrence.count({ where: { taskId: t.id } });
    expect(first).toBeGreaterThanOrEqual(60);
    await prisma.taskSchedule.updateMany({ where: { taskId: t.id }, data: { generatedUntil: null } });
    await generateOccurrencesJob(ctx());
    expect(await prisma.taskOccurrence.count({ where: { taskId: t.id } })).toBe(first);
  });
});

describe("scanRemindersJob", () => {
  async function due(prefs: object, timezone = "UTC", now = new Date()) {
    const u = await user({ pushEnabled: true, ...prefs }, timezone);
    await prisma.pushSubscription.create({
      data: { userId: u, endpoint: `https://push.test/${randomUUID()}`, p256dh: "k", auth: "a" },
    });
    const t = await task(u, { reminderOffsets: [10] });
    await prisma.taskOccurrence.create({
      data: { userId: u, taskId: t.id, slotKey: "default", date: asDate(today), scheduledAt: new Date(now.getTime() + 10 * 60_000) },
    });
    return u;
  }
  it("delivers once even when scans overlap or repeat", async () => {
    const now = new Date();
    const u = await due({}, "UTC", now);
    await Promise.all([scanRemindersJob(ctx(), now), scanRemindersJob(ctx(), now)]);
    await scanRemindersJob(ctx(), new Date(now.getTime() + 30_000));
    expect(await prisma.notification.count({ where: { userId: u } })).toBe(1);
    expect(pushes).toHaveLength(1);
  });
  it("holds back the push in quiet hours but keeps the inbox item", async () => {
    const now = new Date("2026-06-15T23:00:00Z");
    const u = await due({ quietHoursStart: "22:00", quietHoursEnd: "07:00" }, "UTC", now);
    await scanRemindersJob(ctx(), now);
    expect(pushes).toHaveLength(0);
    expect(await prisma.notification.count({ where: { userId: u } })).toBe(1);
  });
  it("respects quiet hours in the user's timezone", () => {
    const now = new Date("2026-06-15T23:00:00Z");
    expect(applyQuietHours(now, "UTC", "22:00", "07:00")).toBe(true);
    expect(applyQuietHours(now, "Asia/Kolkata", "22:00", "07:00")).toBe(true);
    expect(applyQuietHours(now, "America/Los_Angeles", "22:00", "07:00")).toBe(false);
  });
  it("removes subscriptions the browser has dropped", async () => {
    const now = new Date();
    const u = await due({}, "UTC", now);
    await scanRemindersJob(ctx({ sendPush: async () => "gone" }), now);
    expect(await prisma.pushSubscription.count({ where: { userId: u } })).toBe(0);
  });
  it("sends no push without opt-in", async () => {
    const now = new Date();
    await due({ pushEnabled: false }, "UTC", now);
    await scanRemindersJob(ctx(), now);
    expect(pushes).toHaveLength(0);
  });
});

describe("drainOutboxJob and aggregates", () => {
  it("rebuilds aggregates from outbox events and marks them processed", async () => {
    const u = await user();
    const t = await task(u);
    await prisma.taskOccurrence.create({
      data: { userId: u, taskId: t.id, slotKey: "a", date: asDate(today), status: "completed" },
    });
    await prisma.outboxEvent.create({ data: { userId: u, type: "occurrence.changed", payload: { date: today } } });
    await drainOutboxJob(ctx());
    const row = await prisma.dailyAggregate.findFirstOrThrow({ where: { userId: u } });
    expect(row).toMatchObject({ completed: 1, eligible: 1 });
    expect(await prisma.outboxEvent.count({ where: { userId: u, processedAt: null } })).toBe(0);
  });
  it("does not double count when an event is delivered twice", async () => {
    const u = await user();
    const t = await task(u);
    await prisma.taskOccurrence.create({
      data: { userId: u, taskId: t.id, slotKey: "a", date: asDate(today), status: "completed" },
    });
    for (let i = 0; i < 2; i += 1) {
      await prisma.outboxEvent.create({ data: { userId: u, type: "occurrence.changed", payload: { date: today } } });
    }
    await drainOutboxJob(ctx());
    const rows = await prisma.dailyAggregate.findMany({ where: { userId: u } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.completed).toBe(1);
  });
  it("detects and repairs drift", async () => {
    const u = await user();
    const t = await task(u);
    await prisma.taskOccurrence.create({
      data: { userId: u, taskId: t.id, slotKey: "a", date: asDate(today), status: "completed" },
    });
    await prisma.$transaction((tx) => rebuildDailyAggregates(tx, u, today));
    await prisma.dailyAggregate.updateMany({ where: { userId: u }, data: { completed: 99 } });
    expect((await reconcileAggregatesJob(ctx())).drift).toBeGreaterThanOrEqual(1);
    expect((await prisma.dailyAggregate.findFirstOrThrow({ where: { userId: u } })).completed).toBe(1);
  });
});

describe("account workflows", () => {
  const requestFor = async (u: string, kind: "export" | "deletion") => {
    const r = await prisma.accountRequest.create({ data: { userId: u, kind } });
    await prisma.outboxEvent.create({ data: { userId: u, type: `account.${kind}`, payload: { requestId: r.id } } });
    return r;
  };

  it("exports the user's data and nothing of anyone else's", async () => {
    const [u, other] = [await user(), await user()];
    await task(u);
    await prisma.category.create({ data: { userId: other, name: "Theirs", slug: "theirs" } });
    const r = await requestFor(u, "export");
    await drainOutboxJob(ctx());
    const done = await prisma.accountRequest.findUniqueOrThrow({ where: { id: r.id } });
    expect(done.status).toBe("completed");
    const text = JSON.stringify(done.resultJson);
    expect(text).toContain("Stretch");
    expect(text).not.toContain("Theirs");
  });
  it("deletes the login and all data, keeps an anonymous audit trail, and spares other users", async () => {
    const [u, other] = [await user(), await user()];
    await task(u);
    await task(other);
    await prisma.auditEvent.create({ data: { actorId: u, action: "x", entityType: "y" } });
    await requestFor(u, "deletion");
    await drainOutboxJob(ctx());
    expect(authDeletes).toEqual([u]);
    expect(await prisma.profile.count({ where: { authUserId: u } })).toBe(0);
    expect(await prisma.task.count({ where: { userId: u } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { actorId: u } })).toBe(0);
    expect(await prisma.task.count({ where: { userId: other } })).toBe(1);
    expect(await prisma.deletedAccount.count({ where: { authUserId: u } })).toBe(1);
  });
  it("retries when the auth provider is down, and blocks access meanwhile", async () => {
    const u = await user();
    await requestFor(u, "deletion");
    failAuth = true;
    expect((await drainOutboxJob(ctx())).failed).toBe(1);
    const held = await prisma.profile.findUniqueOrThrow({ where: { authUserId: u } });
    expect(held.deletedAt).not.toBeNull();
    failAuth = false;
    expect((await drainOutboxJob(ctx())).processed).toBe(1);
    expect(await prisma.profile.count({ where: { authUserId: u } })).toBe(0);
  });
  it("stops retrying after the attempt limit so a poison event cannot loop forever", async () => {
    const u = await user();
    await requestFor(u, "deletion");
    failAuth = true;
    for (let i = 0; i < MAX_OUTBOX_ATTEMPTS + 2; i += 1) await drainOutboxJob(ctx());
    const event = await prisma.outboxEvent.findFirstOrThrow({ where: { userId: u } });
    expect(event.attempts).toBe(MAX_OUTBOX_ATTEMPTS);
    expect(event.processedAt).toBeNull();
  });
});

describe("weeklyReportsJob", () => {
  it("runs only for opted-in users, once per week, and within budget", async () => {
    const [yes, no] = [await user({ aiWeeklyReportOptIn: true }), await user()];
    const now = new Date();
    await weeklyReportsJob(ctx(), now);
    await weeklyReportsJob(ctx(), now);
    expect(await prisma.notification.count({ where: { userId: yes } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: no } })).toBe(0);
    expect(await prisma.aiUsage.count({ where: { userId: yes } })).toBe(1);
  });
  it("skips users over budget", async () => {
    const u = await user({ aiWeeklyReportOptIn: true });
    await prisma.aiUsage.create({ data: { userId: u, feature: "x", model: "m", tokens: 99_999 } });
    await weeklyReportsJob(ctx());
    expect(await prisma.notification.count({ where: { userId: u } })).toBe(0);
  });
});
