import { describe, expect, it } from "vitest";
import {
  adherence,
  aggregate,
  dailyScore,
  goalProgress,
  localDateOf,
  streaks,
  tally,
} from "./index";

describe("tally and adherence", () => {
  it("excludes rest and not-applicable from the denominator", () => {
    const c = tally(["completed", "pending", "rest", "not_applicable"]);
    expect(c).toEqual({ eligible: 2, completed: 1, skipped: 0, rest: 1, notApplicable: 1 });
    expect(adherence(c)).toBe(0.5);
  });
  it("excludes skipped by default and includes it when the policy says so", () => {
    expect(tally(["completed", "skipped"]).eligible).toBe(1);
    expect(tally(["completed", "skipped"], { countSkippedAsEligible: true }).eligible).toBe(2);
  });
  it("returns null rather than zero when nothing is eligible", () => {
    expect(adherence(tally(["rest"]))).toBeNull();
    expect(dailyScore(tally([]))).toBeNull();
  });
});

describe("streaks", () => {
  const done = (date: string) => ({ date, eligible: 1, completed: 1 });
  it("counts consecutive finished days", () => {
    expect(streaks([done("2026-01-01"), done("2026-01-02")], "2026-01-02")).toEqual({
      current: 2,
      longest: 2,
    });
  });
  it("does not break on a rest day or a day with nothing scheduled", () => {
    const days = [
      done("2026-01-01"),
      { date: "2026-01-02", eligible: 0, completed: 0 },
      done("2026-01-04"),
    ];
    expect(streaks(days, "2026-01-04").current).toBe(2);
  });
  it("does not break for an unfinished today, but breaks for a missed past day", () => {
    const today = { date: "2026-01-03", eligible: 2, completed: 0 };
    expect(streaks([done("2026-01-02"), today], "2026-01-03").current).toBe(1);
    const missed = { date: "2026-01-02", eligible: 1, completed: 0 };
    expect(streaks([done("2026-01-01"), missed, done("2026-01-03")], "2026-01-03")).toEqual({
      current: 1,
      longest: 1,
    });
  });
});

describe("aggregate and goals", () => {
  it("handles empty input", () => {
    expect(aggregate([], "sum")).toBeNull();
    expect(aggregate([], "count")).toBe(0);
  });
  it("computes each aggregation", () => {
    expect(aggregate([1, 2, 6], "avg")).toBe(3);
    expect(aggregate([1, 2, 6], "last")).toBe(6);
  });
  it("caps goal progress", () => {
    expect(goalProgress(15, 10)).toBe(1);
    expect(goalProgress(5, 10)).toBe(0.5);
  });
});

describe("localDateOf", () => {
  it("uses the user's timezone, not UTC", () => {
    const instant = new Date("2026-03-01T20:00:00Z");
    expect(localDateOf(instant, "Asia/Kolkata")).toBe("2026-03-02");
    expect(localDateOf(instant, "America/Los_Angeles")).toBe("2026-03-01");
  });
});
