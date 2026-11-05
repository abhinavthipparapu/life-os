import type { SyncOperation } from "@lifeos/contracts";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface CachedOccurrence {
  id: string;
  date: string;
  status: string;
  version: number;
  scheduledAt: string | null;
  value: number | null;
  note: string | null;
  taskId: string;
  task: {
    id: string;
    title: string;
    type: string;
    targetValue: number | null;
    targetUnit: string | null;
    plannerId: string;
    planner: { name: string; color: string };
  };
}

export type QueuedOperation = SyncOperation & { conflict?: boolean };

interface LifeOsDb extends DBSchema {
  occurrences: { key: string; value: CachedOccurrence; indexes: { byDate: string } };
  queue: {
    key: string;
    value: QueuedOperation & { queuedAt: number };
    indexes: { byQueuedAt: number };
  };
  meta: { key: string; value: unknown };
}

let connection: Promise<IDBPDatabase<LifeOsDb>> | null = null;

export function getDb() {
  connection ??= openDB<LifeOsDb>("lifeos", 1, {
    upgrade(db) {
      db.createObjectStore("occurrences", { keyPath: "id" }).createIndex("byDate", "date");
      db.createObjectStore("queue", { keyPath: "clientOperationId" }).createIndex(
        "byQueuedAt",
        "queuedAt",
      );
      db.createObjectStore("meta");
    },
  });
  return connection;
}

/** Logout removes every piece of cached private data from this device (section 8). */
export async function wipeLocalData() {
  const db = await getDb();
  const tx = db.transaction(["occurrences", "queue", "meta"], "readwrite");
  await Promise.all([
    tx.objectStore("occurrences").clear(),
    tx.objectStore("queue").clear(),
    tx.objectStore("meta").clear(),
    tx.done,
  ]);
}
