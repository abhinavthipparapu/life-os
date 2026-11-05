# 6. Stable, cooled-off dependency versions

**Status:** accepted

- Prisma is pinned to 7.10.1 because npm's `latest` tag pointed to an 8.0 release candidate.
- pnpm holds back packages published in the last 24 hours, but silently adds exclusions when a declared
  range needs a newer release. `pnpm check:deps` fails CI if any exclusion appears. Pin an older version
  instead of relaxing the policy.
- Install scripts run only for allowlisted packages in `pnpm-workspace.yaml`.

`@prisma/adapter-pg` triggers a `pg` deprecation warning from inside Prisma's transaction engine. It needs
no action until `pg` 9, so check it when upgrading.
