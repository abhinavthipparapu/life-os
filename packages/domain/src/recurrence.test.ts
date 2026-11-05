import { describe, expect, it } from "vitest";
import { generateOccurrences, getNextRun, validateRule, zonedTimeToUtc } from "./recurrence";

const base = { timezone: "Asia/Kolkata", startsOn: "2026-01-01" };

describe("validateRule", () => {
  it("accepts daily through yearly rules", () => {
    for (const r of ["FREQ=DAILY", "FREQ=WEEKLY;BYDAY=MO,WE", "RRULE:FREQ=MONTHLY;BYMONTHDAY=1", "FREQ=YEARLY"]) {
      expect(validateRule(r).ok).toBe(true);
    }
  });
  it("refuses sub-daily, malformed and multi-line rules", () => {
    for (const r of ["FREQ=HOURLY", "FREQ=MINUTELY", "garbage", "FREQ=DAILY\nDTSTART:19000101T000000Z", "DTSTART:20200101T000000Z"]) {
      expect(validateRule(r).ok).toBe(false);
    }
  });
});

describe("generateOccurrences", () => {
  it("generates weekly local dates in range", () => {
    expect(generateOccurrences({ ...base, rrule: "FREQ=WEEKLY;BYDAY=MO" }, "2026-01-01", "2026-01-14")).toEqual(["2026-01-05", "2026-01-12"]);
  });
  it("respects start and end dates", () => {
    const s = { ...base, rrule: "FREQ=DAILY", startsOn: "2026-01-03", endsOn: "2026-01-04" };
    expect(generateOccurrences(s, "2026-01-01", "2026-01-31")).toEqual(["2026-01-03", "2026-01-04"]);
  });
  it("keeps one date per day across a daylight saving change", () => {
    const s = { rrule: "FREQ=DAILY", timezone: "America/New_York", startsOn: "2026-03-07" };
    expect(generateOccurrences(s, "2026-03-07", "2026-03-09")).toEqual(["2026-03-07", "2026-03-08", "2026-03-09"]);
  });
  it("finds the next run", () => {
    expect(getNextRun({ ...base, rrule: "FREQ=WEEKLY;BYDAY=MO" }, "2026-01-05")).toBe("2026-01-12");
  });
});

describe("zonedTimeToUtc", () => {
  it("converts wall-clock time, including both sides of a DST change", () => {
    expect(zonedTimeToUtc("2026-01-15", "09:00", "Asia/Kolkata").toISOString()).toBe("2026-01-15T03:30:00.000Z");
    expect(zonedTimeToUtc("2026-03-07", "09:00", "America/New_York").toISOString()).toBe("2026-03-07T14:00:00.000Z");
    expect(zonedTimeToUtc("2026-03-09", "09:00", "America/New_York").toISOString()).toBe("2026-03-09T13:00:00.000Z");
  });
});
