# Production readiness checklist

Adapted from blueprint section 13. **Done** means built and verified locally. **You** means it needs an
account, a decision or a person.

| Control                                                          | Status                                                                              |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Databases and data**                                           |                                                                                     |
| Foreign keys, indexes, unique constraints                        | Done                                                                                |
| Restore drill                                                    | Done locally with `restore-drill.sh`. **You:** repeat on the managed database       |
| Backups and point-in-time recovery                               | **You:** enable on the hosted plan                                                  |
| Migration rollback plan                                          | Done: see `runbooks/migrations-and-rollback.md`                                     |
| Retention and deletion                                           | Deletion done and tested. **You:** decide the audit log retention period            |
| **Secrets and access**                                           |                                                                                     |
| No frontend secrets, scanned in CI                               | Done                                                                                |
| Secret scanning                                                  | Done in CI. **You:** enable GitHub secret scanning                                  |
| Secrets manager and rotation                                     | **You:** store in Render and Vercel, and rotate per `runbooks/incident-response.md` |
| Least-privilege database user                                    | **You:** create a scoped user. See the go-live guide                                |
| **Authentication and authorization**                             |                                                                                     |
| Email verification, cross-user tests, resource-level auth        | Done                                                                                |
| Session revocation                                               | Done in the API                                                                     |
| MFA for admins                                                   | Done and tested                                                                     |
| **Admin panels and internal tools**                              |                                                                                     |
| Role gates, audit trail, confirmations, no debug endpoints       | Done                                                                                |
| **User input and validation**                                    |                                                                                     |
| Zod at every boundary, pagination, body size limits              | Done                                                                                |
| CORS allowlist and CSRF review                                   | Done                                                                                |
| File upload limits                                               | Not applicable: the app has no uploads                                              |
| **Costs and limits**                                             |                                                                                     |
| AI quotas, rate limits, queue bounds                             | Done                                                                                |
| Budget caps and capacity alerts                                  | **You:** set spend limits with OpenAI and hosting providers                         |
| **Deployment and environments**                                  |                                                                                     |
| Separate environments, migration gates, approval step            | Configured. **You:** create the environments                                        |
| Rollback rehearsal                                               | **You:** rehearse on staging                                                        |
| **Monitoring and errors**                                        |                                                                                     |
| Structured logs, request ids, no personal data in logs or Sentry | Done                                                                                |
| Sentry                                                           | Built in. **You:** create a project and set the DSN                                 |
| Alerts                                                           | **You:** configure from `runbooks/alerts.md`                                        |
| **Code and version control**                                     |                                                                                     |
| Automated tests, dependency scanning, reproducible installs      | Done                                                                                |
| Protected branches and review                                    | **You:** enable on GitHub                                                           |
| **Legal and compliance**                                         |                                                                                     |
| Account export and deletion, health data opt-in                  | Done                                                                                |
| Privacy policy and terms                                         | **Draft only. You:** have a lawyer review them before launch                        |
| **Operational hygiene**                                          |                                                                                     |
| Runbooks                                                         | Done                                                                                |
| On-call owner, patch cadence, disaster recovery drills           | **You:** assign an owner and a schedule                                             |
