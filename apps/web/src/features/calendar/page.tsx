import { Button } from "@lifeos/ui/components/button";
import { Tabs, TabsList, TabsTrigger } from "@lifeos/ui/components/tabs";
import { cn } from "@lifeos/ui/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, messageOf } from "@/app/api";
import type { Occurrence } from "@/app/types";
import { NativeSelect } from "@/components/common/forms";
import { ErrorState, PageHeader, PageSkeleton } from "@/components/common/states";
import { addDays, formatDate, localToday } from "@/lib/dates";
import { useOccurrences } from "@/offline/use-sync";

type View = "day" | "week" | "month";

function rangeFor(view: View, anchor: string) {
  if (view === "day") return { from: anchor, to: anchor };
  const d = new Date(`${anchor}T00:00:00Z`);
  if (view === "week") {
    const from = addDays(anchor, -((d.getUTCDay() + 6) % 7));
    return { from, to: addDays(from, 6) };
  }
  const first = `${anchor.slice(0, 8)}01`;
  const start = addDays(first, -((new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7));
  return { from: start, to: addDays(start, 41) };
}

function step(view: View, anchor: string, direction: number) {
  if (view === "day") return addDays(anchor, direction);
  if (view === "week") return addDays(anchor, direction * 7);
  const d = new Date(`${anchor.slice(0, 8)}01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + direction);
  return d.toISOString().slice(0, 10);
}

function Chip({ o, onDragStart }: { o: Occurrence; onDragStart: (o: Occurrence) => void }) {
  const movable = o.status === "pending";
  return (
    <Link
      to={`/app/tasks/${o.task.id}`}
      draggable={movable}
      onDragStart={() => onDragStart(o)}
      className={cn("block truncate rounded-md border-l-4 bg-surface-2 px-1.5 py-1 text-xs", o.status === "completed" && "line-through opacity-70")}
      style={{ borderLeftColor: o.task.planner.color }}
    >
      {o.task.title}
    </Link>
  );
}

/** Long lists stay fast because only the visible rows are rendered. */
function AgendaList({ rows, moveTo, dates }: { rows: Occurrence[]; moveTo: (o: Occurrence, date: string) => void; dates: string[] }) {
  const parent = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => parent.current, estimateSize: () => 64, overscan: 8 });
  return (
    <div ref={parent} className="max-h-[60vh] overflow-auto">
      <ul style={{ height: virtual.getTotalSize(), position: "relative" }}>
        {virtual.getVirtualItems().map((item) => {
          const o = rows[item.index]!;
          return (
            <li key={o.id} className="absolute inset-x-0 flex items-center gap-2 border-b py-2" style={{ height: item.size, transform: `translateY(${item.start}px)` }}>
              <span className="w-16 shrink-0 text-xs text-ink-muted">{formatDate(o.date)}</span>
              <Link to={`/app/tasks/${o.task.id}`} className="min-w-0 flex-1 truncate text-sm font-medium">{o.task.title}</Link>
              {o.status === "pending" ? (
                <NativeSelect aria-label={`Move ${o.task.title} to another day`} className="w-28" value="" onChange={(e) => e.target.value && moveTo(o, e.target.value)}>
                  <option value="">Move to</option>
                  {dates.filter((d) => d !== o.date.slice(0, 10)).map((d) => <option key={d} value={d}>{formatDate(d)}</option>)}
                </NativeSelect>
              ) : <span className="text-xs capitalize text-ink-muted">{o.status.replace("_", " ")}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CalendarPage() {
  const { data: me } = api.useMeQuery();
  const timezone = me?.timezone ?? "UTC";
  const today = localToday(timezone);
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(today);
  const { from, to } = rangeFor(view, anchor);
  const { rows, isLoading, error, refetch } = useOccurrences(from, to);
  const [defer] = api.useDeferOccurrenceMutation();
  const dragged = useRef<Occurrence | null>(null);

  const dates = useMemo(() => {
    const out: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
    return out;
  }, [from, to]);
  const visible = useMemo(() => (rows ?? []).filter((r) => r.status !== "not_applicable"), [rows]);
  const byDate = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const r of visible) map.set(r.date.slice(0, 10), [...(map.get(r.date.slice(0, 10)) ?? []), r]);
    return map;
  }, [visible]);

  const moveTo = async (o: Occurrence, date: string) => {
    if (date === o.date.slice(0, 10)) return;
    try {
      await defer({ id: o.id, toDate: date, expectedVersion: o.version }).unwrap();
      toast.success(`Moved to ${formatDate(date)}`);
    } catch (err) {
      toast.error(messageOf(err));
    }
  };
  const title = view === "month" ? formatDate(`${anchor.slice(0, 8)}01`, { month: "long", year: "numeric" }) : view === "day" ? formatDate(anchor, { weekday: "long", month: "long", day: "numeric" }) : `${formatDate(from)} to ${formatDate(to)}`;

  return (
    <>
      <PageHeader title="Calendar" description={`Times shown in ${timezone}`} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label="Previous" onClick={() => setAnchor(step(view, anchor, -1))}><ChevronLeft aria-hidden className="size-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(today)}>Today</Button>
          <Button variant="outline" size="icon-sm" aria-label="Next" onClick={() => setAnchor(step(view, anchor, 1))}><ChevronRight aria-hidden className="size-4" /></Button>
          <h2 className="ml-2 font-semibold" aria-live="polite">{title}</h2>
        </div>
        <Tabs value={view} onValueChange={(v) => setView(v as View)}>
          <TabsList>
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {isLoading && !error && <PageSkeleton />}
      {error != null && <ErrorState error={error} retry={() => void refetch()} />}
      {rows && view !== "day" && (
        <div className="card-surface hidden overflow-hidden md:block">
          <div className="grid grid-cols-7 border-b text-center text-xs font-medium text-ink-muted">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="p-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {dates.map((date) => {
              const items = byDate.get(date) ?? [];
              const outside = view === "month" && date.slice(0, 7) !== anchor.slice(0, 7);
              return (
                <div
                  key={date}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => dragged.current && void moveTo(dragged.current, date)}
                  className={cn("min-h-24 space-y-1 border-r border-b p-1.5", outside && "opacity-50")}
                >
                  <p className={cn("text-xs", date === today ? "font-bold text-primary" : "text-ink-muted")}>{Number(date.slice(8))}</p>
                  {items.slice(0, 4).map((o) => <Chip key={o.id} o={o} onDragStart={(x) => (dragged.current = x)} />)}
                  {items.length > 4 && <p className="text-xs text-ink-muted">{items.length - 4} more</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {rows && (
        <div className={cn("card-surface p-3", view !== "day" && "mt-4 md:hidden")}>
          {visible.length === 0 ? <p className="p-4 text-center text-sm text-ink-muted">Nothing scheduled in this period.</p> : <AgendaList rows={visible} dates={dates} moveTo={(o, d) => void moveTo(o, d)} />}
        </div>
      )}
      {rows && view !== "day" && visible.length > 0 && (
        <details className="mt-4 hidden md:block">
          <summary className="cursor-pointer text-sm text-ink-muted">List view, with keyboard move controls</summary>
          <div className="card-surface mt-2 p-3"><AgendaList rows={visible} dates={dates} moveTo={(o, d) => void moveTo(o, d)} /></div>
        </details>
      )}
    </>
  );
}
