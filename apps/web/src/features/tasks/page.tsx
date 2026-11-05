import { Button } from "@lifeos/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@lifeos/ui/components/dialog";
import { Input } from "@lifeos/ui/components/input";
import { Switch } from "@lifeos/ui/components/switch";
import { Textarea } from "@lifeos/ui/components/textarea";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api, messageOf, problemOf } from "@/app/api";
import type { FieldDefinition, TaskDetail } from "@/app/types";
import { Field, NativeSelect } from "@/components/common/forms";
import { ErrorState, PageSkeleton } from "@/components/common/states";
import { describeRule } from "@/features/planners/tree";
import { formatDate } from "@/lib/dates";

function TaskEditor({
  task,
  fields,
  onSaved,
}: {
  task: TaskDetail;
  fields: FieldDefinition[];
  onSaved: () => void;
}) {
  const [update, { isLoading }] = api.useUpdateTaskMutation();
  const initial = Object.fromEntries(
    task.fieldValues.map((v) => [v.fieldDefinitionId, v.valueJson]),
  );
  const [form, setForm] = useState({
    description: task.description ?? "",
    type: task.type,
    targetValue: task.targetValue === null ? "" : String(task.targetValue),
    targetUnit: task.targetUnit ?? "",
  });
  const [values, setValues] = useState<Record<string, unknown>>(initial);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const custom: Record<string, unknown> = {};
    for (const f of fields) {
      const value = values[f.id];
      if (value === undefined || value === "") continue;
      custom[f.key] = f.type === "number" || f.type === "rating" ? Number(value) : value;
    }
    try {
      await update({
        id: task.id,
        plannerId: task.plannerId,
        expectedVersion: task.version,
        description: form.description || null,
        type: form.type,
        targetValue: form.targetValue === "" ? null : Number(form.targetValue),
        targetUnit: form.targetUnit || null,
        fields: custom,
      }).unwrap();
      toast.success("Saved");
      onSaved();
    } catch (err) {
      const problem = problemOf(err);
      toast.error(problem?.errors?.[0]?.message ?? messageOf(err));
    }
  };
  return (
    <form onSubmit={(e) => void save(e)} className="space-y-3">
      <Field id="t-desc" label="Description">
        <Textarea
          id="t-desc"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field id="t-type" label="Type">
          <NativeSelect
            id="t-type"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as TaskDetail["type"] })}
          >
            {["checkbox", "quantity", "duration", "rating", "text"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="t-target" label="Target">
          <Input
            id="t-target"
            type="number"
            value={form.targetValue}
            onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
          />
        </Field>
        <Field id="t-unit" label="Unit">
          <Input
            id="t-unit"
            value={form.targetUnit}
            onChange={(e) => setForm({ ...form, targetUnit: e.target.value })}
          />
        </Field>
      </div>
      {fields.map((f) => {
        const id = `cf-${f.key}`;
        const set = (value: unknown) => setValues({ ...values, [f.id]: value });
        const current = values[f.id];
        return (
          <Field key={f.id} id={id} label={f.label}>
            {f.type === "boolean" ? (
              <Switch id={id} checked={current === true} onCheckedChange={set} />
            ) : f.type === "select" ? (
              <NativeSelect
                id={id}
                value={String(current ?? "")}
                onChange={(e) => set(e.target.value)}
              >
                <option value="">Not set</option>
                {f.validationJson.options?.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </NativeSelect>
            ) : (
              <Input
                id={id}
                type={
                  f.type === "number" || f.type === "rating"
                    ? "number"
                    : f.type === "date"
                      ? "date"
                      : "text"
                }
                value={String(current ?? "")}
                onChange={(e) => set(e.target.value)}
              />
            )}
          </Field>
        );
      })}
      <Button type="submit" variant="outline" className="w-full" disabled={isLoading}>
        Save changes
      </Button>
    </form>
  );
}

/** Modal on desktop, full screen on mobile (section 3). */
export function TaskPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = api.useTaskQuery(id);
  const { data: planner } = api.usePlannerQuery(data?.plannerId ?? "", { skip: !data });
  const [create, { isLoading: adding }] = api.useCreateTaskMutation();
  const [title, setTitle] = useState("");
  const addSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data || !title.trim()) return;
    try {
      await create({
        plannerId: data.plannerId,
        title: title.trim(),
        parentTaskId: id,
        sectionId: data.sectionId,
      }).unwrap();
      setTitle("");
      void refetch();
    } catch (err) {
      toast.error(messageOf(err));
    }
  };
  const activity =
    data?.occurrences.flatMap((o) => o.events.map((e) => ({ ...e, date: o.date }))) ?? [];
  return (
    <Dialog open onOpenChange={(o) => !o && navigate(-1)}>
      <DialogContent className="h-dvh max-w-none overflow-auto rounded-none sm:h-auto sm:max-h-[85dvh] sm:max-w-lg sm:rounded-2xl">
        <DialogTitle>{data?.title ?? "Task"}</DialogTitle>
        <DialogDescription className="sr-only">
          Task details, subtasks, schedule and activity
        </DialogDescription>
        {isLoading && <PageSkeleton rows={2} />}
        {error && <ErrorState error={error} retry={() => void refetch()} />}
        {data && (
          <div className="space-y-5">
            <TaskEditor
              key={data.version}
              task={data}
              fields={planner?.fieldDefinitions ?? []}
              onSaved={() => void refetch()}
            />
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-ink-muted">Schedule</dt>
              <dd>
                {describeRule(data.schedules[0]?.rrule)}
                {data.schedules[0]?.localTime ? ` at ${data.schedules[0].localTime}` : ""}
              </dd>
              {data.targetValue !== null && (
                <>
                  <dt className="text-ink-muted">Target</dt>
                  <dd>
                    {data.targetValue} {data.targetUnit}
                  </dd>
                </>
              )}
            </dl>
            <section aria-labelledby="subtasks">
              <h3 id="subtasks" className="mb-1 font-medium">
                Subtasks
              </h3>
              <ul className="mb-2 space-y-1 text-sm">
                {data.children.map((c) => (
                  <li key={c.id}>
                    <Link className="underline" to={`/app/tasks/${c.id}`}>
                      {c.title}
                    </Link>
                  </li>
                ))}
                {data.children.length === 0 && <li className="text-ink-muted">None yet</li>}
              </ul>
              <form onSubmit={(e) => void addSubtask(e)} className="flex gap-2">
                <Input
                  aria-label="New subtask"
                  placeholder="Add a subtask"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <Button type="submit" variant="outline" disabled={adding || !title.trim()}>
                  Add
                </Button>
              </form>
            </section>
            <section aria-labelledby="activity">
              <h3 id="activity" className="mb-1 font-medium">
                Activity
              </h3>
              {activity.length === 0 ? (
                <p className="text-sm text-ink-muted">No activity yet.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {activity.slice(0, 20).map((e) => (
                    <li key={e.id} className="flex justify-between gap-2">
                      <span className="capitalize">
                        {e.action}
                        {e.reason ? `: ${e.reason}` : ""}
                      </span>
                      <span className="shrink-0 text-ink-muted">{formatDate(e.date)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <Button variant="outline" asChild className="w-full">
              <Link to={`/app/planners/${data.plannerId}/edit`}>Edit in planner</Link>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
