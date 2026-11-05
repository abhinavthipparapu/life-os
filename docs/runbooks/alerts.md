# Alerts to configure

| Alert             | Source                                         | Suggested start                 |
| ----------------- | ---------------------------------------------- | ------------------------------- |
| 5xx rate          | Render, Sentry                                 | Over 1% for 5 minutes           |
| Auth failures     | Supabase logs                                  | Sudden rise from baseline       |
| Queue lag         | `oldestPendingSeconds` in `/admin/jobs/health` | Over 300 seconds                |
| Job failures      | `failuresLast24h`                              | Above 0 for account jobs        |
| Aggregate drift   | `aggregate drift repaired` in worker logs      | Any recurring drift             |
| Database capacity | Provider                                       | Over 80% storage or connections |
| AI spend          | OpenAI, `ai_usage`                             | 80% of the monthly budget       |
| Backup failures   | Provider                                       | Any failure                     |

Tune thresholds once you have real traffic.
