# Go-live guide

These steps need your accounts, so they cannot be automated from here. Check current pricing and plan limits
when you sign up, because they change. Do staging first, and repeat for production with separate projects,
credentials and keys.

## 1. GitHub

1. Create a **private** repository, then run `git remote add origin <url>` and `git push -u origin main`.
2. Replace the usernames in `.github/CODEOWNERS` if needed.
3. Protect `main`: require pull requests, review, and the `verify` and `e2e` checks.
4. Enable secret scanning and Dependabot alerts.
5. Create `staging` and `production` environments, with you as a required reviewer on `production`.

## 2. Supabase (one project per environment)

1. Create the project with the **Data API turned off**, and note its URL, publishable key and service role key.
2. Under Authentication, turn on email confirmation, TOTP MFA, and asymmetric JWT signing keys, so tokens can
   be verified through JWKS.
3. Set the Site URL, and add `https://<your-app>/**` to the redirect allowlist.
4. Configure custom SMTP, since the built-in sender is heavily rate limited.
5. Enable backups and point-in-time recovery on a plan that offers them.
6. Create a scoped database user for the app, and use the pooled connection string as `DATABASE_URL`.

`SUPABASE_JWT_ISSUER` is `https://<project-ref>.supabase.co/auth/v1`.

## 3. Redis

Create a managed Redis instance with the `noeviction` policy, which BullMQ requires.

## 4. Render (API and worker)

1. Copy `infra/deploy/render.yaml` to the repo root and create a Blueprint from it.
2. Set `APP` as a Docker build argument: `api` for the web service, `worker` for the worker.
3. Enter each secret marked `sync: false`. Generate VAPID keys with `pnpm dlx web-push generate-vapid-keys`.
4. Add the custom domain `api.<your-domain>`, then copy the deploy hook URLs into GitHub secrets.

## 5. Vercel (web)

1. Import the repo with root directory `apps/web`.
2. Set the `VITE_` variables from `.env.example`, using only public values.
3. In `apps/web/vercel.json`, replace `REPLACE_DOMAIN` and `REPLACE_PROJECT` in the CSP.
4. Add the production domain.

## 6. Cloudflare

Point `app` and `api` at Vercel and Render, and use Full (strict) TLS.

## 7. Database

Run these once per environment, or the templates page will be empty. Never set `SEED_DEMO_USERS` here.

```sh
DATABASE_URL="<database-url>" pnpm prisma migrate deploy
DATABASE_URL="<database-url>" pnpm exec tsx prisma/seed.ts
```

Then confirm the public key cannot read data. This must not return rows:

```sh
curl -s "https://<project-ref>.supabase.co/rest/v1/profiles?select=*" -H "apikey: <publishable-key>"
```

## 8. OpenAI

Create a project key with a monthly spend limit, then set `AI_PROVIDER=openai`, `OPENAI_API_KEY` and
`OPENAI_MODEL` on Render. Set `FEATURE_AI=false` to turn AI off instantly.

## 9. First admin

Admin roles are granted only in the database. After you sign up:

```sql
UPDATE profiles SET role = 'admin' WHERE email = 'you@example.com';
```

Then open `/admin` and enroll in two-factor authentication.

## 10. Release

1. Merge to `main`, and let the staging workflow run.
2. Run the smoke test, a restore drill and a rollback rehearsal on staging.
3. Have a lawyer review the privacy policy and terms.
4. Run the Production workflow, and approve it.
5. Invite pilot users, watch onboarding and sync, then expand.
