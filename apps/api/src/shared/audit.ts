import type { Prisma } from "@lifeos/db";

interface AuditInput {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  correlationId?: string;
  metadata?: Prisma.InputJsonValue;
}

type AuditClient = Pick<Prisma.TransactionClient, "auditEvent">;

/** Pass the transaction client so an audit row commits or rolls back with its change. */
export async function audit(db: AuditClient, input: AuditInput) {
  await db.auditEvent.create({ data: input });
}

/** Plain data for a JSON column. Round-tripping also drops undefined values. */
export const toJson = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
