import { Area } from "@lifeos/ui/components/charts/area";
import { AreaChart } from "@lifeos/ui/components/charts/area-chart";
import { Bar } from "@lifeos/ui/components/charts/bar";
import { BarChart } from "@lifeos/ui/components/charts/bar-chart";
import { BarXAxis } from "@lifeos/ui/components/charts/bar-x-axis";
import { Grid } from "@lifeos/ui/components/charts/grid";
import { HeatmapCells, HeatmapChart, type HeatmapColumn } from "@lifeos/ui/components/charts/heatmap";
import { Line } from "@lifeos/ui/components/charts/line";
import { LineChart } from "@lifeos/ui/components/charts/line-chart";
import { ChartTooltip } from "@lifeos/ui/components/charts/tooltip";
import { XAxis } from "@lifeos/ui/components/charts/x-axis";
import { Skeleton } from "@lifeos/ui/components/skeleton";
import { useMemo, useState } from "react";
import type { QuerySpec } from "@lifeos/contracts";
import { api } from "@/app/api";
import type { SeriesPoint, Widget, WidgetSpec } from "@/app/types";
import { ErrorState } from "@/components/common/states";
import { useExperience } from "@/components/experience/reduced-motion";
import { addDays, formatDate, localToday } from "@/lib/dates";

export const isPercent = (measure: string) => measure === "adherence";
const display = (value: number | null, measure: string) => {
  if (value === null) return "No data";
  return isPercent(measure) ? `${Math.round(value * 100)}%` : String(Math.round(value * 100) / 100);
};

/** Every chart has a table with the same values, for screen readers and exact reading. */
export function AccessibleDataTable({ points, measure, caption }: { points: SeriesPoint[]; measure: string; caption: string }) {
  return (
    <div className="max-h-64 overflow-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead><tr className="border-b text-left text-ink-muted"><th scope="col" className="py-1">Period</th><th scope="col" className="py-1 text-right">Value</th></tr></thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.bucket} className="border-b last:border-0">
              <th scope="row" className="py-1 text-left font-normal">{formatDate(p.bucket, { month: "short", day: "numeric", year: "numeric" })}</th>
              <td className="py-1 text-right">{display(p.value, measure)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function toColumns(points: SeriesPoint[]): HeatmapColumn[] {
  const columns = new Map<number, HeatmapColumn>();
  for (const p of points) {
    const date = new Date(`${p.bucket}T00:00:00Z`);
    const week = Math.floor((date.getTime() / 86_400_000 + 3) / 7);
    const column = columns.get(week) ?? { bin: columns.size, bins: [] };
    column.bins.push({ bin: date.getUTCDay(), count: p.value ?? 0, date });
    columns.set(week, column);
  }
  return [...columns.values()];
}

export function Heatmap({ points }: { points: SeriesPoint[] }) {
  const { reduced } = useExperience();
  const data = useMemo(() => toColumns(points), [points]);
  if (data.length === 0) return <p className="py-8 text-center text-sm text-ink-muted">No data in this range.</p>;
  return (
    <HeatmapChart data={data} layout="fluid" animate={!reduced}>
      <HeatmapCells />
    </HeatmapChart>
  );
}

export function ChartView({ type, points, measure }: { type: Widget["chartType"]; points: SeriesPoint[]; measure: string }) {
  const { reduced } = useExperience();
  const data = useMemo(
    () => points.map((p) => ({ date: new Date(`${p.bucket}T00:00:00Z`), value: p.value ?? 0, label: formatDate(p.bucket) })),
    [points],
  );
  if (points.length === 0) return <p className="py-8 text-center text-sm text-ink-muted">No data in this range.</p>;
  if (type === "stat") {
    const last = points[points.length - 1]!;
    return <p className="py-6 text-center text-4xl font-semibold">{display(last.value, measure)}</p>;
  }
  if (type === "heatmap") return <Heatmap points={points} />;
  const duration = reduced ? 0 : 600;
  if (type === "bar") {
    return (
      <BarChart data={data} xDataKey="label" aspectRatio="2 / 1" animationDuration={duration}>
        <Grid horizontal />
        <Bar dataKey="value" animate={!reduced} />
        <BarXAxis />
        <ChartTooltip />
      </BarChart>
    );
  }
  if (type === "area") {
    return (
      <AreaChart data={data} aspectRatio="2 / 1" animationDuration={duration}>
        <Grid horizontal />
        <Area dataKey="value" animate={!reduced} />
        <XAxis />
        <ChartTooltip />
      </AreaChart>
    );
  }
  return (
    <LineChart data={data} aspectRatio="2 / 1" animationDuration={duration}>
      <Grid horizontal />
      <Line dataKey="value" animate={!reduced} />
      <XAxis />
      <ChartTooltip />
    </LineChart>
  );
}

export function resolveSpec(spec: WidgetSpec, today: string): QuerySpec {
  return {
    source: spec.source,
    measure: spec.measure as QuerySpec["measure"],
    grain: spec.grain,
    from: addDays(today, -(spec.rangeDays - 1)),
    to: today,
    ...(spec.metricId ? { metricId: spec.metricId } : {}),
    ...(spec.plannerId ? { plannerId: spec.plannerId } : {}),
    ...(spec.categoryId ? { categoryId: spec.categoryId } : {}),
  };
}

export function ChartWidget({ title, type, spec }: { title: string; type: Widget["chartType"]; spec: WidgetSpec }) {
  const { data: me } = api.useMeQuery();
  const [table, setTable] = useState(false);
  const today = localToday(me?.timezone ?? "UTC");
  const { data, isLoading, error, refetch } = api.useAnalyticsQueryQuery(resolveSpec(spec, today));
  return (
    <figure className="card-surface flex min-w-0 flex-col p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <figcaption className="truncate font-medium">{title}</figcaption>
        <button type="button" className="min-h-11 shrink-0 px-2 text-xs text-primary underline" aria-pressed={table} onClick={() => setTable(!table)}>
          {table ? "Show chart" : "Show table"}
        </button>
      </div>
      {isLoading && <Skeleton className="h-40 w-full rounded-xl" />}
      {error && <ErrorState error={error} retry={() => void refetch()} />}
      {data && (table ? <AccessibleDataTable points={data} measure={spec.measure} caption={title} /> : <ChartView type={type} points={data} measure={spec.measure} />)}
    </figure>
  );
}
