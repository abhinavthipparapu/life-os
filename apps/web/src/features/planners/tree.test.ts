import { describe, expect, it } from "vitest";
import type { TaskRow } from "@/app/types";
import { buildTree, describeRule, fromRrule, toRrule } from "./tree";

const task = (id: string, parentTaskId: string | null, sortOrder = 0) =>
  ({ id, parentTaskId, sortOrder }) as TaskRow;

describe("buildTree", () => {
  it("nests and sorts children", () => {
    const tree = buildTree([
      task("b", null, 1),
      task("a", null, 0),
      task("c", "a", 1),
      task("d", "a", 0),
    ]);
    expect(tree.map((n) => n.task.id)).toEqual(["a", "b"]);
    expect(tree[0]!.children.map((n) => n.task.id)).toEqual(["d", "c"]);
  });
  it("keeps orphans visible at the root", () => {
    expect(buildTree([task("a", "missing")]).map((n) => n.task.id)).toEqual(["a"]);
  });
});

describe("schedule rules", () => {
  it("round-trips each mode", () => {
    expect(fromRrule(toRrule("daily", [])!).mode).toBe("daily");
    expect(fromRrule(toRrule("weekdays", [])!).mode).toBe("weekdays");
    expect(fromRrule(toRrule("weekly", ["TU", "SA"])!)).toEqual({
      mode: "weekly",
      days: ["TU", "SA"],
    });
    expect(toRrule("none", [])).toBeNull();
  });
  it("describes rules for people", () => {
    expect(describeRule("FREQ=WEEKLY;BYDAY=TU")).toBe("Weekly on TU");
    expect(describeRule(undefined)).toBe("No schedule");
  });
});
