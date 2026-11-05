import { LIMITS, type ApiEnvelope, type SyncOutcome } from "@lifeos/contracts";
import { env } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import { listQueue, markConflict, pendingIds, removeFromQueue, saveServerOccurrence } from "./queue";

interface ResultRow {
  clientOperationId: string;
  outcome: SyncOutcome;
  occurrence?: { id: string; status: string; version: number };
  current?: { id: string; status: string; version: number };
  celebration?: unknown;
}

export interface SyncSummary {
  sent: number;
  conflicts: { clientOperationId: string; current: NonNullable<ResultRow["current"]> }[];
  rejected: number;
  celebrations: unknown[];
}

export type Transport = (operations: unknown[]) => Promise<ResultRow[]>;

const httpTransport: Transport = async (operations) => {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Not signed in");
  const res = await fetch(`${env.VITE_API_URL}/api/v1/sync/batch`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify({ operations }),
  });
  if (!res.ok) throw new Error(`Sync failed with status ${res.status}`);
  return ((await res.json()) as ApiEnvelope<ResultRow[]>).data ?? [];
};

let running: Promise<SyncSummary> | null = null;

/** Single flight, so foreground, reconnect and manual triggers cannot send the same batch twice. */
export function replayQueue(transport: Transport = httpTransport): Promise<SyncSummary> {
  running ??= drain(transport).finally(() => {
    running = null;
  });
  return running;
}

async function drain(transport: Transport): Promise<SyncSummary> {
  const summary: SyncSummary = { sent: 0, conflicts: [], rejected: 0, celebrations: [] };
  // Re-reads the queue each pass, so anything tapped during a replay goes out in this same run.
  for (;;) {
    const operations = (await listQueue()).filter((op) => !op.conflict);
    if (operations.length === 0) return summary;
    const batch = operations.slice(0, LIMITS.maxSyncBatch).map(({ queuedAt: _q, conflict: _c, ...op }) => op);
    const results = await transport(batch);
    // A reply that matches nothing in this batch can never shrink the queue, so stop here.
    const sentIds = new Set(batch.map((op) => op.clientOperationId));
    if (!results.some((r) => sentIds.has(r.clientOperationId))) return summary;

    const done: string[] = [];
    const confirmed: NonNullable<ResultRow["occurrence"]>[] = [];
    for (const result of results) {
      summary.sent += 1;
      if (result.outcome === "conflict" && result.current) {
        await markConflict(result.clientOperationId);
        summary.conflicts.push({ clientOperationId: result.clientOperationId, current: result.current });
        continue;
      }
      done.push(result.clientOperationId);
      if (result.outcome === "rejected") summary.rejected += 1;
      if (result.occurrence) confirmed.push(result.occurrence);
      if (result.celebration) summary.celebrations.push(result.celebration);
    }
    await removeFromQueue(done);
    // A newer queued change wins over this result. Its own reply will update the row later.
    const stillQueued = await pendingIds();
    for (const occurrence of confirmed) {
      if (!stillQueued.has(occurrence.id)) await saveServerOccurrence(occurrence);
    }
  }
}
