import { Button } from "@lifeos/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@lifeos/ui/components/dialog";
import { Input } from "@lifeos/ui/components/input";
import { Progress } from "@lifeos/ui/components/progress";
import { Archive, Pencil, Target, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, messageOf } from "@/app/api";
import type { Goal, Metric } from "@/app/types";
import { EditableName, Field, NativeSelect } from "@/components/common/forms";
import { EmptyState, ErrorState, PageHeader, PageSkeleton } from "@/components/common/states";
import { ChartWidget } from "@/features/analytics/widgets";

function MetricHistory({ metric }: { metric: Metric }) {
  const { data, isLoading } = api.useMetricLogsQuery({ metricId: metric.id, limit: 20 });
  const [update] = api.useUpdateMetricLogMutation();
  const [remove] = api.useDeleteMetricLogMutation();
  if (isLoading) return <p className="text-sm text-ink-muted">Loading entries</p>;
  if (!data?.length) return <p className="text-sm text-ink-muted">No entries yet.</p>;
  const text = metric.kind === "text";
  return (
    <ul className="max-h-64 space-y-1 overflow-auto">
      {data.map((log) => {
        const when = new Date(log.recordedAt).toLocaleDateString();
        return (
          <li key={log.id} className="flex items-center gap-2 text-sm">
            <span className="w-24 shrink-0 text-ink-muted">{when}</span>
            <EditableName
              label={`Entry from ${when}`}
              value={String((text ? log.textValue : log.value) ?? "")}
              className="min-w-0 flex-1"
              onSave={(next) =>
                update(
                  text ? { id: log.id, textValue: next } : { id: log.id, value: Number(next) },
                ).unwrap()
              }
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete entry from ${when}`}
              onClick={() => {
                if (window.confirm("Delete this entry?")) void remove(log.id);
              }}
            >
              <Trash2 aria-hidden className="size-4" />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

function EditMetric({ metric, onClose }: { metric: Metric; onClose: () => void }) {
  const [update, { isLoading }] = api.useUpdateMetricMutation();
  const [archive] = api.useArchiveMetricMutation();
  const [form, setForm] = useState({ label: metric.label, unit: metric.unit ?? "" });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await update({ id: metric.id, label: form.label.trim(), unit: form.unit || null }).unwrap();
      onClose();
    } catch (err) {
      toast.error(messageOf(err));
    }
  };
  const remove = async () => {
    if (!window.confirm(`Delete ${metric.label}? Its entries will no longer appear.`)) return;
    try {
      await archive(metric.id).unwrap();
      onClose();
    } catch (err) {
      toast.error(messageOf(err));
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Edit metric</DialogTitle>
          <DialogDescription>Correct past entries here, or rename the metric.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void save(e)} className="space-y-3">
          <Field id="em-label" label="Name">
            <Input
              id="em-label"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </Field>
          <Field id="em-unit" label="Unit">
            <Input
              id="em-unit"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={isLoading || !form.label.trim()}>
            Save metric
          </Button>
        </form>
        <section aria-label="Recent entries">
          <h3 className="mb-1 text-sm font-medium">Recent entries</h3>
          <MetricHistory metric={metric} />
        </section>
        <Button variant="ghost" className="text-danger" onClick={() => void remove()}>
          Delete metric
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function EditGoal({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const [update, { isLoading }] = api.useUpdateGoalMutation();
  const [form, setForm] = useState({
    title: goal.title,
    target: String(goal.target),
    period: goal.period,
  });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await update({
        id: goal.id,
        title: form.title.trim(),
        target: Number(form.target),
        period: form.period,
      }).unwrap();
      onClose();
    } catch (err) {
      toast.error(messageOf(err));
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit goal</DialogTitle>
          <DialogDescription>Progress recalculates from your logged entries.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void save(e)} className="space-y-3">
          <Field id="eg-title" label="Goal">
            <Input
              id="eg-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field id="eg-target" label="Target">
            <Input
              id="eg-target"
              type="number"
              min="0"
              value={form.target}
              onChange={(e) => setForm({ ...form, target: e.target.value })}
            />
          </Field>
          <Field id="eg-period" label="Period">
            <NativeSelect
              id="eg-period"
              value={form.period}
              onChange={(e) => setForm({ ...form, period: e.target.value })}
            >
              {["daily", "weekly", "monthly", "yearly", "total"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </NativeSelect>
          </Field>
          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || !form.title.trim() || !(Number(form.target) > 0)}
          >
            Save goal
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MetricManager({ metrics }: { metrics: Metric[] }) {
  const [create, { isLoading }] = api.useCreateMetricMutation();
  const [log] = api.useLogMetricMutation();
  const [form, setForm] = useState({
    label: "",
    kind: "quantity",
    unit: "",
    aggregation: "sum",
    isSensitive: false,
  });
  const [values, setValues] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Metric | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = form.label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^(\d)/, "m_$1");
    if (!key) return;
    try {
      await create({ ...form, key, label: form.label.trim(), unit: form.unit || null }).unwrap();
      setForm({ ...form, label: "", unit: "" });
    } catch (err) {
      toast.error(messageOf(err));
    }
  };
  const record = async (m: Metric) => {
    const value = values[m.id];
    if (!value) return;
    try {
      await log(
        m.kind === "text"
          ? { metricId: m.id, textValue: value }
          : { metricId: m.id, value: Number(value) },
      ).unwrap();
      setValues({ ...values, [m.id]: "" });
      toast.success(`${m.label} logged`);
    } catch (err) {
      toast.error(messageOf(err));
    }
  };
  return (
    <section aria-labelledby="metrics" className="card-surface p-4">
      <h2 id="metrics" className="font-semibold">
        Metrics
      </h2>
      <ul className="mt-2 space-y-2">
        {metrics.map((m) => (
          <li key={m.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm">
              {m.label}
              {m.unit ? ` (${m.unit})` : ""}
            </span>
            <Input
              aria-label={`Log ${m.label}`}
              className="w-28"
              type={m.kind === "text" ? "text" : "number"}
              value={values[m.id] ?? ""}
              onChange={(e) => setValues({ ...values, [m.id]: e.target.value })}
            />
            <Button variant="outline" size="sm" onClick={() => void record(m)}>
              Log
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit metric ${m.label}`}
              onClick={() => setEditing(m)}
            >
              <Pencil aria-hidden className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => void submit(e)}
        className="mt-4 grid gap-3 sm:grid-cols-4 sm:items-end"
      >
        <Field id="m-label" label="New metric">
          <Input
            id="m-label"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
        </Field>
        <Field id="m-kind" label="Type">
          <NativeSelect
            id="m-kind"
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value })}
          >
            {["quantity", "duration", "boolean", "rating", "text"].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="m-unit" label="Unit">
          <Input
            id="m-unit"
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
          />
        </Field>
        <Button type="submit" variant="outline" disabled={isLoading || !form.label.trim()}>
          Add metric
        </Button>
        <label className="flex items-center gap-2 text-sm sm:col-span-4">
          <input
            type="checkbox"
            className="size-5"
            checked={form.isSensitive}
            onChange={(e) => setForm({ ...form, isSensitive: e.target.checked })}
          />
          Sensitive, such as health or medication. Excluded from AI unless you opt in.
        </label>
      </form>
      {editing && <EditMetric metric={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function GoalCard({ goal }: { goal: Goal }) {
  const [archive] = api.useArchiveGoalMutation();
  const [editing, setEditing] = useState(false);
  const percent = Math.round(goal.progress * 100);
  return (
    <li className="card-surface space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">{goal.title}</h3>
          <p className="text-sm text-ink-muted">
            <span className="capitalize">{goal.period}</span>: {goal.current} of {goal.target}{" "}
            {goal.metric?.unit ?? ""}
          </p>
        </div>
        <div className="flex">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit ${goal.title}`}
            onClick={() => setEditing(true)}
          >
            <Pencil aria-hidden className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Archive ${goal.title}`}
            onClick={() => void archive(goal.id)}
          >
            <Archive aria-hidden className="size-4" />
          </Button>
        </div>
      </div>
      {editing && <EditGoal goal={goal} onClose={() => setEditing(false)} />}
      <Progress value={percent} aria-label={`${goal.title}: ${percent} percent`} />
      {goal.milestones.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {goal.milestones.map((m) => (
            <li
              key={m.id}
              className={`rounded-full px-2.5 py-1 text-xs ${m.reachedAt ? "bg-reward-soft" : "bg-surface-2 text-ink-muted"}`}
            >
              {m.title}
              {m.reachedAt ? ", reached" : ""}
            </li>
          ))}
        </ul>
      )}
      {goal.metricId && (
        <ChartWidget
          title="Trend, last 30 days"
          type="line"
          spec={{
            source: "metric",
            measure: "sum",
            grain: "day",
            rangeDays: 30,
            metricId: goal.metricId,
          }}
        />
      )}
    </li>
  );
}

export function GoalsPage() {
  const goals = api.useGoalsQuery();
  const metrics = api.useMetricsQuery();
  const [create, { isLoading }] = api.useCreateGoalMutation();
  const [form, setForm] = useState({
    title: "",
    metricId: "",
    target: "",
    period: "weekly",
    milestone: "",
  });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = Number(form.target);
    if (!form.title.trim() || !(target > 0)) return;
    try {
      await create({
        title: form.title.trim(),
        metricId: form.metricId || null,
        target,
        period: form.period,
        milestones:
          Number(form.milestone) > 0
            ? [{ title: `Reach ${form.milestone}`, threshold: Number(form.milestone) }]
            : [],
      }).unwrap();
      setForm({ title: "", metricId: "", target: "", period: "weekly", milestone: "" });
    } catch (err) {
      toast.error(messageOf(err));
    }
  };
  return (
    <>
      <PageHeader title="Goals" description="Set targets on the metrics you track." />
      <div className="space-y-4">
        <form
          onSubmit={(e) => void submit(e)}
          className="card-surface grid gap-3 p-4 sm:grid-cols-2"
        >
          <Field id="g-title" label="Goal">
            <Input
              id="g-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field id="g-metric" label="Metric">
            <NativeSelect
              id="g-metric"
              value={form.metricId}
              onChange={(e) => setForm({ ...form, metricId: e.target.value })}
            >
              <option value="">None</option>
              {metrics.data?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="g-target" label="Target">
            <Input
              id="g-target"
              type="number"
              min="0"
              value={form.target}
              onChange={(e) => setForm({ ...form, target: e.target.value })}
            />
          </Field>
          <Field id="g-period" label="Period">
            <NativeSelect
              id="g-period"
              value={form.period}
              onChange={(e) => setForm({ ...form, period: e.target.value })}
            >
              {["daily", "weekly", "monthly", "yearly", "total"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="g-mile" label="Milestone (optional)">
            <Input
              id="g-mile"
              type="number"
              min="0"
              value={form.milestone}
              onChange={(e) => setForm({ ...form, milestone: e.target.value })}
            />
          </Field>
          <div className="self-end">
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || !form.title.trim() || !form.target}
            >
              Add goal
            </Button>
          </div>
        </form>
        {goals.isLoading && <PageSkeleton />}
        {goals.error && <ErrorState error={goals.error} retry={() => void goals.refetch()} />}
        {goals.data?.length === 0 && (
          <EmptyState
            icon={Target}
            title="No goals yet"
            description="Add a metric below, then set a target for it."
          />
        )}
        <ul className="grid gap-3 md:grid-cols-2">
          {goals.data?.map((g) => (
            <GoalCard key={g.id} goal={g} />
          ))}
        </ul>
        {metrics.data && <MetricManager metrics={metrics.data} />}
      </div>
    </>
  );
}
