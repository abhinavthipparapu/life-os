import { describe, expect, it } from "vitest";
import { normalizeTaskTarget } from "./index";

describe("normalizeTaskTarget", () => {
  it("clears values on types that don't use them", () => {
    for (const type of ["checkbox", "rating", "text"] as const) {
      expect(normalizeTaskTarget({ type, targetValue: 5, targetUnit: "x" })).toEqual({
        targetValue: null,
        targetUnit: null,
      });
    }
  });
  it("keeps quantity values, and treats a blank unit as none", () => {
    expect(normalizeTaskTarget({ type: "quantity", targetValue: 2, targetUnit: " ml " })).toEqual({
      targetValue: 2,
      targetUnit: "ml",
    });
    expect(
      normalizeTaskTarget({ type: "quantity", targetValue: 2, targetUnit: "  " }).targetUnit,
    ).toBeNull();
  });
  it("stores durations in minutes", () => {
    expect(normalizeTaskTarget({ type: "duration", targetValue: 30, targetUnit: "min" })).toEqual({
      targetValue: 30,
      targetUnit: "min",
    });
    expect(
      normalizeTaskTarget({ type: "duration", targetValue: 1.5, targetUnit: "Hours" }),
    ).toEqual({ targetValue: 90, targetUnit: "min" });
    expect(normalizeTaskTarget({ type: "duration", targetValue: null })).toEqual({
      targetValue: null,
      targetUnit: "min",
    });
  });
});
