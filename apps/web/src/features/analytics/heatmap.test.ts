import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { VITE_API_URL: "http://api.test" } }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
const { toColumns } = await import("./widgets");

describe("toColumns", () => {
  it("fills 26 full weeks and ends on the latest day", () => {
    const columns = toColumns([
      { bucket: "2026-11-04", value: 2 },
      { bucket: "2026-11-05", value: 3 },
    ]);
    expect(columns).toHaveLength(26);
    const last = columns[25]!.bins;
    expect(last[last.length - 1]!.count).toBe(3);
    expect(last[last.length - 1]!.date.toISOString().slice(0, 10)).toBe("2026-11-05");
    expect(columns[0]!.bins).toHaveLength(7);
    expect(columns[0]!.bins[0]!.count).toBe(0);
  });
  it("returns nothing for no data", () => {
    expect(toColumns([])).toEqual([]);
  });
});
