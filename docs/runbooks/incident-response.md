# Incident response

1. **Assess:** check `/health/ready`, Sentry, `/admin/jobs/health` and the provider status pages.
2. **Stabilize:** roll back, or use `FEATURE_AI=false` if AI is the cause.
3. **Communicate:** tell affected users what happened and what to do.
4. **Fix, then review:** write up the timeline, the cause and what will prevent a repeat.

Find a user's failing request with the `x-request-id` response header, which appears in the API logs.

## Suspected secret leak

1. Rotate the secret at the provider, and update Render or Vercel.
2. For a leaked service role or JWT signing key, rotate it in Supabase. This signs everyone out.
3. Remove it from Git history, and treat it as compromised regardless.
4. Check audit logs for misuse.

## Stuck jobs

- Pending outbox rising: check that the worker is running and Redis is reachable.
- Events at 5 attempts have stopped retrying. Fix the cause, then run
  `UPDATE outbox_events SET attempts = 0 WHERE processed_at IS NULL`.
- Jobs that exhausted their retries are in the `dead-letter` queue, with their failure reason.
