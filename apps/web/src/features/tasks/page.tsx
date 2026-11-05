import { Button } from "@lifeos/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lifeos/ui/components/dialog";
import { Input } from "@lifeos/ui/components/input";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api, messageOf } from "@/app/api";
import { ErrorState, PageSkeleton } from "@/components/common/states";
import { describeRule } from "@/features/planners/tree";
import { formatDate } from "@/lib/dates";

/** Modal on desktop, full screen on mobile (section 3). */
export function TaskPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = api.useTaskQuery(id);
  const [create, { isLoading: adding }] = api.useCreateTaskMutation();
  const [title, setTitle] = useState("");
  const addSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data || !title.trim()) return;
    try {
      await create({ plannerId: data.plannerId, title: title.trim(), parentTaskId: id, sectionId: data.sectionId }).unwrap();
      setTitle("");
      void refetch();
    } catch (err) {
      toast.error(messageOf(err));
    }
  };
  const activity = data?.occurrences.flatMap((o) => o.events.map((e) => ({ ...e, date: o.date }))) ?? [];
  return (
    <Dialog open onOpenChange={(o) => !o && navigate(-1)}>
      <DialogContent className="h-dvh max-w-none overflow-auto rounded-none sm:h-auto sm:max-h-[85dvh] sm:max-w-lg sm:rounded-2xl">
        <DialogTitle>{data?.title ?? "Task"}</DialogTitle>
        <DialogDescription className="sr-only">Task details, subtasks, schedule and activity</DialogDescription>
        {isLoading && <PageSkeleton rows={2} />}
        {error && <ErrorState error={error} retry={() => void refetch()} />}
        {data && (
          <div className="space-y-5">
            {data.description && <p className="text-sm whitespace-pre-wrap">{data.description}</p>}
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-ink-muted">Schedule</dt>
              <dd>{describeRule(data.schedules[0]?.rrule)}{data.schedules[0]?.localTime ? ` at ${data.schedules[0].localTime}` : ""}</dd>
              {data.targetValue !== null && (<><dt className="text-ink-muted">Target</dt><dd>{data.targetValue} {data.targetUnit}</dd></>)}
            </dl>
            <section aria-labelledby="subtasks">
              <h3 id="subtasks" className="mb-1 font-medium">Subtasks</h3>
              <ul className="mb-2 space-y-1 text-sm">
                {data.children.map((c) => <li key={c.id}><Link className="underline" to={`/app/tasks/${c.id}`}>{c.title}</Link></li>)}
                {data.children.length === 0 && <li className="text-ink-muted">None yet</li>}
              </ul>
              <form onSubmit={(e) => void addSubtask(e)} className="flex gap-2">
                <Input aria-label="New subtask" placeholder="Add a subtask" value={title} onChange={(e) => setTitle(e.target.value)} />
                <Button type="submit" variant="outline" disabled={adding || !title.trim()}>Add</Button>
              </form>
            </section>
            <section aria-labelledby="activity">
              <h3 id="activity" className="mb-1 font-medium">Activity</h3>
              {activity.length === 0 ? <p className="text-sm text-ink-muted">No activity yet.</p> : (
                <ul className="space-y-1 text-sm">
                  {activity.slice(0, 20).map((e) => (
                    <li key={e.id} className="flex justify-between gap-2">
                      <span className="capitalize">{e.action}{e.reason ? `: ${e.reason}` : ""}</span>
                      <span className="shrink-0 text-ink-muted">{formatDate(e.date)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <Button variant="outline" asChild className="w-full"><Link to={`/app/planners/${data.plannerId}/edit`}>Edit in planner</Link></Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
