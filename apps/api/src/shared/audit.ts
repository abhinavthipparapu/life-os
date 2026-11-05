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
