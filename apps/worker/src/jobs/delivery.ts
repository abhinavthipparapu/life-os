import type { PrismaClient } from "@lifeos/db";

interface Delivery {
  userId?: string | null;
  jobName: string;
  jobId?: string;
  correlationId?: string;
  dedupeKey: string;
  status: string;
}

/** Claims a delivery before doing it. Returns false if it was already claimed, so retries cannot resend. */
export async function claimDelivery(prisma: PrismaClient, delivery: Delivery): Promise<boolean> {
  try {
    await prisma.jobDeliveryLog.create({ data: delivery });
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return false;
    throw err;
  }
}
