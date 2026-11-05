import type { TaskRow } from "@/app/types";

export interface TreeNode {
  task: TaskRow;
  children: TreeNode[];
}

/** Builds the nested view from flat rows. Orphans surface at the root rather than vanish. */
export function buildTree(tasks: TaskRow[]): TreeNode[] {
  const nodes = new Map(tasks.map((task) => [task.id, { task, children: [] as TreeNode[] }]));
  const roots: TreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.task.parentTaskId ? nodes.get(node.task.parentTaskId) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  const sort = (list: TreeNode[]) => {
    list.sort((a, b) => a.task.sortOrder - b.task.sortOrder);
    list.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

export type ScheduleMode = "none" | "daily" | "weekdays" | "weekly" | "monthly";

export function toRrule(mode: ScheduleMode, days: string[]): string | null {
  switch (mode) {
    case "daily":
      return "FREQ=DAILY";
    case "weekdays":
      return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
    case "weekly":
      return `FREQ=WEEKLY;BYDAY=${(days.length ? days : ["MO"]).join(",")}`;
    case "monthly":
      return "FREQ=MONTHLY";
    default:
      return null;
  }
}

export function fromRrule(rule?: string): { mode: ScheduleMode; days: string[] } {
  if (!rule) return { mode: "none", days: [] };
  if (rule.includes("FREQ=DAILY")) return { mode: "daily", days: [] };
  if (rule.includes("FREQ=MONTHLY")) return { mode: "monthly", days: [] };
  const days = /BYDAY=([A-Z,]+)/.exec(rule)?.[1]?.split(",") ?? [];
  if (days.join(",") === "MO,TU,WE,TH,FR") return { mode: "weekdays", days };
  return { mode: "weekly", days };
}

export function describeRule(rule?: string): string {
  const { mode, days } = fromRrule(rule);
  if (mode === "none") return "No schedule";
  if (mode === "daily") return "Every day";
  if (mode === "weekdays") return "Weekdays";
  if (mode === "monthly") return "Monthly";
  return `Weekly on ${days.join(", ")}`;
}
