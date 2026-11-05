import { Button } from "@lifeos/ui/components/button";
import { Input } from "@lifeos/ui/components/input";
import { Progress } from "@lifeos/ui/components/progress";
import { Archive, Target } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, messageOf } from "@/app/api";
import type { Goal, Metric } from "@/app/types";
import { Field, NativeSelect } from "@/components/common/forms";
import { EmptyState, ErrorState, PageHeader, PageSkeleton } from "@/components/common/states";
import { ChartWidget } from "@/features/analytics/widgets";

function MetricManager({ metrics }: { metrics: Metric[] }) {
  const [create, { isLoading }] = api.useCreateMetricMutation();
  const [log] = api.useLogMetricMutation();
  const [form, setForm] = useState({ label: "", kind: "quantity", unit: "", aggregation: "sum", isSensitive: false });
  const [values, setValues] = useState<Record<string, string>>({});
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = form.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "m_$1");
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
      await log(m.kind === "text" ? { metricId: m.id, textValue: value } : { metricId: m.id, value: Number(value) }).unwrap();
      setValues({ ...values, [m.id]: "" });
      toast.success(`${m.label} logged`);
    } catch (err) {
      toast.error(messageOf(err));
    }
  };
  return (
    <section aria-labelledby="metrics" className="card-surface p-4">
      <h2 id="metrics" className="font-semibold">Metrics</h2>
      <ul className="mt-2 space-y-2">
        {metrics.map((m) => (
          <li key={m.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm">{m.label}{m.unit ? ` (${m.unit})` : ""}</span>
            <Input aria-label={`Log ${m.label}`} className="w-28" type={m.kind === "text" ? "text" : "number"} value={values[m.id] ?? ""} onChange={(e) => setValues({ ...values, [m.id]: e.target.value })} />
            <Button variant="outline" size="sm" onClick={() => void record(m)}>Log</Button>
          </li>
        ))}
      </ul>
      <form onSubmit={(e) => void submit(e)} className="mt-4 grid gap-3 sm:grid-cols-4 sm:items-end">
        <Field id="m-label" label="New metric"><Input id="m-label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></Field>
        <Field id="m-kind" label="Type">
          <NativeSelect id="m-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {["quantity", "duration", "boolean", "rating", "text"].map((k) => <option key={k}>{k}</option>)}
          </NativeSelect>
        </Field>
        <Field id="m-unit" label="Unit"><Input id="m-unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></Field>
        <Button type="submit" variant="outline" disabled={isLoading || !form.label.trim()}>Add metric</Button>
        <label className="flex items-center gap-2 text-sm sm:col-span-4">
          <input type="checkbox" className="size-5" checked={form.isSensitive} onChange={(e) => setForm({ ...form, isSensitive: e.target.checked })} />
          Sensitive, such as health or medication. Excluded from AI unless you opt in.
        </label>
      </form>
    </section>
  );
}

function GoalCard({ goal }: { goal: Goal }) {
  const [archive] = api.useArchiveGoalMutation();
  const percent = Math.round(goal.progress * 100);
  return (
    <li className="card-surface space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">{goal.title}</h3>
          <p className="text-sm text-ink-muted"><span className="capitalize">{goal.period}</span>: {goal.current} of {goal.target} {goal.metric?.unit ?? ""}</p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label={`Archive ${goal.title}`} onClick={() => void archive(goal.id)}><Archive aria-hidden className="size-4" /></Button>
      </div>
      <Progress value={percent} aria-label={`${goal.title}: ${percent} percent`} />
      {goal.milestones.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {goal.milestones.map((m) => (
            <li key={m.id} className={`rounded-full px-2.5 py-1 text-xs ${m.reachedAt ? "bg-reward-soft" : "bg-surface-2 text-ink-muted"}`}>
              {m.title}{m.reachedAt ? ", reached" : ""}
            </li>
          ))}
        </ul>
      )}
      {goal.metricId && (
        <ChartWidget title="Trend, last 30 days" type="line" spec={{ source: "metric", measure: "sum", grain: "day", rangeDays: 30, metricId: goal.metricId }} />
      )}
    </li>
  );
}

export function GoalsPage() {
  const goals = api.useGoalsQuery();
  const metrics = api.useMetricsQuery();
  const [create, { isLoading }] = api.useCreateGoalMutation();
  const [form, setForm] = useState({ title: "", metricId: "", target: "", period: "weekly", milestone: "" });
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
        milestones: Number(form.milestone) > 0 ? [{ title: `Reach ${form.milestone}`, threshold: Number(form.milestone) }] : [],
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
        <form onSubmit={(e) => void submit(e)} className="card-surface grid gap-3 p-4 sm:grid-cols-2">
          <Field id="g-title" label="Goal"><Input id="g-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field id="g-metric" label="Metric">
            <NativeSelect id="g-metric" value={form.metricId} onChange={(e) => setForm({ ...form, metricId: e.target.value })}>
              <option value="">None</option>
              {metrics.data?.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </NativeSelect>
          </Field>
          <Field id="g-target" label="Target"><Input id="g-target" type="number" min="0" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} /></Field>
          <Field id="g-period" label="Period">
            <NativeSelect id="g-period" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}>
              {["daily", "weekly", "monthly", "yearly", "total"].map((p) => <option key={p}>{p}</option>)}
            </NativeSelect>
          </Field>
          <Field id="g-mile" label="Milestone (optional)"><Input id="g-mile" type="number" min="0" value={form.milestone} onChange={(e) => setForm({ ...form, milestone: e.target.value })} /></Field>
          <div className="self-end"><Button type="submit" className="w-full" disabled={isLoading || !form.title.trim() || !form.target}>Add goal</Button></div>
        </form>
        {goals.isLoading && <PageSkeleton />}
        {goals.error && <ErrorState error={goals.error} retry={() => void goals.refetch()} />}
        {goals.data?.length === 0 && <EmptyState icon={Target} title="No goals yet" description="Add a metric below, then set a target for it." />}
        <ul className="grid gap-3 md:grid-cols-2">{goals.data?.map((g) => <GoalCard key={g.id} goal={g} />)}</ul>
        {metrics.data && <MetricManager metrics={metrics.data} />}
      </div>
    </>
  );
}
