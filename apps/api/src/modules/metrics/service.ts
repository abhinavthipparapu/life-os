import { localDateOf } from "@lifeos/analytics-core";
import type {
  createMetric,
  createMetricLog,
  metricLogQuery,
  updateMetric,
  updateMetricLog,
} from "@lifeos/contracts";
import type { PrismaClient } from "@lifeos/db";
import type { z } from "zod";
import { audit } from "../../shared/audit.js";
import { AppError, notFound, paginate } from "../../shared/http.js";
import { metricBuckets } from "@lifeos/domain";
import { userTimezone } from "../analytics/service.js";

function invalid(message: string): never {
  throw new AppError(422, "validation_failed", "Request validation failed", {
    errors: [{ path: "value", message }],
  });
}

/** Checks that a logged value fits the metric's kind. */
function validateUnit(kind: string, value?: number | null, textValue?: string | null) {
  if (kind === "text") {
    if (!textValue) invalid("A text value is required");
    return;
  }
  if (value === null || value === undefined) invalid("A numeric value is required");
  if (kind === "boolean" && value !== 0 && value !== 1) invalid("Must be 0 or 1");
  if (kind === "rating" && (value < 1 || value > 10)) invalid("Must be from 1 to 10");
  if ((kind === "duration" || kind === "quantity") && value < 0) invalid("Must not be negative");
}

export function metricService(prisma: PrismaClient) {
  const owned = async (userId: string, id: string) => {
    const metric = await prisma.metricDefinition.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!metric) throw notFound("Metric");
    return metric;
  };

  return {
    list: (userId: string) =>
      prisma.metricDefinition.findMany({
        where: { userId, deletedAt: null },
        orderBy: { createdAt: "asc" },
      }),

    defineMetric: (userId: string, input: z.output<typeof createMetric>) =>
      prisma.$transaction(async (tx) => {
        const taken = await tx.metricDefinition.findUnique({
          where: { userId_key: { userId, key: input.key } },
        });
        if (taken)
          throw new AppError(409, "duplicate_key", "A metric with this key already exists");
        const metric = await tx.metricDefinition.create({ data: { ...input, userId } });
        await audit(tx, {
          actorId: userId,
          action: "metric.create",
          entityType: "metric",
          entityId: metric.id,
        });
        return metric;
      }),

    updateMetric: (userId: string, id: string, input: z.output<typeof updateMetric>) =>
      prisma.$transaction(async (tx) => {
        const { count } = await tx.metricDefinition.updateMany({
          where: { id, userId, deletedAt: null },
          data: input,
        });
        if (count === 0) throw notFound("Metric");
        await audit(tx, {
          actorId: userId,
          action: "metric.update",
          entityType: "metric",
          entityId: id,
        });
        return tx.metricDefinition.findUniqueOrThrow({ where: { id } });
      }),

    /** Refuses while something still reads the metric, so no goal or chart breaks silently. */
    archiveMetric: (userId: string, id: string) =>
      prisma.$transaction(async (tx) => {
        const metric = await tx.metricDefinition.findFirst({
          where: { id, userId, deletedAt: null },
        });
        if (!metric) throw notFound("Metric");
        const goals = await tx.goal.count({ where: { userId, metricId: id, deletedAt: null } });
        const widgets = await tx.dashboardWidget.count({
          where: {
            dashboard: { userId, deletedAt: null },
            querySpecJson: { path: ["metricId"], equals: id },
          },
        });
        if (goals + widgets > 0) {
          throw new AppError(
            409,
            "metric_in_use",
            "Remove the goals and charts using this metric first",
          );
        }
        // Frees the key, so the user can create a new metric with the same name.
        await tx.metricDefinition.update({
          where: { id },
          data: { deletedAt: new Date(), key: `${metric.key}__archived_${id.slice(0, 8)}` },
        });
        await audit(tx, {
          actorId: userId,
          action: "metric.archive",
          entityType: "metric",
          entityId: id,
        });
      }),

    updateLog: (userId: string, id: string, input: z.output<typeof updateMetricLog>) =>
      prisma.$transaction(async (tx) => {
        const log = await tx.metricLog.findFirst({
          where: { id, userId },
          include: { metric: true },
        });
        if (!log) throw notFound("Log");
        const value = input.value === undefined ? log.value : input.value;
        const textValue = input.textValue === undefined ? log.textValue : input.textValue;
        validateUnit(log.metric.kind, value, textValue);
        const updated = await tx.metricLog.update({ where: { id }, data: { value, textValue } });
        await tx.outboxEvent.create({
          data: {
            userId,
            type: "metric.logged",
            payload: { date: log.localDate.toISOString().slice(0, 10), metricKey: log.metric.key },
          },
        });
        await audit(tx, {
          actorId: userId,
          action: "metric.log.update",
          entityType: "metric_log",
          entityId: id,
        });
        return updated;
      }),

    deleteLog: (userId: string, id: string) =>
      prisma.$transaction(async (tx) => {
        const log = await tx.metricLog.findFirst({
          where: { id, userId },
          include: { metric: true },
        });
        if (!log) throw notFound("Log");
        await tx.metricLog.delete({ where: { id } });
        await tx.outboxEvent.create({
          data: {
            userId,
            type: "metric.logged",
            payload: { date: log.localDate.toISOString().slice(0, 10), metricKey: log.metric.key },
          },
        });
        await audit(tx, {
          actorId: userId,
          action: "metric.log.delete",
          entityType: "metric_log",
          entityId: id,
        });
      }),

    async recordValue(userId: string, input: z.output<typeof createMetricLog>) {
      const metric = await owned(userId, input.metricId);
      validateUnit(metric.kind, input.value, input.textValue);
      const recordedAt = input.recordedAt ? new Date(input.recordedAt) : new Date();
      const localDate = localDateOf(recordedAt, await userTimezone(prisma, userId));
      return prisma.$transaction(async (tx) => {
        const log = await tx.metricLog.create({
          data: {
            userId,
            metricId: metric.id,
            recordedAt,
            localDate: new Date(`${localDate}T00:00:00Z`),
            value: input.value ?? null,
            textValue: input.textValue ?? null,
          },
        });
        await tx.outboxEvent.create({
          data: {
            userId,
            type: "metric.logged",
            payload: { date: localDate, metricKey: metric.key },
          },
        });
        await audit(tx, {
          actorId: userId,
          action: "metric.log",
          entityType: "metric_log",
          entityId: log.id,
        });
        return log;
      });
    },

    async listLogs(userId: string, q: z.output<typeof metricLogQuery>) {
      if (q.metricId) await owned(userId, q.metricId);
      const rows = await prisma.metricLog.findMany({
        where: { userId, ...(q.metricId ? { metricId: q.metricId } : {}) },
        orderBy: [{ recordedAt: "desc" }, { id: "asc" }],
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      });
      return paginate(rows, q.limit);
    },

    async getSeries(
      userId: string,
      id: string,
      from: string,
      to: string,
      grain: "day" | "week" | "month",
    ) {
      const metric = await owned(userId, id);
      const measure = metric.aggregation === "last" ? "max" : metric.aggregation;
      return metricBuckets(prisma, userId, id, from, to, grain, measure);
    },
  };
}
