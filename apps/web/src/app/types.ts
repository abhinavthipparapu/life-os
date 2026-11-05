export interface Preferences {
  theme: "system" | "light" | "dark";
  reducedMotion: boolean;
  celebrations: boolean;
  pushEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  aiSensitiveOptIn: boolean;
  aiWeeklyReportOptIn: boolean;
}
export interface Profile {
  authUserId: string;
  email: string;
  displayName: string | null;
  timezone: string;
  role: "user" | "support" | "admin";
  preferences: Preferences;
}
export interface AccountRequest {
  id: string;
  kind: "export" | "deletion";
  status: "queued" | "processing" | "completed" | "failed";
  createdAt: string;
}
export interface Category {
  id: string;
  name: string;
  slug: string;
  color: string;
  icon: string;
  parentId: string | null;
  sortOrder: number;
}
export interface Planner {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  timezone: string;
  version: number;
  isSensitive: boolean;
  categoryId: string | null;
  completedAt: string | null;
  category?: { id: string; name: string; color: string } | null;
  _count?: { tasks: number };
}
export interface Section {
  id: string;
  name: string;
  position: number;
}
export interface FieldDefinition {
  id: string;
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "date" | "select" | "rating";
  validationJson: { required?: boolean; min?: number; max?: number; options?: string[] };
}
export interface Schedule {
  id: string;
  rrule: string;
  slot: string;
  timezone: string;
  startsOn: string;
  endsOn: string | null;
  localTime: string | null;
  reminderOffsets: number[];
}
export interface TaskRow {
  id: string;
  plannerId: string;
  sectionId: string | null;
  parentTaskId: string | null;
  title: string;
  description: string | null;
  type: "checkbox" | "quantity" | "duration" | "rating" | "text";
  targetValue: number | null;
  targetUnit: string | null;
  sortOrder: number;
  version: number;
  schedules: Schedule[];
  fieldValues: { fieldDefinitionId: string; valueJson: unknown }[];
}
export interface PlannerDetail extends Planner {
  sections: Section[];
  fieldDefinitions: FieldDefinition[];
  tasks: TaskRow[];
}
export interface OccurrenceEvent {
  id: string;
  action: string;
  reason: string | null;
  occurredAt: string;
}
export interface TaskDetail extends TaskRow {
  children: TaskRow[];
  occurrences: { id: string; date: string; status: string; events: OccurrenceEvent[] }[];
}
export interface Occurrence {
  id: string;
  date: string;
  status: "pending" | "completed" | "skipped" | "rest" | "not_applicable";
  version: number;
  scheduledAt: string | null;
  value: number | null;
  note: string | null;
  taskId: string;
  task: {
    id: string;
    title: string;
    type: string;
    targetValue: number | null;
    targetUnit: string | null;
    plannerId: string;
    planner: { name: string; color: string };
  };
}
export interface HomeSummary {
  today: string;
  timezone: string;
  counts: {
    eligible: number;
    completed: number;
    skipped: number;
    rest: number;
    notApplicable: number;
  };
  score: number | null;
  streak: { current: number; longest: number };
  planners: Pick<Planner, "id" | "name" | "color" | "icon" | "completedAt">[];
  suggestions: string[];
}
export interface Metric {
  id: string;
  key: string;
  label: string;
  kind: "quantity" | "duration" | "boolean" | "rating" | "text";
  unit: string | null;
  aggregation: string;
  isSensitive: boolean;
}
export interface MetricLog {
  id: string;
  metricId: string;
  recordedAt: string;
  value: number | null;
  textValue: string | null;
}
export interface Goal {
  id: string;
  title: string;
  target: number;
  period: string;
  metricId: string | null;
  metric: Metric | null;
  current: number;
  progress: number;
  milestones: { id: string; title: string; threshold: number; reachedAt: string | null }[];
}
export interface TemplateVersion {
  id: string;
  version: number;
  checksum: string;
  snapshotJson: PlanSnapshot;
}
export interface PlanTaskNode {
  title: string;
  description?: string | null;
  type: string;
  targetValue?: number | null;
  targetUnit?: string | null;
  rrule?: string | null;
  localTime?: string | null;
  children?: PlanTaskNode[];
}
export interface PlanSnapshot {
  name: string;
  description?: string | null;
  sections: { name: string; tasks: PlanTaskNode[] }[];
}
export interface Template {
  id: string;
  ownerId: string | null;
  name: string;
  description: string | null;
  visibility: "private" | "public" | "starter";
  versions: TemplateVersion[];
}
export interface WidgetSpec {
  source: "occurrences" | "metric";
  measure: string;
  grain: "day" | "week" | "month";
  rangeDays: number;
  metricId?: string;
  plannerId?: string;
  categoryId?: string;
}
export interface Widget {
  id?: string;
  title: string;
  chartType: "line" | "area" | "bar" | "heatmap" | "stat";
  querySpecJson?: WidgetSpec;
  querySpec?: WidgetSpec;
}
export interface Dashboard {
  id: string;
  name: string;
  widgets: Widget[];
}
export interface SeriesPoint {
  bucket: string;
  value: number | null;
  eligible?: number;
  completed?: number;
}
export interface AdherenceResult {
  eligible: number;
  completed: number;
  skipped: number;
  rest: number;
  notApplicable: number;
  adherence: number | null;
  from: string;
  to: string;
  timezone: string;
  denominator: string;
  days: { bucket: string; eligible: number; completed: number; skipped: number; rest: number }[];
}
export interface AiDraft {
  id: string;
  prompt: string;
  status: string;
  validatedJson: PlanSnapshot;
}
export interface AiUsage {
  used: number;
  budget: number;
  provider: string;
}
export interface Notification {
  id: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}
export interface Achievement {
  id: string;
  awardedAt: string;
  achievement: { key: string; title: string; description: string; icon: string };
}
