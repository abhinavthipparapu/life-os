import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, wipeLocalData, type CachedOccurrence } from "./db";
import {
  cacheOccurrences,
  enqueueOccurrenceAction,
  listQueue,
  pendingIds,
  readOccurrences,
  replaceRange,
  retryWithVersion,
} from "./queue";

vi.mock("@/lib/env", () => ({ env: { VITE_API_URL: "http://api.test" } }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
const { replayQueue } = await import("./sync");

const row = (id: string, over: Partial<CachedOccurrence> = {}): CachedOccurrence => ({
  id,
  date: "2026-03-01T00:00:00.000Z",
  status: "pending",
  version: 1,
  scheduledAt: null,
  value: null,
  note: null,
  taskId: "t",
  task: {
    id: "t",
    title: "T",
    type: "checkbox",
    targetValue: null,
    targetUnit: null,
    plannerId: "p",
    planner: { name: "P", color: "#000000" },
  },
  ...over,
});

beforeEach(() => wipeLocalData());

describe("offline queue", () => {
  it("applies changes optimistically and queues them", async () => {
    await cacheOccurrences([row("a")]);
    await enqueueOccurrenceAction({ id: "a", version: 1 }, "complete");
    expect((await readOccurrences("2026-03-01", "2026-03-01"))[0]!.status).toBe("completed");
    expect(await pendingIds()).toEqual(new Set(["a"]));
  });
  it("chains expected versions so offline complete then undo replays without a conflict", async () => {
    await cacheOccurrences([row("a")]);
    const first = await enqueueOccurrenceAction({ id: "a", version: 1 }, "complete");
    const undo = await enqueueOccurrenceAction({ id: "a", version: 1 }, "reopen");
    expect(first.expectedVersion).toBe(1);
    expect(undo.expectedVersion).toBe(2);
    expect((await readOccurrences("2026-03-01", "2026-03-01"))[0]!.status).toBe("pending");
  });
  it("drops rows the server removed, but never unsynced ones", async () => {
    await cacheOccurrences([row("gone"), row("kept"), row("local")]);
    await enqueueOccurrenceAction({ id: "local", version: 1 }, "complete");
    await replaceRange("2026-03-01", "2026-03-01", [row("kept")]);
    const ids = (await readOccurrences("2026-03-01", "2026-03-01")).map((r) => r.id).sort();
    expect(ids).toEqual(["kept", "local"]);
  });
  it("does not let a server refresh overwrite an unsynced change", async () => {
    await cacheOccurrences([row("a")]);
    await enqueueOccurrenceAction({ id: "a", version: 1 }, "complete");
    await cacheOccurrences([row("a", { status: "pending" })]);
    expect((await readOccurrences("2026-03-01", "2026-03-01"))[0]!.status).toBe("completed");
  });
  it("clears accepted and duplicate operations after replay, in order", async () => {
    await cacheOccurrences([row("a"), row("b")]);
    await enqueueOccurrenceAction({ id: "a", version: 1 }, "complete");
    await enqueueOccurrenceAction({ id: "b", version: 1 }, "skip", { reason: "x" });
    const sent: { entityId: string }[][] = [];
    const summary = await replayQueue(async (ops) => {
      sent.push(ops as { entityId: string }[]);
      return (ops as { clientOperationId: string }[]).map((o, i) => ({
        clientOperationId: o.clientOperationId,
        outcome: i === 0 ? ("accepted" as const) : ("duplicate" as const),
      }));
    });
    expect(sent[0]!.map((o) => o.entityId)).toEqual(["a", "b"]);
    expect(summary.sent).toBe(2);
    expect(await listQueue()).toHaveLength(0);
  });
  it("keeps conflicted operations for the user to resolve, and does not resend them", async () => {
    await cacheOccurrences([row("a")]);
    const op = await enqueueOccurrenceAction({ id: "a", version: 1 }, "complete");
    const current = { id: "a", status: "skipped", version: 3 };
    const summary = await replayQueue(async () => [
      { clientOperationId: op.clientOperationId, outcome: "conflict", current },
    ]);
    expect(summary.conflicts).toHaveLength(1);
    expect((await listQueue())[0]!.conflict).toBe(true);
    const transport = vi.fn(async () => []);
    await replayQueue(transport);
    expect(transport).not.toHaveBeenCalled();
    await retryWithVersion(op.clientOperationId, 3);
    const retried = (await listQueue())[0]!;
    expect(retried.expectedVersion).toBe(3);
    expect(retried.clientOperationId).not.toBe(op.clientOperationId);
  });
  it("keeps the queue intact when the network fails mid-replay", async () => {
    await cacheOccurrences([row("a")]);
    await enqueueOccurrenceAction({ id: "a", version: 1 }, "complete");
    await expect(
      replayQueue(async () => {
        throw new Error("offline");
      }),
    ).rejects.toThrow();
    expect(await listQueue()).toHaveLength(1);
  });
  it("shares one replay across simultaneous triggers", async () => {
    await cacheOccurrences([row("a")]);
    const op = await enqueueOccurrenceAction({ id: "a", version: 1 }, "complete");
    const transport = vi.fn(async () => [
      { clientOperationId: op.clientOperationId, outcome: "accepted" as const },
    ]);
    await Promise.all([replayQueue(transport), replayQueue(transport), replayQueue(transport)]);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("also sends actions queued while a replay is in flight", async () => {
    await cacheOccurrences([row("a")]);
    await enqueueOccurrenceAction({ id: "a", version: 1 }, "complete");
    const batches: string[][] = [];
    const accept = (ops: unknown[]) =>
      (ops as { clientOperationId: string }[]).map((o) => ({
        clientOperationId: o.clientOperationId,
        outcome: "accepted" as const,
      }));
    await replayQueue(async (ops) => {
      batches.push((ops as { action: string }[]).map((o) => o.action));
      if (batches.length === 1) await enqueueOccurrenceAction({ id: "a", version: 1 }, "reopen");
      return accept(ops);
    });
    expect(batches).toEqual([["complete"], ["reopen"]]);
    expect(await listQueue()).toHaveLength(0);
  });
  it("does not let an older server result overwrite a newer queued change", async () => {
    await cacheOccurrences([row("a")]);
    const first = await enqueueOccurrenceAction({ id: "a", version: 1 }, "complete");
    let calls = 0;
    await replayQueue(async () => {
      calls += 1;
      if (calls > 1) return [];
      await enqueueOccurrenceAction({ id: "a", version: 1 }, "reopen");
      await enqueueOccurrenceAction({ id: "a", version: 1 }, "complete");
      return [
        {
          clientOperationId: first.clientOperationId,
          outcome: "accepted" as const,
          occurrence: { id: "a", status: "pending", version: 2 },
        },
      ];
    });
    const cached = (await readOccurrences("2026-03-01", "2026-03-01"))[0]!;
    expect(cached.status).toBe("completed");
    expect(cached.version).toBe(4);
  });
  it("stops rather than loops if the server returns no results", async () => {
    await cacheOccurrences([row("a")]);
    await enqueueOccurrenceAction({ id: "a", version: 1 }, "complete");
    const transport = vi.fn(async () => []);
    await replayQueue(transport);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await listQueue()).toHaveLength(1);
  });
  it("stops if the server replies with ids that match nothing", async () => {
    await cacheOccurrences([row("a")]);
    await enqueueOccurrenceAction({ id: "a", version: 1 }, "complete");
    const transport = vi.fn(async () => [
      { clientOperationId: "unknown", outcome: "accepted" as const },
    ]);
    await replayQueue(transport);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("wipes all private data on logout", async () => {
    await cacheOccurrences([row("a")]);
    await enqueueOccurrenceAction({ id: "a", version: 1 }, "complete");
    await wipeLocalData();
    const db = await getDb();
    expect(await db.count("occurrences")).toBe(0);
    expect(await db.count("queue")).toBe(0);
  });
});
