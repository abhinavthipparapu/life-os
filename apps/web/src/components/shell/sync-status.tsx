import { Button } from "@lifeos/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@lifeos/ui/components/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@lifeos/ui/components/popover";
import { AlertTriangle, CheckCircle2, CloudOff, RefreshCw } from "lucide-react";
import { ui, useAppDispatch, useAppSelector } from "@/app/store";
import { removeFromQueue, retryWithVersion, saveServerOccurrence } from "@/offline/queue";
import { syncNow } from "@/offline/use-sync";

export function SyncStatus() {
  const { online, syncing, pendingCount, conflicts } = useAppSelector((s) => s.ui);
  const dispatch = useAppDispatch();
  const label = !online
    ? pendingCount ? `Offline, ${pendingCount} pending sync` : "Offline"
    : syncing ? "Syncing" : pendingCount ? `${pendingCount} pending sync` : "Synced";
  const Icon = !online ? CloudOff : syncing ? RefreshCw : pendingCount ? AlertTriangle : CheckCircle2;

  const resolve = async (keepMine: boolean) => {
    const [first, ...rest] = conflicts;
    if (!first) return;
    await saveServerOccurrence(first.current);
    if (keepMine) await retryWithVersion(first.clientOperationId, first.current.version);
    else await removeFromQueue([first.clientOperationId]);
    dispatch(ui.actions.setConflicts(rest));
    await syncNow();
  };
  const conflict = conflicts[0];

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" aria-label={`Sync status: ${label}`}>
            <Icon aria-hidden className={syncing ? "size-4 animate-spin" : "size-4"} />
            <span className="hidden text-xs sm:inline" aria-live="polite">{label}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 space-y-3 text-sm">
          <p className="font-medium">{label}</p>
          <p className="text-ink-muted">
            Changes made offline are stored on this device until they sync. Clearing browser data before then will lose them.
          </p>
          <Button size="sm" variant="outline" className="w-full" disabled={!online || syncing} onClick={() => void syncNow()}>
            Sync now
          </Button>
        </PopoverContent>
      </Popover>
      <Dialog open={Boolean(conflict)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>This task changed on another device</DialogTitle>
            <DialogDescription>
              It is now marked <strong>{conflict?.current.status}</strong> on the server. Which version do you want to keep?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="flex-1" onClick={() => void resolve(true)}>Keep my change</Button>
            <Button className="flex-1" variant="outline" onClick={() => void resolve(false)}>Use the server version</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
