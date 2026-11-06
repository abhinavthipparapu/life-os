import { createHash } from "node:crypto";
import {
  plannerSnapshot,
  type createTemplate,
  type instantiateTemplate,
  type updateTemplate,
  type PlannerSnapshot,
} from "@lifeos/contracts";
import type { Prisma, PrismaClient } from "@lifeos/db";
import type { z } from "zod";
import { audit, toJson } from "../../shared/audit.js";
import { badRequest, notFound } from "../../shared/http.js";
import { materializeSnapshot, plannerToSnapshot } from "../planners/snapshot.js";

type Tx = Prisma.TransactionClient;

const checksum = (snapshot: PlannerSnapshot) =>
  createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");

/** Starter and public templates are readable by anyone. Private ones only by their owner. */
const readable = (userId: string): Prisma.TemplateWhereInput => ({
  deletedAt: null,
  OR: [{ ownerId: userId }, { visibility: { in: ["starter", "public"] } }],
});

async function resolveSnapshot(
  tx: Tx,
  userId: string,
  input: { plannerId?: string; snapshot?: PlannerSnapshot },
) {
  if (input.plannerId) return plannerToSnapshot(tx, userId, input.plannerId);
  if (input.snapshot) return input.snapshot;
  throw badRequest("Provide plannerId or snapshot");
}

export function templateService(prisma: PrismaClient) {
  return {
    listTemplates: (userId: string, search?: string) =>
      prisma.template.findMany({
        where: {
          ...readable(userId),
          ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
        },
        orderBy: [{ visibility: "desc" }, { name: "asc" }],
        take: 100,
        include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      }),

    async getVersion(userId: string, id: string, version?: number) {
      const template = await prisma.template.findFirst({
        where: { id, ...readable(userId) },
        include: {
          versions: { orderBy: { version: "desc" }, where: version ? { version } : {}, take: 1 },
        },
      });
      if (!template || template.versions.length === 0) throw notFound("Template");
      return template;
    },

    createTemplate: (userId: string, input: z.output<typeof createTemplate>) =>
      prisma.$transaction(async (tx) => {
        const snapshot = await resolveSnapshot(tx, userId, input);
        const template = await tx.template.create({
          data: {
            ownerId: userId,
            name: input.name,
            description: input.description ?? null,
            versions: {
              create: { version: 1, snapshotJson: toJson(snapshot), checksum: checksum(snapshot) },
            },
          },
          include: { versions: true },
        });
        await audit(tx, {
          actorId: userId,
          action: "template.create",
          entityType: "template",
          entityId: template.id,
        });
        return template;
      }),

    createTemplateVersion: (
      userId: string,
      id: string,
      input: { plannerId?: string; snapshot?: PlannerSnapshot },
    ) =>
      prisma.$transaction(async (tx) => {
        const template = await tx.template.findFirst({
          where: { id, ownerId: userId, deletedAt: null },
        });
        if (!template) throw notFound("Template");
        const snapshot = await resolveSnapshot(tx, userId, input);
        const latest = await tx.templateVersion.aggregate({
          where: { templateId: id },
          _max: { version: true },
        });
        const version = await tx.templateVersion.create({
          data: {
            templateId: id,
            version: (latest._max.version ?? 0) + 1,
            snapshotJson: toJson(snapshot),
            checksum: checksum(snapshot),
          },
        });
        await audit(tx, {
          actorId: userId,
          action: "template.version",
          entityType: "template",
          entityId: id,
        });
        return version;
      }),

    /** Name and description only. Published versions never change. */
    updateTemplate: (userId: string, id: string, input: z.output<typeof updateTemplate>) =>
      prisma.$transaction(async (tx) => {
        const { count } = await tx.template.updateMany({
          where: { id, ownerId: userId, deletedAt: null },
          data: input,
        });
        if (count === 0) throw notFound("Template");
        await audit(tx, {
          actorId: userId,
          action: "template.update",
          entityType: "template",
          entityId: id,
        });
        return tx.template.findUniqueOrThrow({ where: { id } });
      }),

    /** Planners already made from it are independent copies, so they are unaffected. */
    archiveTemplate: (userId: string, id: string) =>
      prisma.$transaction(async (tx) => {
        const { count } = await tx.template.updateMany({
          where: { id, ownerId: userId, deletedAt: null },
          data: { deletedAt: new Date() },
        });
        if (count === 0) throw notFound("Template");
        await audit(tx, {
          actorId: userId,
          action: "template.archive",
          entityType: "template",
          entityId: id,
        });
      }),

    /** Copies the immutable version into the user's workspace in one transaction and records its origin. */
    instantiateTemplate: (
      userId: string,
      id: string,
      input: z.output<typeof instantiateTemplate>,
    ) =>
      prisma.$transaction(
        async (tx) => {
          const template = await tx.template.findFirst({
            where: { id, ...readable(userId) },
            include: {
              versions: {
                orderBy: { version: "desc" },
                where: input.version ? { version: input.version } : {},
                take: 1,
              },
            },
          });
          const version = template?.versions[0];
          if (!version) throw notFound("Template");
          const profile = await tx.profile.findUniqueOrThrow({ where: { authUserId: userId } });
          const planner = await materializeSnapshot(
            tx,
            plannerSnapshot.parse(version.snapshotJson),
            {
              userId,
              timezone: profile.timezone,
              categoryId: input.categoryId,
              name: input.name,
              startsOn: input.startsOn,
            },
          );
          await tx.templateInstall.create({
            data: { userId, versionId: version.id, plannerId: planner.id },
          });
          await audit(tx, {
            actorId: userId,
            action: "template.instantiate",
            entityType: "planner",
            entityId: planner.id,
            metadata: { templateId: id, version: version.version },
          });
          return planner;
        },
        { timeout: 20_000 },
      ),
  };
}
