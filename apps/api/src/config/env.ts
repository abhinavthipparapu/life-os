import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).optional(),
  SUPABASE_URL: z.url(),
  SUPABASE_JWT_ISSUER: z.url(),
  SUPABASE_JWT_AUDIENCE: z.string().default("authenticated"),
  WEB_ORIGIN: z.string().min(1),
  FEATURE_AI: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  AI_PROVIDER: z.enum(["mock", "openai"]).default("mock"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  ADMIN_REQUIRE_MFA: z.stringbool().optional(),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(300),
  AI_MONTHLY_TOKEN_BUDGET: z.coerce.number().int().positive().default(200_000),
});
export type Env = z.infer<typeof schema>;

/** Fails at startup, naming only the invalid keys, so values never reach the logs. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const keys = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${keys}`);
  }
  return parsed.data;
}
