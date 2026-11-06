import { Button } from "@lifeos/ui/components/button";
import { Input } from "@lifeos/ui/components/input";
import { Progress } from "@lifeos/ui/components/progress";
import { CalendarCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, messageOf } from "@/app/api";
import { useAppSelector } from "@/app/store";
import type { Occurrence } from "@/app/types";
import { EmptyState, ErrorState, PageHeader, PageSkeleton } from "@/components/common/states";
import { NativeSelect } from "@/components/common/forms";
import { VoiceInput } from "@/components/common/voice-input";
import { formatDate, localToday } from "@/lib/dates";
import { pendingIds } from "@/offline/queue";
import { useOccurrences } from "@/offline/use-sync";
import { OccurrenceCard } from "./occurrence-card";

export function QuickAdd({ today }: { today: string }) {
  const [title, setTitle] = useState("");
  const { data } = api.usePlannersQuery({ limit: 50 });
  const [plannerId, setPlannerId] = useState("");
  const [create, { isLoading }] = api.useCreateTaskMutation();
  const planners = data?.items ?? [];
  const target = plannerId || planners[0]?.id;
  if (planners.length === 0) return null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !target) return;
    try {
      await create({
        plannerId: target,
        title: title.trim(),
        schedule: { rrule: "FREQ=DAILY;COUNT=1", startsOn: today },
      }).unwrap();
      setTitle("");
    } catch (err) {
      toast.error(messageOf(err));
    }
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-wrap gap-2">
      <Input
        aria-label="New task for today"
        placeholder="Add a task for today"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="min-w-48 flex-1"
      />
      <VoiceInput value={title} onChange={setTitle} label="Speak a task" />
      {planners.length > 1 && (
        <NativeSelect
          aria-label="Planner"
          className="w-auto"
          value={target}
          onChange={(e) => setPlannerId(e.target.value)}
        >
          {planners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
      )}
      <Button type="submit" disabled={isLoading || !title.trim()}>
        Add
      </Button>
    </form>
  );
}

function DaySummary({ rows }: { rows: Occurrence[] }) {
  const eligible = rows.filter((r) => r.status === "pending" || r.status === "completed").length;
  const done = rows.filter((r) => r.status === "completed").length;
  const percent = eligible ? Math.round((done / eligible) * 100) : 0;
  return (
    <div className="card-surface p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-ink-muted">Today's progress</p>
        <p className="text-lg font-semibold">
          {done} of {eligible}
        </p>
      </div>
      <Progress className="mt-2" value={percent} aria-label={`${percent} percent complete`} />
      {eligible > 0 && done === eligible && (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-reward-soft p-2 text-sm font-medium">
          <Sparkles aria-hidden className="size-4" />
          Everything done for today
        </p>
      )}
    </div>
  );
}

export function TodayPage() {
  const { data: me } = api.useMeQuery();
  const timezone = me?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = localToday(timezone);
  const { rows, isLoading, error, refetch } = useOccurrences(today, today);
  const pendingCount = useAppSelector((s) => s.ui.pendingCount);
  const [pending, setPending] = useState<Set<string>>(new Set());
  useEffect(() => {
    void pendingIds().then(setPending);
  }, [pendingCount, rows]);

  const groups = useMemo(() => {
    const visible = (rows ?? []).filter((r) => r.status !== "not_applicable");
    const timed = visible
      .filter((r) => r.scheduledAt)
      .sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!));
    const untimed = visible.filter((r) => !r.scheduledAt);
    return { visible, timed, untimed };
  }, [rows]);

  return (
    <>
      <PageHeader
        title="Today"
        description={formatDate(today, { weekday: "long", month: "long", day: "numeric" })}
      />
      <div className="space-y-4">
        <QuickAdd today={today} />
        {isLoading && !error && <PageSkeleton />}
        {error != null && <ErrorState error={error} retry={() => void refetch()} />}
        {rows && groups.visible.length === 0 && (
          <EmptyState
            icon={CalendarCheck}
            title="Nothing scheduled today"
            description="Add a task above, or give a planner task a schedule."
            action={
              <Button asChild>
                <Link to="/app/planners">Open planners</Link>
              </Button>
            }
          />
        )}
        {rows && groups.visible.length > 0 && (
          <>
            <DaySummary rows={groups.visible} />
            {groups.timed.length > 0 && (
              <section aria-label="Scheduled">
                <h2 className="mb-2 text-sm font-semibold text-ink-muted">Scheduled</h2>
                <ul className="space-y-2">
                  {groups.timed.map((o) => (
                    <OccurrenceCard
                      key={o.id}
                      occurrence={o}
                      timezone={timezone}
                      pending={pending.has(o.id)}
                    />
                  ))}
                </ul>
              </section>
            )}
            {groups.untimed.length > 0 && (
              <section aria-label="Any time">
                <h2 className="mb-2 text-sm font-semibold text-ink-muted">Any time</h2>
                <ul className="space-y-2">
                  {groups.untimed.map((o) => (
                    <OccurrenceCard
                      key={o.id}
                      occurrence={o}
                      timezone={timezone}
                      pending={pending.has(o.id)}
                    />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
