import { z } from "zod";

// Limits shared by the API, AI validation and the UI (section 6.1).
export const LIMITS = {
  maxTaskDepth: 5,
  maxChildrenPerTask: 50,
  maxTasksPerPlanner: 500,
  maxCategoryDepth: 3,
  maxSyncBatch: 100,
  maxPageSize: 100,
  occurrenceHorizonDays: 60,
  maxAnalyticsRangeDays: 731,
} as const;

const id = z.uuid();
const name = z.string().trim().min(1).max(120);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const icon = z.string().trim().min(1).max(40);
const localDate = z.iso.date();
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const timezone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, "Must be a valid IANA timezone");

export const pageQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(LIMITS.maxPageSize).default(25),
});
export const listQuery = pageQuery.extend({
  sort: z.enum(["createdAt", "name", "updatedAt"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  search: z.string().trim().max(120).optional(),
  categoryId: id.optional(),
});

// ---- Profile and preferences ----
export const updateProfile = z.object({
  displayName: z.string().trim().max(80).nullable().optional(),
  timezone: timezone.optional(),
});
export const updatePreferences = z.object({
  theme: z.enum(["system", "light", "dark"]).optional(),
  reducedMotion: z.boolean().optional(),
  celebrations: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  quietHoursStart: clockTime.nullable().optional(),
  quietHoursEnd: clockTime.nullable().optional(),
  aiSensitiveOptIn: z.boolean().optional(),
  aiWeeklyReportOptIn: z.boolean().optional(),
});

// ---- Categories ----
export const createCategory = z.object({
  name,
  parentId: id.nullable().optional(),
  color: hexColor.optional(),
  icon: icon.optional(),
});
export const updateCategory = createCategory.partial();
export const reorderCategories = z.object({ orderedIds: z.array(id).min(1).max(500) });

// ---- Planners ----
export const createPlanner = z.object({
  name,
  description: z.string().trim().max(2000).nullable().optional(),
  categoryId: id.nullable().optional(),
  timezone: timezone.optional(),
  color: hexColor.optional(),
  icon: icon.optional(),
  isSensitive: z.boolean().optional(),
  progressPolicy: z.object({ countSkippedAsEligible: z.boolean().default(false) }).optional(),
});
export const updatePlanner = createPlanner.partial().extend({
  expectedVersion: z.number().int().positive(),
});
export const createSection = z.object({
  name,
  position: z.number().int().min(0).optional(),
});

// ---- Tasks and schedules ----
export const taskType = z.enum(["checkbox", "quantity", "duration", "rating", "text"]);
export const schedule = z.object({
  rrule: z.string().trim().min(1).max(500),
  slot: z.string().trim().min(1).max(40).default("default"),
  timezone: timezone.optional(),
  startsOn: localDate,
  endsOn: localDate.nullable().optional(),
  localTime: clockTime.nullable().optional(),
  reminderOffsets: z.array(z.number().int().min(0).max(10080)).max(5).default([]),
});
export const createTask = z.object({
  title: name,
  description: z.string().trim().max(5000).nullable().optional(),
  type: taskType.default("checkbox"),
  sectionId: id.nullable().optional(),
  parentTaskId: id.nullable().optional(),
  targetValue: z.number().finite().nullable().optional(),
  targetUnit: z.string().trim().max(24).nullable().optional(),
  schedule: schedule.optional(),
  fields: z.record(z.string().max(60), z.unknown()).optional(),
});
export const updateTask = createTask
  .omit({ parentTaskId: true, schedule: true })
  .partial()
  .extend({
    expectedVersion: z.number().int().positive(),
    schedule: schedule.nullable().optional(),
    sortOrder: z.number().int().min(0).optional(),
  });
export const reparentTask = z.object({
  parentTaskId: id.nullable(),
  sortOrder: z.number().int().min(0).optional(),
  expectedVersion: z.number().int().positive(),
});

export const fieldType = z.enum(["text", "number", "boolean", "date", "select", "rating"]);
export const createFieldDefinition = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,59}$/),
  label: name,
  type: fieldType,
  validation: z
    .object({
      required: z.boolean().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      options: z.array(z.string().max(80)).max(50).optional(),
    })
    .default({}),
});

