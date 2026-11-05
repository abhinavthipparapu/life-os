import { z } from "zod";

// Explicitly public values only. Service keys and database credentials never belong here.
const schema = z.object({
  VITE_API_URL: z.url(),
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).default("local-anon"),
  VITE_VAPID_PUBLIC_KEY: z.string().optional(),
});

export const env = schema.parse(import.meta.env);
