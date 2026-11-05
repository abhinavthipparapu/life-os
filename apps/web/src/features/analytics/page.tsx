import { Input } from "@lifeos/ui/components/input";
import { Skeleton } from "@lifeos/ui/components/skeleton";
import { useState } from "react";
import { api } from "@/app/api";
import { Field, NativeSelect } from "@/components/common/forms";
import { ErrorState, PageHeader, PageSkeleton } from "@/components/common/states";
import { addDays, localToday } from "@/lib/dates";
import { AccessibleDataTable, ChartView, Heatmap } from "./widgets";

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card-surface p-4">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

const pct = (v: number | null) => (v === null ? "No data" : `${Math.round(v * 100)}%`);

export function FilterBar({
  from,
  to,
  onChange,
  plannerId,
  onPlanner,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  plannerId: string;
  onPlanner: (id: string) => void;
}) {
  const { data } = api.usePlannersQuery({ limit: 100 });
  return (
    <div className="card-surface mb-4 grid gap-3 p-4 sm:grid-cols-3">
      <Field id="from" label="From">
        <Input
          id="from"
          type="date"
          value={from}
          max={to}
          onChange={(e) => e.target.value && onChange(e.target.value, to)}
        />
      </Field>
      <Field id="to" label="To">
        <Input
          id="to"
          type="date"
          value={to}
          min={from}
          onChange={(e) => e.target.value && onChange(from, e.target.value)}
        />
      </Field>
      <Field id="planner" label="Planner">
        <NativeSelect id="planner" value={plannerId} onChange={(e) => onPlanner(e.target.value)}>
          <option value="">All planners</option>
          {data?.items.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
    </div>
  );
}

export function AnalyticsPage() {
  const { data: me } = api.useMeQuery();
  const timezone = me?.timezone ?? "UTC";
  const today = localToday(timezone);
  const [range, setRange] = useState({ from: addDays(today, -29), to: today });
  const [plannerId, setPlannerId] = useState("");
  const length = Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000) + 1;
  const scope = plannerId ? { plannerId } : {};
  const current = api.useAdherenceQuery({ ...range, ...scope });
  const previous = api.useAdherenceQuery({
    from: addDays(range.from, -length),
    to: addDays(range.from, -1),
    ...scope,
  });
  const series = api.useAnalyticsQueryQuery({
    source: "occurrences",
    measure: "adherence",
    grain: length > 60 ? "week" : "day",
    ...range,
    ...scope,
  });
  const heat = api.useAnalyticsQueryQuery({
    source: "occurrences",
    measure: "completed",
    grain: "day",
    from: addDays(today, -181),
    to: today,
    ...scope,
  });
  const c = current.data;
  const delta =
    c?.adherence != null && previous.data?.adherence != null
      ? Math.round((c.adherence - previous.data.adherence) * 100)
      : null;

  return (
    <>
      <PageHeader title="Analytics" description={`Dates and days use your timezone: ${timezone}`} />
      <FilterBar
        from={range.from}
        to={range.to}
        onChange={(from, to) => setRange({ from, to })}
        plannerId={plannerId}
        onPlanner={setPlannerId}
      />
      {current.isLoading && <PageSkeleton />}
      {current.error && <ErrorState error={current.error} retry={() => void current.refetch()} />}
      {c && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <MetricCard
              label="Adherence"
              value={pct(c.adherence)}
              hint={
                delta === null
                  ? undefined
                  : `${delta >= 0 ? "+" : ""}${delta} points vs previous period`
              }
            />
            <MetricCard
              label="Completed"
              value={String(c.completed)}
              hint={`of ${c.eligible} eligible`}
            />
            <MetricCard label="Skipped" value={String(c.skipped)} />
            <MetricCard label="Rest days" value={String(c.rest)} />
          </div>
          <p className="text-xs text-ink-muted">
            Adherence counts {c.denominator}, through {c.to}.
          </p>
          <figure className="card-surface p-4">
            <figcaption className="mb-2 font-medium">Adherence over time</figcaption>
            {series.data ? (
              <ChartView type="line" points={series.data} measure="adherence" />
            ) : (
              <Skeleton className="h-40 w-full rounded-xl" />
            )}
            {series.data && series.data.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-primary">Data table</summary>
                <AccessibleDataTable
                  points={series.data}
                  measure="adherence"
                  caption="Adherence over time"
                />
              </details>
            )}
          </figure>
          <figure className="card-surface p-4">
            <figcaption className="mb-2 font-medium">Completed tasks, last six months</figcaption>
            {heat.data ? (
              <Heatmap points={heat.data} />
            ) : (
              <Skeleton className="h-32 w-full rounded-xl" />
            )}
            {heat.data && heat.data.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-primary">Data table</summary>
                <AccessibleDataTable
                  points={heat.data}
                  measure="completed"
                  caption="Completed tasks by day"
                />
              </details>
            )}
          </figure>
        </div>
      )}
    </>
  );
}
