export const MAINTENANCE_QUEUE = "maintenance";
export const DEAD_LETTER_QUEUE = "dead-letter";

export type JobName = "drain-outbox" | "generate-occurrences" | "scan-reminders" | "reconcile-aggregates" | "weekly-reports";

// Scheduler ids are fixed, so restarting or scaling workers never duplicates a schedule.
export const SCHEDULES: { name: JobName; repeat: { every: number } | { pattern: string; tz?: string } }[] = [
  { name: "drain-outbox", repeat: { every: 10_000 } },
  { name: "scan-reminders", repeat: { every: 60_000 } },
  { name: "generate-occurrences", repeat: { pattern: "0 * * * *" } },
  { name: "reconcile-aggregates", repeat: { pattern: "30 2 * * *", tz: "UTC" } },
  { name: "weekly-reports", repeat: { pattern: "0 6 * * 1", tz: "UTC" } },
];

export const JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 1000 },
} as const;
