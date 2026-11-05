# LifeOS

A dynamic, AI-assisted life planning platform. Users design their own categories, planners, nested
tasks, schedules, metrics and dashboards, and it all works offline as a PWA.

| Part            | Stack                                                                         |
| --------------- | ----------------------------------------------------------------------------- |
| `apps/web`      | React, TypeScript, Vite, Tailwind, shadcn/ui, Bklit charts, RTK Query, Motion |
| `apps/api`      | Express modular monolith, Prisma, Supabase JWT verification                   |
| `apps/worker`   | BullMQ jobs: reminders, occurrences, aggregates, reports, account requests    |
| `packages/*`    | Shared contracts, domain logic, scoring, UI components, database client       |
| `prisma`        | Schema, migrations, seed data                                                 |
| `infra`, `docs` | Docker, deployment, scripts, architecture decisions, runbooks, security       |

## Run it locally

You need Node 24, Docker and pnpm (`corepack enable pnpm`).

```sh
pnpm install
pnpm setup:env                 # creates .env with generated local secrets
pnpm db:up                     # Postgres, Redis, Supabase Auth, mail sink
pnpm prisma migrate deploy
pnpm prisma generate
SEED_DEMO_USERS=true pnpm db:seed
pnpm dev                       # web on :5173, API on :4000, worker
```

- App: http://localhost:5173
- Email sink, for signup and reset links: http://localhost:58025
- Demo logins: `demo@lifeos.local` and `demo2@lifeos.local`, with the `SEED_DEMO_PASSWORD` from `.env`

AI uses a mock provider until you set `AI_PROVIDER=openai`, `OPENAI_API_KEY` and `OPENAI_MODEL`.

## Check your work

```sh
pnpm check                             # dependency policy, lint, format, types, tests, builds
pnpm --filter @lifeos/web e2e          # browser tests against the real stack
sh infra/scripts/restore-drill.sh      # backup and restore drill
```

Before going live, follow [the go-live guide](docs/runbooks/go-live.md).

## Documentation

- [Blueprint coverage audit](docs/product/blueprint-coverage.md): every blueprint section and its status
- [Production readiness checklist](docs/security/production-readiness.md)
- [Threat model](docs/security/threat-model.md)
- [API reference](docs/api/README.md)
- [Architecture decisions](docs/adr)
- [Runbooks](docs/runbooks)
