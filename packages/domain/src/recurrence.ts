import { localDateOf } from "@lifeos/analytics-core";
import { LIMITS } from "@lifeos/contracts";
import type { Prisma } from "@lifeos/db";
import * as rruleModule from "rrule";

// rrule ships CommonJS to Node and ESM to bundlers, so its exports sit in different places.
type RRuleExports = typeof rruleModule;
const { RRule, rrulestr } =
  (rruleModule as RRuleExports & { default?: RRuleExports }).default ?? rruleModule;

const DAY_MS = 86_400_000;
const ALLOWED_FREQUENCIES = new Set<number>([
  RRule.DAILY,
  RRule.WEEKLY,
  RRule.MONTHLY,
  RRule.YEARLY,
]);

export interface ScheduleInput {
  rrule: string;
  startsOn: string;
  endsOn?: string | null;
  timezone: string;
  localTime?: string | null;
}

const asUtcDate = (date: string) => new Date(`${date}T00:00:00Z`);
const toDateString = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (date: string, days: number) =>
  toDateString(new Date(asUtcDate(date).getTime() + days * DAY_MS));

/** Accepts one RRULE line. Sub-daily rules and DTSTART overrides are refused to bound generation. */
export function validateRule(rule: string): { ok: true } | { ok: false; reason: string } {
  const text = rule.replace(/^RRULE:/i, "").trim();
  if (/[\r\n]/.test(text) || /DTSTART|EXDATE|RDATE/i.test(text)) {
    return { ok: false, reason: "Only a single RRULE is allowed" };
  }
  try {
    const parsed = RRule.parseString(text);
    if (parsed.freq === undefined || !ALLOWED_FREQUENCIES.has(parsed.freq)) {
      return { ok: false, reason: "Frequency must be daily, weekly, monthly or yearly" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "Invalid recurrence rule" };
  }
}

/**
 * Returns local calendar dates in [from, to]. Dates are computed as floating UTC days, so the
 * result does not depend on the server's timezone or shift across daylight saving changes.
 */
export function generateOccurrences(input: ScheduleInput, from: string, to: string): string[] {
  const start = from > input.startsOn ? from : input.startsOn;
  const end = input.endsOn && input.endsOn < to ? input.endsOn : to;
  if (start > end) return [];
  const text = input.rrule.replace(/^RRULE:/i, "").trim();
  const rule = rrulestr(`RRULE:${text}`, { dtstart: asUtcDate(input.startsOn) });
  return rule.between(asUtcDate(start), asUtcDate(end), true).map(toDateString);
}

export function getNextRun(input: ScheduleInput, after: string): string | null {
  return generateOccurrences(input, addDays(after, 1), addDays(after, 400))[0] ?? null;
}

function offsetMinutes(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return (wall - Math.floor(instant.getTime() / 1000) * 1000) / 60_000;
}

/** Converts a wall-clock time in an IANA zone to a UTC instant. */
export function zonedTimeToUtc(date: string, time: string, timezone: string): Date {
  const naive = new Date(`${date}T${time}:00Z`);
  const first = new Date(naive.getTime() - offsetMinutes(naive, timezone) * 60_000);
  return new Date(naive.getTime() - offsetMinutes(first, timezone) * 60_000);
}

interface ScheduleRow {
  id: string;
  taskId: string;
  timezone: string;
  rrule: string;
  slot: string;
  startsOn: Date;
  endsOn: Date | null;
  localTime: string | null;
}

const toInput = (s: ScheduleRow): ScheduleInput => ({
  rrule: s.rrule,
  timezone: s.timezone,
  startsOn: toDateString(s.startsOn),
  endsOn: s.endsOn ? toDateString(s.endsOn) : null,
  localTime: s.localTime,
});

/** Idempotent: the unique (task, slot, date) key makes repeat runs insert nothing. */
export async function materializeOccurrences(
  tx: Prisma.TransactionClient,
  userId: string,
  schedule: ScheduleRow,
  now: Date = new Date(),
  horizonDays: number = LIMITS.occurrenceHorizonDays,
): Promise<number> {
  const input = toInput(schedule);
  const today = localDateOf(now, schedule.timezone);
  const until = addDays(today, horizonDays);
  const dates = generateOccurrences(input, today, until);
  const { count } = await tx.taskOccurrence.createMany({
    skipDuplicates: true,
    data: dates.map((date) => ({
      userId,
      taskId: schedule.taskId,
      slotKey: schedule.slot,
      date: asUtcDate(date),
      scheduledAt: schedule.localTime
        ? zonedTimeToUtc(date, schedule.localTime, schedule.timezone)
        : null,
    })),
  });
  await tx.taskSchedule.update({
    where: { id: schedule.id },
    data: { generatedUntil: asUtcDate(until) },
  });
  return count;
}

/**
 * After a schedule edit, removes only future occurrences that are untouched: still pending, with
 * no event history. Completed or skipped instances and all past dates are never rewritten.
 */
export async function reconcileFutureOccurrences(
  tx: Prisma.TransactionClient,
  userId: string,
  schedule: ScheduleRow,
  now: Date = new Date(),
): Promise<number> {
  const today = localDateOf(now, schedule.timezone);
  await tx.taskOccurrence.deleteMany({
    where: {
      userId,
      taskId: schedule.taskId,
      slotKey: schedule.slot,
      status: "pending",
      date: { gte: asUtcDate(today) },
      events: { none: {} },
    },
  });
  return materializeOccurrences(tx, userId, schedule, now);
}
