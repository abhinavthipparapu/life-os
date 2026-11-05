# 2. Transactional outbox instead of queueing from the API

**Status:** accepted

The API writes an `outbox_events` row in the same transaction as each change. The worker drains it with
`FOR UPDATE SKIP LOCKED`, so several workers can share the load.

**Why:** a change and its follow-up work commit together, so nothing is lost if Redis is down or the API
restarts. The API also does not need a queue connection. Delivery is at-least-once, so every handler is
safe to repeat. Events stop retrying after 5 attempts and stay visible to `/admin/jobs/health`.
