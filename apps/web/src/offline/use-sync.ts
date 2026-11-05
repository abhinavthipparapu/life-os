import { useCallback, useEffect, useState } from "react";
import { api, messageOf } from "@/app/api";
import { store, ui, useAppDispatch, useAppSelector, type Celebration } from "@/app/store";
import type { Occurrence } from "@/app/types";
import type { CachedOccurrence } from "./db";
import { enqueueOccurrenceAction, listQueue, readOccurrences, replaceRange } from "./queue";
import { replayQueue } from "./sync";

const refreshed = new EventTarget();
const notifyLocalChange = () => refreshed.dispatchEvent(new Event("change"));

async function refreshCount() {
  const queue = await listQueue();
  store.dispatch(ui.actions.setPendingCount(queue.length));
}

/** Replays the queue. Called on foreground, reconnect and manual Sync, never only Background Sync. */
export async function syncNow() {
  if (!navigator.onLine) return;
  store.dispatch(ui.actions.setSyncing(true));
  try {
    const summary = await replayQueue();
    if (summary.conflicts.length) store.dispatch(ui.actions.setConflicts(summary.conflicts));
    for (const c of summary.celebrations) store.dispatch(ui.actions.celebrate(c as Celebration));
    if (summary.sent) {
      store.dispatch(api.util.invalidateTags(["Occurrence", "Home", "Analytics", "Achievement", "Goal"]));
    }
  } catch {
    // The queue is untouched on failure, and the next trigger retries it.
  } finally {
    store.dispatch(ui.actions.setSyncing(false));
    await refreshCount();
    notifyLocalChange();
  }
}

export function useSyncEngine() {
  const dispatch = useAppDispatch();
  useEffect(() => {
    const online = () => {
      dispatch(ui.actions.setOnline(true));
      void syncNow();
    };
    const offline = () => dispatch(ui.actions.setOnline(false));
    const visible = () => {
      if (document.visibilityState === "visible") void syncNow();
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visible);
    void refreshCount().then(syncNow);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [dispatch]);
}

/** Reads through IndexedDB, so the same view works online, offline and mid-sync. */
export function useOccurrences(from: string, to: string, plannerId?: string) {
  const online = useAppSelector((s) => s.ui.online);
  const query = api.useOccurrencesQuery({ from, to, plannerId }, { skip: !online });
  const [rows, setRows] = useState<Occurrence[] | null>(null);

  const load = useCallback(async () => {
    const local = (await readOccurrences(from, to)) as Occurrence[];
    setRows(plannerId ? local.filter((r) => r.task.plannerId === plannerId) : local);
  }, [from, to, plannerId]);

  useEffect(() => {
    if (query.data) void replaceRange(from, to, query.data as CachedOccurrence[], plannerId).then(load);
    else if (!online || query.isError) void load();
  }, [query.data, query.isError, online, from, to, plannerId, load]);

  useEffect(() => {
    const listener = () => void load();
    refreshed.addEventListener("change", listener);
    return () => refreshed.removeEventListener("change", listener);
  }, [load]);

  return {
    rows,
    isLoading: rows === null,
    error: rows === null ? query.error : undefined,
    refetch: query.refetch,
  };
}

export async function actOnOccurrence(
  occurrence: Pick<Occurrence, "id" | "version">,
  action: "complete" | "skip" | "reopen",
  payload: Record<string, unknown> = {},
) {
  await enqueueOccurrenceAction(occurrence, action, payload);
  notifyLocalChange();
  await refreshCount();
  void syncNow();
}

export { messageOf };
