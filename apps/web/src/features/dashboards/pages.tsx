import { Button } from "@lifeos/ui/components/button";
import { Input } from "@lifeos/ui/components/input";
import { ArrowDown, ArrowUp, LayoutDashboard, Pencil, Plus, Trash2 } from "lucide-react";
import { Reorder } from "motion/react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api, messageOf } from "@/app/api";
import type { Widget, WidgetSpec } from "@/app/types";
import { Field, NativeSelect } from "@/components/common/forms";
import { EmptyState, ErrorState, PageHeader, PageSkeleton } from "@/components/common/states";
import { ChartWidget } from "@/features/analytics/widgets";

const specOf = (w: Widget) => (w.querySpecJson ?? w.querySpec)!;

const MEASURES = {
  occurrences: [["adherence", "Adherence"], ["completed", "Completed"], ["eligible", "Eligible"], ["skipped", "Skipped"]],
  metric: [["sum", "Sum"], ["avg", "Average"], ["min", "Minimum"], ["max", "Maximum"], ["count", "Count"]],
} as const;

function WidgetGrid({ widgets }: { widgets: Widget[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {widgets.map((w, i) => <ChartWidget key={w.id ?? i} title={w.title} type={w.chartType} spec={specOf(w)} />)}
    </div>
  );
}

export function DashboardsPage() {
  const { data, isLoading, error, refetch } = api.useDashboardsQuery();
  const [create] = api.useCreateDashboardMutation();
  const navigate = useNavigate();
  const add = async () => {
    try {
      const d = await create({ name: "My dashboard", widgets: [] }).unwrap();
      navigate(`/app/dashboards/${d.id}/edit`);
    } catch (err) {
      toast.error(messageOf(err));
    }
  };
  return (
    <>
      <PageHeader title="Dashboards" actions={<Button onClick={() => void add()}><Plus aria-hidden className="size-4" />New dashboard</Button>} />
      {isLoading && <PageSkeleton />}
      {error && <ErrorState error={error} retry={() => void refetch()} />}
      {data?.length === 0 && <EmptyState icon={LayoutDashboard} title="No dashboards yet" description="Build charts from your tasks and metrics." />}
      <div className="space-y-8">
        {data?.map((d) => (
          <section key={d.id} aria-label={d.name}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">{d.name}</h2>
              <Button variant="outline" size="sm" asChild><Link to={`/app/dashboards/${d.id}/edit`}><Pencil aria-hidden className="size-4" />Edit</Link></Button>
            </div>
            {d.widgets.length ? <WidgetGrid widgets={d.widgets} /> : <p className="text-sm text-ink-muted">No charts yet.</p>}
          </section>
        ))}
      </div>
    </>
  );
}

function ChartBuilder({ onAdd }: { onAdd: (w: Widget) => void }) {
  const { data: metrics } = api.useMetricsQuery();
  const { data: planners } = api.usePlannersQuery({ limit: 100 });
  const [title, setTitle] = useState("");
  const [chartType, setChartType] = useState<Widget["chartType"]>("line");
  const [spec, setSpec] = useState<WidgetSpec>({ source: "occurrences", measure: "adherence", grain: "day", rangeDays: 30 });
  const setSource = (source: WidgetSpec["source"]) =>
    setSpec({ source, measure: MEASURES[source][0][0], grain: spec.grain, rangeDays: spec.rangeDays });
  const ready = spec.source === "occurrences" || Boolean(spec.metricId);
  return (
    <section aria-labelledby="builder" className="card-surface space-y-4 p-4">
      <h2 id="builder" className="font-semibold">Add a chart</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="w-title" label="Title"><Input id="w-title" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field id="w-type" label="Chart">
          <NativeSelect id="w-type" value={chartType} onChange={(e) => setChartType(e.target.value as Widget["chartType"])}>
            {["line", "area", "bar", "heatmap", "stat"].map((c) => <option key={c}>{c}</option>)}
          </NativeSelect>
        </Field>
        <Field id="w-source" label="Source">
          <NativeSelect id="w-source" value={spec.source} onChange={(e) => setSource(e.target.value as WidgetSpec["source"])}>
            <option value="occurrences">Tasks</option>
            <option value="metric">Metric</option>
          </NativeSelect>
        </Field>
        {spec.source === "metric" ? (
          <Field id="w-metric" label="Metric">
            <NativeSelect id="w-metric" value={spec.metricId ?? ""} onChange={(e) => setSpec({ ...spec, metricId: e.target.value || undefined })}>
              <option value="">Choose a metric</option>
              {metrics?.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </NativeSelect>
          </Field>
        ) : (
          <Field id="w-planner" label="Planner">
            <NativeSelect id="w-planner" value={spec.plannerId ?? ""} onChange={(e) => setSpec({ ...spec, plannerId: e.target.value || undefined })}>
              <option value="">All planners</option>
              {planners?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </NativeSelect>
          </Field>
        )}
        <Field id="w-measure" label="Aggregation">
          <NativeSelect id="w-measure" value={spec.measure} onChange={(e) => setSpec({ ...spec, measure: e.target.value })}>
            {MEASURES[spec.source].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </NativeSelect>
        </Field>
        <Field id="w-range" label="Range">
          <NativeSelect id="w-range" value={spec.rangeDays} onChange={(e) => setSpec({ ...spec, rangeDays: Number(e.target.value) })}>
            {[7, 30, 90, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}
          </NativeSelect>
        </Field>
        <Field id="w-grain" label="Group by">
          <NativeSelect id="w-grain" value={spec.grain} onChange={(e) => setSpec({ ...spec, grain: e.target.value as WidgetSpec["grain"] })}>
            {["day", "week", "month"].map((g) => <option key={g}>{g}</option>)}
          </NativeSelect>
        </Field>
      </div>
      {ready && (
        <div>
          <p className="mb-2 text-sm text-ink-muted">Live preview</p>
          <ChartWidget title={title || "Untitled chart"} type={chartType} spec={spec} />
        </div>
      )}
      <Button disabled={!ready || !title.trim()} onClick={() => { onAdd({ title: title.trim(), chartType, querySpec: spec }); setTitle(""); }}>Add to dashboard</Button>
    </section>
  );
}

export function DashboardEditPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = api.useDashboardQuery(id);
  const [update, { isLoading: saving }] = api.useUpdateDashboardMutation();
  const [archive] = api.useArchiveDashboardMutation();
  const [name, setName] = useState("");
  const [widgets, setWidgets] = useState<Widget[]>([]);
  useEffect(() => {
    if (data) {
      setName(data.name);
      setWidgets(data.widgets);
    }
  }, [data]);
  const save = async () => {
    try {
      await update({ id, name, widgets: widgets.map((w) => ({ title: w.title, chartType: w.chartType, querySpec: specOf(w) })) }).unwrap();
      navigate("/app/dashboards");
    } catch (err) {
      toast.error(messageOf(err));
    }
  };
  const shift = (i: number, by: number) => {
    const next = [...widgets];
    const [item] = next.splice(i, 1);
    next.splice(i + by, 0, item!);
    setWidgets(next);
  };
  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <ErrorState error={error} retry={() => void refetch()} />;
  return (
    <>
      <PageHeader title="Edit dashboard" actions={<Button disabled={saving || !name.trim()} onClick={() => void save()}>Save</Button>} />
      <div className="space-y-4">
        <Field id="d-name" label="Name"><Input id="d-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Reorder.Group axis="y" values={widgets} onReorder={setWidgets} className="space-y-2">
          {widgets.map((w, i) => (
            <Reorder.Item key={w.id ?? w.title} value={w} className="card-surface flex items-center gap-2 p-2">
              <span className="min-w-0 flex-1 truncate px-2 text-sm font-medium">{w.title}</span>
              <Button variant="ghost" size="icon-sm" aria-label={`Move ${w.title} up`} disabled={i === 0} onClick={() => shift(i, -1)}><ArrowUp aria-hidden className="size-4" /></Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Move ${w.title} down`} disabled={i === widgets.length - 1} onClick={() => shift(i, 1)}><ArrowDown aria-hidden className="size-4" /></Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Remove ${w.title}`} onClick={() => setWidgets(widgets.filter((_, x) => x !== i))}><Trash2 aria-hidden className="size-4" /></Button>
            </Reorder.Item>
          ))}
        </Reorder.Group>
        <ChartBuilder onAdd={(w) => setWidgets([...widgets, w])} />
        <Button variant="ghost" className="text-danger" onClick={() => void archive(id).then(() => navigate("/app/dashboards"))}>Delete dashboard</Button>
      </div>
    </>
  );
}
