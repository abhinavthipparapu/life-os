import type { SyncOperation } from "@lifeos/contracts";
import { getDb, type CachedOccurrence } from "./db";

const STATUS: Record<SyncOperation["action"], string> = {
  complete: "completed",
  skip: "skipped",
  reopen: "pending",
};

export async function cacheOccurrences(rows: CachedOccurrence[]) {
  const db = await getDb();
  const pending = await pendingIds();
  const tx = db.transaction("occurrences", "readwrite");
  // A row with an unsynced local change keeps its optimistic state until the server has answered.
  await Promise.all([
    ...rows.filter((r) => !pending.has(r.id)).map((r) => tx.store.put(normalize(r))),
    tx.done,
  ]);
}

function normalize(row: CachedOccurrence): CachedOccurrence {
  return { ...row, date: row.date.slice(0, 10) };
}

/** Mirrors a fresh server range, dropping rows the server no longer has unless they are unsynced. */
export async function replaceRange(
  from: string,
  to: string,
  rows: CachedOccurrence[],
  plannerId?: string,
) {
  const db = await getDb();
  const pending = await pendingIds();
  const keep = new Set(rows.map((r) => r.id));
  const existing = await db.getAllFromIndex("occurrences", "byDate", IDBKeyRange.bound(from, to));
  const tx = db.transaction("occurrences", "readwrite");
  await Promise.all([
    ...existing
      .filter(
        (r) =>
          !keep.has(r.id) && !pending.has(r.id) && (!plannerId || r.task.plannerId === plannerId),
      )
      .map((r) => tx.store.delete(r.id)),
    ...rows.filter((r) => !pending.has(r.id)).map((r) => tx.store.put(normalize(r))),
    tx.done,
  ]);
}

export async function readOccurrences(from: string, to: string) {
  const db = await getDb();
  return db.getAllFromIndex("occurrences", "byDate", IDBKeyRange.bound(from, to));
}

export async function pendingIds() {
  const db = await getDb();
  return new Set((await db.getAll("queue")).filter((op) => !op.conflict).map((op) => op.entityId));
}

export async function listQueue() {
  const db = await getDb();
  return db.getAllFromIndex("queue", "byQueuedAt");
}

/** Applies the change locally and queues it in one IndexedDB transaction, so they cannot disagree. */
export async function enqueueOccurrenceAction(
  occurrence: { id: string; version: number },
  action: SyncOperation["action"],
  payload: Record<string, unknown> = {},
) {
  const db = await getDb();
  const tx = db.transaction(["queue", "occurrences"], "readwrite");
  const queue = tx.objectStore("queue");
  const store = tx.objectStore("occurrences");
  // Strictly increasing even within one millisecond, because replay order decides the final state.
  const last = await queue.index("byQueuedAt").openCursor(null, "prev");
  const queuedAt = Math.max(Date.now(), (last?.value.queuedAt ?? 0) + 1);
  const cached = await store.get(occurrence.id);
  const operation = {
    clientOperationId: crypto.randomUUID(),
    entityType: "occurrence" as const,
    entityId: occurrence.id,
    action,
    expectedVersion: cached?.version ?? occurrence.version,
    occurredAt: new Date().toISOString(),
    payload,
    queuedAt,
  };
  await queue.put(operation);
  // Each accepted action bumps the server version, so the next queued one must expect that.
  if (cached) await store.put({ ...cached, status: STATUS[action], version: cached.version + 1 });
  await tx.done;
  return operation;
}

export async function removeFromQueue(ids: string[]) {
  const db = await getDb();
  const tx = db.transaction("queue", "readwrite");
  await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
}

export async function markConflict(id: string) {
  const db = await getDb();
  const op = await db.get("queue", id);
  if (op) await db.put("queue", { ...op, conflict: true });
}

/** "Keep mine" reissues the change against the server's current version. */
export async function retryWithVersion(id: string, version: number) {
  const db = await getDb();
  const op = await db.get("queue", id);
  if (!op) return;
  const tx = db.transaction("queue", "readwrite");
  await tx.store.delete(id);
  await tx.store.put({
    ...op,
    conflict: false,
    clientOperationId: crypto.randomUUID(),
    expectedVersion: version,
  });
  await tx.done;
}

export async function saveServerOccurrence(row: Partial<CachedOccurrence> & { id: string }) {
  const db = await getDb();
  const cached = await db.get("occurrences", row.id);
  if (cached)
    await db.put("occurrences", { ...cached, ...row, date: cached.date, task: cached.task });
}
