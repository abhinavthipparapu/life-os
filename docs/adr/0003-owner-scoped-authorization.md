# 3. Authorization in the API, scoped by owner on every query

**Status:** accepted

The Prisma connection is privileged and bypasses Postgres row level security, so RLS gives no protection
here. Identity comes only from the verified JWT. Each repository call takes the owner id, and a missing
record and another user's record return the same 404, so ids cannot be probed. Raw SQL in analytics always
binds `user_id`, and its column expressions come from constants.

Tests cover cross-user access per resource, and a test walks the routing table to prove each route rejects
anonymous callers.

Row level security is still enabled on every table, with no policies, for a different reason: Supabase's Data
API exposes the `public` schema using a key that ships in the browser. Any migration that adds a table must
also enable row level security on it, and `apps/api/test/rls.test.ts` fails if one is missed.
