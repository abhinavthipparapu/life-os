import type { PrismaClient } from "@lifeos/db";
import type { AiProvider } from "@lifeos/domain";

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}
export interface PushMessage {
  title: string;
  body: string;
  link?: string;
}

export interface JobContext {
  prisma: PrismaClient;
  ai: AiProvider;
  /** Resolves "gone" when the browser has dropped the subscription. */
  sendPush: (target: PushTarget, message: PushMessage) => Promise<"sent" | "gone">;
  /** Deletes the login. Must treat an already-deleted user as success. */
  deleteAuthUser: (id: string) => Promise<void>;
  aiMonthlyBudget: number;
  log: { info: (o: object, m?: string) => void; error: (o: object, m?: string) => void };
}
