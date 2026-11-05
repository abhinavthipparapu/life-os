// Pure scoring functions. They do no I/O, so the rules are testable and shared by API and worker.

export type OccurrenceState = "pending" | "completed" | "skipped" | "rest" | "not_applicable";

export interface OccurrenceCounts {
  eligible: number;
  completed: number;
  skipped: number;
  rest: number;
  notApplicable: number;
}

export interface AdherencePolicy {
  countSkippedAsEligible?: boolean;
}

/** Tallies states. Rest and not-applicable days never enter the denominator (section 6.1). */
export function tally(states: OccurrenceState[], policy: AdherencePolicy = {}): OccurrenceCounts {
  const counts: OccurrenceCounts = { eligible: 0, completed: 0, skipped: 0, rest: 0, notApplicable: 0 };
  for (const state of states) {
    if (state === "completed") {
      counts.completed += 1;
      counts.eligible += 1;
    } else if (state === "skipped") {
      counts.skipped += 1;
      if (policy.countSkippedAsEligible) counts.eligible += 1;
    } else if (state === "rest") {
      counts.rest += 1;
    } else if (state === "not_applicable") {
      counts.notApplicable += 1;
    } else {
      counts.eligible += 1;
    }
  }
  return counts;
}

/** Adherence from 0 to 1, or null when nothing was eligible. That is "no data", not a score of 0. */
export function adherence(counts: Pick<OccurrenceCounts, "eligible" | "completed">): number | null {
  return counts.eligible === 0 ? null : counts.completed / counts.eligible;
}

export function dailyScore(counts: OccurrenceCounts): number | null {
  const rate = adherence(counts);
  return rate === null ? null : Math.round(rate * 100);
}

export interface DayResult {
  date: string;
  eligible: number;
  completed: number;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * A day counts when everything eligible was completed. Days with nothing eligible are neutral:
 * they neither extend nor break a streak, so rest days carry no penalty. Today is also neutral
 * until finished, because an unfinished day is not a failure.
 */
export function streaks(days: DayResult[], today: string): { current: number; longest: number } {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const sorted = [...byDate.keys()].sort();
  const first = sorted[0];
  if (!first) return { current: 0, longest: 0 };
  let run = 0;
  let longest = 0;
  for (let date = first; date <= today; date = addDays(date, 1)) {
    const day = byDate.get(date);
    if (!day || day.eligible === 0) continue;
    if (day.completed >= day.eligible) {
      run += 1;
      longest = Math.max(longest, run);
    } else if (date !== today) {
      run = 0;
    }
  }
  return { current: run, longest };
}

export type Aggregation = "sum" | "avg" | "min" | "max" | "last" | "count";

export function aggregate(values: number[], how: Aggregation): number | null {
  if (how === "count") return values.length;
  if (values.length === 0) return null;
  switch (how) {
    case "sum":
      return values.reduce((a, b) => a + b, 0);
    case "avg":
      return values.reduce((a, b) => a + b, 0) / values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    case "last":
      return values[values.length - 1] ?? null;
  }
}

/** Progress toward a target from 0 to 1, capped so overshooting never shows more than 100%. */
export function goalProgress(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(1, Math.max(0, current / target));
}

/** The user's calendar date at an instant. Never derived from the server's timezone. */
export function localDateOf(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}
