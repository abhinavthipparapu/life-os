# Migrations and rollback

Agents must never run destructive migrations or production deployments without approval (section 11).

## Expand, backfill, contract

Never rename or drop in one step while old code is running.

1. **Expand:** add the new column or table, nullable or with a default. Deploy.
2. **Backfill:** copy data in batches, and write to both places. Deploy.
3. **Contract:** remove the old structure in a later release, after nothing reads it.

Migrations run in CI before cutover, so new code never meets an old schema. Each change must therefore also
work with the code version before it, which is what makes an application rollback safe.

## Rolling back

- **Application:** redeploy the previous release in Render and Vercel. Schema changes stay in place.
- **Bad migration:** write a new forward migration. Do not edit an applied one.
- **Data loss:** use point-in-time recovery into a new database, verify it, then switch `DATABASE_URL`.

## Restore drill

Run `sh infra/scripts/restore-drill.sh` locally. On managed databases, restore a backup into a scratch instance
and compare row counts. Record the time taken as your real recovery time.
