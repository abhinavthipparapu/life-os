# API reference

Base path `/api/v1`. Every route except health checks needs `Authorization: Bearer <Supabase access token>`.

## Conventions

- Success: `{ "data": ..., "meta": ..., "error": null }`
- Failure: `{ "data": null, "meta": null, "error": <RFC 9457 problem details> }`, with a machine-readable `code`.
- Request and response shapes live in `packages/contracts`.
- Lists use `cursor` and `limit` (at most 100), with `meta.nextCursor`. Sort fields are allowlisted.
- `Idempotency-Key: <uuid>` makes planner, task, clone and template install requests safe to retry.
- Stale `expectedVersion` values return 409, with the server record in `error.current`.
- Another user's record returns the same 404 as a missing one.
- Every response has an `x-request-id` header.

## Endpoints

| Method             | Path                                                           | Description                                                          |
| ------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| GET                | `/health/live, /health/ready`                                  | Liveness and readiness (public)                                      |
| GET, PATCH         | `/me`                                                          | Current user and profile                                             |
| PATCH              | `/me/preferences`                                              | Preferences                                                          |
| GET                | `/me/requests, /me/requests/:id/download`                      | Export and deletion requests                                         |
| POST               | `/me/export, /me/deletion`                                     | Queue export or deletion. Needs a token under 5 minutes old          |
| GET                | `/home`                                                        | Home summary                                                         |
| GET, POST          | `/categories`                                                  | List, create                                                         |
| POST               | `/categories/reorder`                                          | Reorder                                                              |
| PATCH, DELETE      | `/categories/:id`                                              | Edit, archive                                                        |
| GET, POST          | `/planners`                                                    | List (search, category, cursor), create                              |
| GET, PATCH, DELETE | `/planners/:id`                                                | Read, update with `expectedVersion`, archive                         |
| POST               | `/planners/:id/clone`                                          | Duplicate                                                            |
| POST               | `/planners/:id/sections`                                       | Create section                                                       |
| POST               | `/planners/:id/fields`                                         | Create custom field                                                  |
| POST               | `/planners/:id/tasks`                                          | Create task                                                          |
| GET, PATCH, DELETE | `/tasks/:id`                                                   | Read, update, archive                                                |
| POST               | `/tasks/:id/reparent`                                          | Move, with cycle and depth checks                                    |
| GET                | `/occurrences?from=&to=&plannerId=`                            | Date-scoped occurrences, up to 92 days                               |
| POST               | `/occurrences/:id/complete`                                    | Idempotent completion. `meta.celebration` reports milestones         |
| POST               | `/occurrences/:id/skip`                                        | Skip or rest, with a reason                                          |
| POST               | `/occurrences/:id/reopen`                                      | Undo                                                                 |
| POST               | `/occurrences/:id/defer`                                       | Move to another day                                                  |
| GET, POST          | `/metrics`                                                     | Metric definitions                                                   |
| GET                | `/metrics/:id/series`                                          | Bucketed values                                                      |
| GET, POST          | `/metric-logs`                                                 | Metric logs                                                          |
| GET, POST          | `/goals`                                                       | Goals with progress                                                  |
| GET, DELETE        | `/goals/:id`                                                   | Read, archive                                                        |
| GET, POST          | `/templates`                                                   | Browse, create from a planner or snapshot                            |
| GET                | `/templates/:id?version=`                                      | Read a version                                                       |
| POST               | `/templates/:id/versions`                                      | New immutable version                                                |
| POST               | `/templates/:id/instantiate`                                   | Copy a version into the workspace                                    |
| GET, POST          | `/dashboards`                                                  | Dashboards                                                           |
| GET, PATCH, DELETE | `/dashboards/:id`                                              | Read, update, archive                                                |
| POST               | `/analytics/query`                                             | Allowlisted aggregations only                                        |
| GET                | `/analytics/adherence`                                         | Adherence with an explicit denominator                               |
| GET                | `/ai/usage`                                                    | Allowance used                                                       |
| POST               | `/ai/planner-drafts`                                           | Generate a preview, with no side effects                             |
| GET                | `/ai/planner-drafts/:id`                                       | Read a draft                                                         |
| POST               | `/ai/planner-drafts/:id/apply`                                 | Apply an approved draft                                              |
| POST               | `/ai/insights`                                                 | Server-sent events: sources, delta, done                             |
| POST               | `/ai/ask`                                                      | Answer with exact server values                                      |
| POST               | `/ai/schedule-suggestions`                                     | Proposed changes and conflicts                                       |
| POST               | `/ai/schedule-drafts/:id/apply`                                | Apply approved changes                                               |
| POST               | `/sync/batch`                                                  | Replay offline operations: accepted, duplicate, conflict or rejected |
| GET                | `/sync/changes?cursor=`                                        | Changed records                                                      |
| POST, DELETE       | `/push-subscriptions`                                          | Register, unregister                                                 |
| GET                | `/notifications`                                               | Inbox                                                                |
| POST               | `/notifications/:id/read, /notifications/read-all`             | Mark read                                                            |
| GET                | `/achievements`                                                | Earned achievements                                                  |
| GET                | `/admin/audit-events, /admin/users?email=, /admin/jobs/health` | Admin or support only, MFA required                                  |
| POST               | `/admin/users/:id/revoke`                                      | Revoke access, with confirmation                                     |