// ---- Occurrences ----
export const occurrenceQuery = z
  .object({ from: localDate, to: localDate, plannerId: id.optional() })
  .refine((q) => q.from <= q.to, "from must not be after to");
export const completeOccurrence = z.object({
  expectedVersion: z.number().int().positive().optional(),
  value: z.number().finite().optional(),
  note: z.string().trim().max(1000).optional(),
  occurredAt: z.iso.datetime().optional(),
});
export const skipOccurrence = completeOccurrence
  .omit({ value: true })
  .extend({ reason: z.string().trim().min(1).max(500) });
export const reopenOccurrence = completeOccurrence.omit({ value: true, note: true });

// ---- Metrics and goals ----
export const metricKind = z.enum(["quantity", "duration", "boolean", "rating", "text"]);
export const aggregation = z.enum(["sum", "avg", "min", "max", "last", "count"]);
export const createMetric = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,59}$/),
  label: name,
  kind: metricKind,
  unit: z.string().trim().max(24).nullable().optional(),
  aggregation: aggregation.default("sum"),
  isSensitive: z.boolean().optional(),
});
export const createMetricLog = z.object({
  metricId: id,
  recordedAt: z.iso.datetime().optional(),
  value: z.number().finite().nullable().optional(),
  textValue: z.string().trim().max(2000).nullable().optional(),
});
export const goalPeriod = z.enum(["daily", "weekly", "monthly", "yearly", "total"]);
export const createGoal = z.object({
  title: name,
  metricId: id.nullable().optional(),
  target: z.number().finite().positive(),
  period: goalPeriod,
  startsOn: localDate.nullable().optional(),
  endsOn: localDate.nullable().optional(),
  milestones: z
    .array(z.object({ title: name, threshold: z.number().finite().positive() }))
    .max(20)
    .optional(),
});

// ---- Templates and AI drafts share one plan shape ----
const planTask: z.ZodType<PlanTask> = z.lazy(() =>
  z.object({
    title: name,
    description: z.string().trim().max(2000).nullable().optional(),
    type: taskType.default("checkbox"),
    targetValue: z.number().finite().nullable().optional(),
    targetUnit: z.string().trim().max(24).nullable().optional(),
    rrule: z.string().trim().max(500).nullable().optional(),
    localTime: clockTime.nullable().optional(),
    children: z.array(planTask).max(LIMITS.maxChildrenPerTask).optional(),
  }),
) as z.ZodType<PlanTask>;
export interface PlanTask {
  title: string;
  description?: string | null;
  type: z.infer<typeof taskType>;
  targetValue?: number | null;
  targetUnit?: string | null;
  rrule?: string | null;
  localTime?: string | null;
  children?: PlanTask[];
}
function countPlan(tasks: PlanTask[] = [], depth = 1): { count: number; depth: number } {
  return tasks.reduce(
    (acc, t) => {
      const sub = countPlan(t.children, depth + 1);
      return { count: acc.count + 1 + sub.count, depth: Math.max(acc.depth, sub.depth) };
    },
    { count: 0, depth: tasks.length ? depth : depth - 1 },
  );
}
export const plannerSnapshot = z
  .object({
    name,
    description: z.string().trim().max(2000).nullable().optional(),
    color: hexColor.optional(),
    icon: icon.optional(),
    sections: z.array(z.object({ name, tasks: z.array(planTask).max(200) })).min(1).max(30),
    fields: z.array(createFieldDefinition).max(30).optional(),
  })
  .superRefine((plan, ctx) => {
    const stats = plan.sections.map((s) => countPlan(s.tasks));
    if (stats.reduce((n, s) => n + s.count, 0) > LIMITS.maxTasksPerPlanner) {
      ctx.addIssue({ code: "custom", message: `Plan exceeds ${LIMITS.maxTasksPerPlanner} tasks` });
    }
    if (stats.some((s) => s.depth > LIMITS.maxTaskDepth)) {
      ctx.addIssue({ code: "custom", message: `Plan exceeds depth ${LIMITS.maxTaskDepth}` });
    }
  });
export type PlannerSnapshot = z.infer<typeof plannerSnapshot>;

