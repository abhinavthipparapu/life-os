import { randomUUID } from "node:crypto";
import { createPrisma } from "@lifeos/db";
import { createAiProvider } from "@lifeos/domain";
import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import pino from "pino";
import webpush from "web-push";
import { z } from "zod";
import { reconcileAggregatesJob } from "./jobs/aggregates.js";
import type { JobContext } from "./jobs/context.js";
import { generateOccurrencesJob } from "./jobs/occurrences.js";
import { drainOutboxJob } from "./jobs/outbox.js";
import { scanRemindersJob } from "./jobs/reminders.js";
import { weeklyReportsJob } from "./jobs/weekly-reports.js";
import {
  DEAD_LETTER_QUEUE,
  JOB_OPTIONS,
  MAINTENANCE_QUEUE,
  SCHEDULES,
  type JobName,
} from "./queues/definitions.js";

const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    SUPABASE_URL: z.url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    AI_PROVIDER: z.enum(["mock", "openai"]).default("mock"),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().optional(),
    AI_MONTHLY_TOKEN_BUDGET: z.coerce.number().int().positive().default(200_000),
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().optional(),
  })
  .parse(process.env);

if (process.env.SENTRY_DSN) {
  const Sentry = await import("@sentry/node");
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    dataCollection: {
      userInfo: false,
      httpBodies: [],
      stackFrameVariables: false,
      databaseQueryData: false,
      genAI: { inputs: false, outputs: false },
    },
  });
}

const log = pino({ redact: ["err.config.headers"] });
const prisma = createPrisma(env.DATABASE_URL);
const pushConfigured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
if (pushConfigured)
  webpush.setVapidDetails(env.VAPID_SUBJECT!, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);

const context: JobContext = {
  prisma,
  log,
  ai: createAiProvider(env),
  aiMonthlyBudget: env.AI_MONTHLY_TOKEN_BUDGET,
  async sendPush(target, message) {
    if (!pushConfigured) return "sent";
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(message),
        { TTL: 3600 },
      );
      return "sent";
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return "gone";
      throw err;
    }
  },
  async deleteAuthUser(id) {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      },
    });
    if (!res.ok && res.status !== 404)
      throw new Error(`Auth deletion failed with status ${res.status}`);
  },
};

const handlers: Record<JobName, () => Promise<unknown>> = {
  "drain-outbox": () => drainOutboxJob(context),
  "generate-occurrences": () => generateOccurrencesJob(context),
  "scan-reminders": () => scanRemindersJob(context),
  "reconcile-aggregates": () => reconcileAggregatesJob(context),
  "weekly-reports": () => weeklyReportsJob(context),
};

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue(MAINTENANCE_QUEUE, { connection });
const deadLetter = new Queue(DEAD_LETTER_QUEUE, { connection });

for (const { name, repeat } of SCHEDULES) {
  await queue.upsertJobScheduler(name, repeat, { name, opts: JOB_OPTIONS });
}

const worker = new Worker(
  MAINTENANCE_QUEUE,
  async (job: Job) => {
    const correlationId = randomUUID();
    const started = Date.now();
    const result = await handlers[job.name as JobName]();
    log.info(
      { job: job.name, jobId: job.id, correlationId, ms: Date.now() - started, result },
      "job finished",
    );
  },
  { connection, concurrency: 4 },
);

worker.on("failed", (job, err) => {
  log.error({ job: job?.name, jobId: job?.id, attempts: job?.attemptsMade, err }, "job failed");
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    void deadLetter.add(job.name, {
      failedJobId: job.id,
      reason: err.message,
      at: new Date().toISOString(),
    });
  }
});

log.info({ schedules: SCHEDULES.length, push: pushConfigured }, "LifeOS worker started");

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    void worker.close().then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  });
}
