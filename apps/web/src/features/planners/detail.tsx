import { Button } from "@lifeos/ui/components/button";
import { ChevronDown, ChevronRight, ListPlus, Pencil, Save } from "lucide-react";
import { createContext, useContext, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api, messageOf } from "@/app/api";
import type { Occurrence, PlannerDetail, TaskRow } from "@/app/types";
import { EmptyState, ErrorState, PageHeader, PageSkeleton } from "@/components/common/states";
import { haptic, StrikeText } from "@/components/experience/completion-pulse";
import { TaskCompletionControl } from "@/features/today/occurrence-card";
import { browserTimezone, localToday } from "@/lib/dates";
import type { CachedOccurrence } from "@/offline/db";
import { cacheOccurrences } from "@/offline/queue";
import { actOnOccurrence, useOccurrences } from "@/offline/use-sync";
import { buildTree, describeRule, type TreeNode } from "./tree";

const TodayContext = createContext<Map<string, Occurrence>>(new Map());

/** Ticks the task for today. An unscheduled task gets its entry from the server on first tick. */
function TaskCheck({ task }: { task: TaskRow }) {
  const occurrence = useContext(TodayContext).get(task.id);
  const [ensure, { isLoading }] = api.useEnsureTodayOccurrenceMutation();
  if (occurrence) {
    if (occurrence.status === "pending" || occurrence.status === "completed") {
      return <TaskCompletionControl occurrence={occurrence} />;
    }
    return (
      <span className="w-11 text-center text-xs capitalize text-ink-muted">
        {occurrence.status}
      </span>
    );
  }
  if (task.schedules.length > 0) {
    return (
      <span className="w-11 text-center text-xs leading-tight text-ink-muted">Not due today</span>
    );
  }
  const tick = async () => {
    try {
      const row = await ensure(task.id).unwrap();
      await cacheOccurrences([row as CachedOccurrence]);
      haptic();
      await actOnOccurrence(row, "complete");
    } catch (err) {
      toast.error(
        (err as { status?: number }).status === 0
          ? "Ticking this task needs a connection"
          : messageOf(err),
      );
    }
  };
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={false}
      aria-label={`${task.title}: not done`}
      disabled={isLoading}
      onClick={() => void tick()}
      className="tactile size-11 shrink-0 rounded-full border-2 border-input bg-surface"
    />
  );
}

export function TaskRowView({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(true);
  const { task, children } = node;
  const done = useContext(TodayContext).get(task.id)?.status === "completed";
  return (
    <li>
      <div
        className="flex min-h-11 items-center gap-1 rounded-lg px-1 py-1 hover:bg-surface-2"
        style={{ paddingLeft: depth * 16 }}
      >
        {children.length > 0 ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${task.title}`}
            onClick={() => setOpen(!open)}
          >
            {open ? (
              <ChevronDown aria-hidden className="size-4" />
            ) : (
              <ChevronRight aria-hidden className="size-4" />
            )}
          </Button>
        ) : (
          <span className="w-3" />
        )}
        <TaskCheck task={task} />
        <Link
          to={`/app/tasks/${task.id}`}
          className="ml-2 min-w-0 flex-1 truncate text-sm font-medium hover:underline"
        >
          <StrikeText done={done}>{task.title}</StrikeText>
        </Link>
        <span className="hidden shrink-0 text-xs text-ink-muted sm:inline">
          {describeRule(task.schedules[0]?.rrule)}
        </span>
      </div>
      {open && children.length > 0 && <SubtaskList nodes={children} depth={depth + 1} />}
    </li>
  );
}

export function SubtaskList({ nodes, depth }: { nodes: TreeNode[]; depth: number }) {
  return (
    <ul>
      {nodes.map((n) => (
        <TaskRowView key={n.task.id} node={n} depth={depth} />
      ))}
    </ul>
  );
}

function TaskTree({ planner }: { planner: PlannerDetail }) {
  const sections = planner.sections.map((s) => ({
    ...s,
    tasks: planner.tasks.filter((t) => t.sectionId === s.id),
  }));
  const loose = planner.tasks.filter((t) => !t.sectionId);
  return (
    <div className="space-y-4">
      {sections.map((s) => (
        <section key={s.id} className="card-surface p-3" aria-label={s.name}>
          <h2 className="mb-1 px-2 font-semibold">{s.name}</h2>
          {s.tasks.length ? (
            <SubtaskList nodes={buildTree(s.tasks)} depth={0} />
          ) : (
            <p className="px-2 text-sm text-ink-muted">No tasks in this section.</p>
          )}
        </section>
      ))}
      {loose.length > 0 && (
        <section className="card-surface p-3" aria-label="Tasks">
          <SubtaskList nodes={buildTree(loose)} depth={0} />
        </section>
      )}
    </div>
  );
}

export function PlannerPage() {
  const { id = "" } = useParams();
  const { data, isLoading, error, refetch } = api.usePlannerQuery(id);
  const { data: me } = api.useMeQuery();
  const today = localToday(me?.timezone ?? browserTimezone());
  const { rows } = useOccurrences(today, today, id);
  const todayByTask = useMemo(() => new Map(rows?.map((o) => [o.task.id, o])), [rows]);
  const [saveTemplate, { isLoading: saving }] = api.useCreateTemplateMutation();
  const asTemplate = async () => {
    try {
      await saveTemplate({ name: data!.name, plannerId: id }).unwrap();
      toast.success("Saved to your templates");
    } catch (err) {
      toast.error(messageOf(err));
    }
  };
  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <ErrorState error={error} retry={() => void refetch()} />;
  return (
    <>
      <PageHeader
        title={data.name}
        description={data.description ?? undefined}
        actions={
          <>
            <Button
              variant="outline"
              disabled={saving || data.tasks.length === 0}
              onClick={() => void asTemplate()}
            >
              <Save aria-hidden className="size-4" />
              Save as template
            </Button>
            <Button asChild>
              <Link to={`/app/planners/${id}/edit`}>
                <Pencil aria-hidden className="size-4" />
                Edit
              </Link>
            </Button>
          </>
        }
      />
      {data.tasks.length === 0 && data.sections.length === 0 ? (
        <EmptyState
          icon={ListPlus}
          title="This planner is empty"
          description="Add sections and tasks in the builder."
          action={
            <Button asChild>
              <Link to={`/app/planners/${id}/edit`}>Open builder</Link>
            </Button>
          }
        />
      ) : (
        <TodayContext.Provider value={todayByTask}>
          <TaskTree planner={data} />
        </TodayContext.Provider>
      )}
    </>
  );
}
