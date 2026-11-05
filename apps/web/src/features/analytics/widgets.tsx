import { Area } from "@lifeos/ui/components/charts/area";
import { AreaChart } from "@lifeos/ui/components/charts/area-chart";
import { Bar } from "@lifeos/ui/components/charts/bar";
import { BarChart } from "@lifeos/ui/components/charts/bar-chart";
import { BarXAxis } from "@lifeos/ui/components/charts/bar-x-axis";
import { Grid } from "@lifeos/ui/components/charts/grid";
import {
  HeatmapCells,
  HeatmapChart,
  type HeatmapColumn,
} from "@lifeos/ui/components/charts/heatmap";
import { Line } from "@lifeos/ui/components/charts/line";
import { LineChart } from "@lifeos/ui/components/charts/line-chart";
import { ChartTooltip } from "@lifeos/ui/components/charts/tooltip";
import { XAxis } from "@lifeos/ui/components/charts/x-axis";
import { Skeleton } from "@lifeos/ui/components/skeleton";
import { curveMonotoneX } from "@lifeos/ui/lib/curves";
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
export function AccessibleDataTable({
  points,
  measure,
  caption,
}: {
  points: SeriesPoint[];
  measure: string;
  caption: string;
}) {
  return (
    <div className="max-h-64 overflow-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b text-left text-ink-muted">
            <th scope="col" className="py-1">
              Period
            </th>
            <th scope="col" className="py-1 text-right">
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.bucket} className="border-b last:border-0">
              <th scope="row" className="py-1 text-left font-normal">
                {formatDate(p.bucket, { month: "short", day: "numeric", year: "numeric" })}
              </th>
              <td className="py-1 text-right">{display(p.value, measure)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const HEATMAP_WEEKS = 26;
const DAY_MS = 86_400_000;

/** Always lays out full weeks up to the latest day, so quiet days appear as empty cells. */
export function toColumns(points: SeriesPoint[]): HeatmapColumn[] {
  const last = points[points.length - 1];
  if (!last) return [];
  const counts = new Map(points.map((p) => [p.bucket.slice(0, 10), p.value ?? 0]));
  const end = new Date(`${last.bucket.slice(0, 10)}T00:00:00Z`);
  const start = new Date(end.getTime() - (end.getUTCDay() + (HEATMAP_WEEKS - 1) * 7) * DAY_MS);
  const columns: HeatmapColumn[] = [];
  for (let week = 0; week < HEATMAP_WEEKS; week += 1) {
    const bins = [];
    for (let day = 0; day < 7; day += 1) {
      const date = new Date(start.getTime() + (week * 7 + day) * DAY_MS);
      if (date > end) break;
      bins.push({ bin: day, count: counts.get(date.toISOString().slice(0, 10)) ?? 0, date });
    }
    columns.push({ bin: week, bins });
  }
  return columns;
}

const HEATMAP_LEVELS = [
  "var(--surface-2)",
  "color-mix(in srgb, var(--primary-bright) 35%, var(--surface-2))",
  "color-mix(in srgb, var(--primary-bright) 60%, var(--surface-2))",
  "color-mix(in srgb, var(--primary-bright) 80%, var(--surface-2))",
  "var(--primary-bright)",
] as const;

export function Heatmap({ points }: { points: SeriesPoint[] }) {
  const { reduced } = useExperience();
  // The chart colors cells by levels 0 to 4. Levels are relative to this user's busiest day,
  // since a great day may be 3 tasks for one person and 30 for another.
  const data = useMemo(() => {
    const peak = Math.max(1, ...points.map((p) => p.value ?? 0));
    return toColumns(points).map((column) => ({
      ...column,
      bins: column.bins.map((b) => ({ ...b, count: Math.ceil((b.count / peak) * 4) })),
    }));
  }, [points]);
  if (data.length === 0)
    return <p className="py-8 text-center text-sm text-ink-muted">No data in this range.</p>;
  return (
    <div className="max-w-full overflow-x-auto">
      <HeatmapChart
        data={data}
        layout="fluid"
        binSize={16}
        gap={3}
        levelColors={HEATMAP_LEVELS}
        animate={!reduced}
      >
        <HeatmapCells />
      </HeatmapChart>
    </div>
  );
}

export function ChartView({
  type,
  points,
  measure,
}: {
  type: Widget["chartType"];
  points: SeriesPoint[];
  measure: string;
}) {
  const { reduced } = useExperience();
  // A period with nothing eligible has no value. Drawing it as zero would invent a failure.
  const known = useMemo(() => points.filter((p) => p.value !== null), [points]);
  const data = useMemo(
    () =>
      known.map((p) => ({
        date: new Date(`${p.bucket}T00:00:00Z`),
        value: p.value!,
        label: formatDate(p.bucket),
      })),
    [known],
  );
  if (known.length === 0)
    return <p className="py-8 text-center text-sm text-ink-muted">No data in this range.</p>;
  if (type === "stat")
    return (
      <p className="py-6 text-center text-4xl font-semibold">
        {display(known[known.length - 1]!.value, measure)}
      </p>
    );
  if (type === "heatmap") return <Heatmap points={known} />;
  const duration = reduced ? 0 : 600;
  const max = isPercent(measure) ? 1 : undefined;
  const values = known.map((p) => p.value!);
  const range = (
    <p className="mt-1 text-xs text-ink-muted">
      Lowest {display(Math.min(...values), measure)}, highest{" "}
      {display(Math.max(...values), measure)}
      {isPercent(measure) && type === "line" ? ". Scale runs from 0% to 100%." : ""}
    </p>
  );
  if (type === "bar") {
    return (
      <>
        <BarChart data={data} xDataKey="label" aspectRatio="2 / 1" animationDuration={duration}>
          <Grid horizontal />
          <Bar dataKey="value" animate={!reduced} />
          <BarXAxis />
          <ChartTooltip />
        </BarChart>
        {range}
      </>
    );
  }
  if (type === "area") {
    return (
      <>
        <AreaChart data={data} aspectRatio="2 / 1" animationDuration={duration}>
          <Grid horizontal />
          <Area dataKey="value" curve={curveMonotoneX} animate={!reduced} />
          <XAxis />
          <ChartTooltip />
        </AreaChart>
        {range}
      </>
    );
  }
  return (
    <>
      <LineChart data={data} aspectRatio="2 / 1" animationDuration={duration} yScaleDomainMax={max}>
        <Grid horizontal />
        <Line dataKey="value" curve={curveMonotoneX} animate={!reduced} />
        <XAxis />
        <ChartTooltip />
      </LineChart>
      {range}
    </>
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

export function ChartWidget({
  title,
  type,
  spec,
}: {
  title: string;
  type: Widget["chartType"];
  spec: WidgetSpec;
}) {
  const { data: me } = api.useMeQuery();
  const [table, setTable] = useState(false);
  const today = localToday(me?.timezone ?? "UTC");
  const { data, isLoading, error, refetch } = api.useAnalyticsQueryQuery(resolveSpec(spec, today));
  return (
    <figure className="card-surface flex min-w-0 flex-col p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <figcaption className="truncate font-medium">{title}</figcaption>
        <button
          type="button"
          className="min-h-11 shrink-0 px-2 text-xs text-primary underline"
          aria-pressed={table}
          onClick={() => setTable(!table)}
        >
          {table ? "Show chart" : "Show table"}
        </button>
      </div>
      {isLoading && <Skeleton className="h-40 w-full rounded-xl" />}
      {error && <ErrorState error={error} retry={() => void refetch()} />}
      {data &&
        (table ? (
          <AccessibleDataTable points={data} measure={spec.measure} caption={title} />
        ) : (
          <ChartView type={type} points={data} measure={spec.measure} />
        ))}
    </figure>
  );
}