export const createTemplate = z.object({
  name,
  description: z.string().trim().max(2000).nullable().optional(),
  plannerId: id.optional(),
  snapshot: plannerSnapshot.optional(),
});
export const instantiateTemplate = z.object({
  version: z.number().int().positive().optional(),
  name: name.optional(),
  categoryId: id.nullable().optional(),
  startsOn: localDate.optional(),
});

// ---- Analytics: a closed query language. No field here is ever interpolated into SQL. ----
export const querySource = z.enum(["occurrences", "metric"]);
export const queryMeasure = z.enum([
  "adherence",
  "completed",
  "eligible",
  "skipped",
  "sum",
  "avg",
  "min",
  "max",
  "count",
]);
export const queryGrain = z.enum(["day", "week", "month"]);
export const querySpec = z
  .object({
    source: querySource,
    measure: queryMeasure,
    grain: queryGrain.default("day"),
    from: localDate,
    to: localDate,
    metricId: id.optional(),
    plannerId: id.optional(),
    categoryId: id.optional(),
  })
  .superRefine((q, ctx) => {
    if (q.from > q.to) ctx.addIssue({ code: "custom", message: "from must not be after to" });
    const days = (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000;
    if (days > LIMITS.maxAnalyticsRangeDays) {
      ctx.addIssue({ code: "custom", message: "Date range is too large" });
    }
    if (q.source === "metric" && !q.metricId) {
      ctx.addIssue({ code: "custom", message: "metricId is required for metric queries" });
    }
    const occurrenceOnly = ["adherence", "completed", "eligible", "skipped"].includes(q.measure);
    if (occurrenceOnly !== (q.source === "occurrences")) {
      ctx.addIssue({ code: "custom", message: "Measure is not valid for this source" });
    }
  });
export type QuerySpec = z.infer<typeof querySpec>;

export const chartType = z.enum(["line", "area", "bar", "heatmap", "stat"]);
export const widget = z.object({
  title: name,
  chartType,
  querySpec: z.object({
    source: querySource,
    measure: queryMeasure,
    grain: queryGrain.default("day"),
    rangeDays: z.number().int().min(1).max(LIMITS.maxAnalyticsRangeDays),
    metricId: id.optional(),
    plannerId: id.optional(),
    categoryId: id.optional(),
  }),
  layout: z.object({ x: z.number().int().min(0), y: z.number().int().min(0), w: z.number().int().min(1).max(12), h: z.number().int().min(1).max(12) }).optional(),
});
export const createDashboard = z.object({ name, widgets: z.array(widget).max(24).default([]) });
export const updateDashboard = createDashboard.partial();

// ---- AI ----
export const createPlannerDraft = z.object({
  prompt: z.string().trim().min(5).max(2000),
  includeSensitive: z.boolean().default(false),
});
export const applyDraft = z.object({
  categoryId: id.nullable().optional(),
  startsOn: localDate.optional(),
  snapshot: plannerSnapshot.optional(),
});
export const askMetrics = z.object({ question: z.string().trim().min(3).max(500) });

// ---- Offline sync (section 8) ----
export const syncOperation = z.object({
  clientOperationId: id,
  entityType: z.literal("occurrence"),
  entityId: id,
  action: z.enum(["complete", "skip", "reopen"]),
  expectedVersion: z.number().int().positive(),
  occurredAt: z.iso.datetime(),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type SyncOperation = z.infer<typeof syncOperation>;
export const syncBatch = z.object({
  operations: z.array(syncOperation).min(1).max(LIMITS.maxSyncBatch),
});
export const syncChangesQuery = z.object({ cursor: z.string().max(100).optional() });
export type SyncOutcome = "accepted" | "duplicate" | "conflict" | "rejected";

export const pushSubscription = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});
export const deletePushSubscription = z.object({ endpoint: z.url().max(1000) });

// ---- Response envelope ----
export interface ApiEnvelope<T> {
  data: T | null;
  meta: { nextCursor?: string | null; [key: string]: unknown } | null;
  error: ProblemDetails | null;
}
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code?: string;
  errors?: { path: string; message: string }[];
  current?: unknown;
}
