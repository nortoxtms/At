# Deploying ONLY HORSES

Target is Google Cloud (ADR-0001): Cloud Run for the API and the web app,
Cloud SQL for PostgreSQL 16 with PostGIS, Cloud Storage for media, Cloud
Scheduler for the jobs, Memorystore for Redis.

Everything below is written to be run once, in order, by someone who has the
project's owner role. Where a value cannot be invented it is written as
`<like-this>`.

---

## 0. What must exist before the first deploy

| Thing | Why | Where it goes |
|---|---|---|
| Cloud SQL instance, PostgreSQL 16, PostGIS enabled | §7's schema uses `geography` throughout | `DATABASE_URL`, `DIRECT_URL` |
| Two database roles | The API must **not** connect as the owner (ADR-0004) | see §2 below |
| Cloud Storage bucket, uniform access, no public objects | §10.3 serves media through signed URLs | `GCS_BUCKET` |
| Stripe account + products from §16.1 | Subscriptions, boosts, job posts | `STRIPE_*` |
| Stripe Identity enabled | §14.1's identity rung | `STRIPE_IDENTITY_WEBHOOK_SECRET` |
| Typesense cluster | §4's search engine | `TYPESENSE_*` |
| Stream Chat app | §15's messaging | `STREAM_API_KEY`, `STREAM_API_SECRET` |
| Firebase project | Auth and FCM | `FIREBASE_*` |
| Resend domain | §17's email channel | `RESEND_API_KEY` |
| Sentry + PostHog projects | §24.19, §24.20 | `SENTRY_DSN`, `POSTHOG_KEY` |

None of these keys belong in the repository (§24.24). Put them in Secret
Manager and mount them as environment variables on the Cloud Run service.

---

## 1. Database

```bash
gcloud sql instances create only-horses \
  --database-version=POSTGRES_16 --tier=db-custom-2-7680 \
  --region=europe-west1 --storage-auto-increase \
  --backup-start-time=02:00 --enable-point-in-time-recovery

gcloud sql databases create only_horses --instance=only-horses
```

PostGIS is created by migration `0001`, which needs superuser on Cloud SQL —
run the first migration as the `postgres` user.

## 2. Roles — the one that is easy to get wrong

The API connects as `only_horses_app`, a role **without** `BYPASSRLS`.
Migration `0017` creates it and grants it exactly what it needs. This is not a
nicety: with a superuser connection every §8 policy is inert, and the API
refuses to start in production if it detects one (ADR-0004).

```sql
ALTER ROLE only_horses_app WITH PASSWORD '<from-secret-manager>';
```

`DIRECT_URL` (the owner) is used **only** by the migration runner.

## 3. Migrations

Append-only and checksummed. The image carries `db/` and `scripts/migrate.mjs`,
so a release applies its own schema change:

```bash
DIRECT_URL=<owner-url> node scripts/migrate.mjs        # apply pending
DIRECT_URL=<owner-url> node scripts/migrate.mjs --status
```

Run it as a Cloud Run **job** before switching traffic, not as part of the
service's startup — two instances starting at once must not race the same
migration.

## 4. Services

```bash
gcloud run deploy only-horses-api \
  --image=<region>-docker.pkg.dev/<project>/only-horses/api:<tag> \
  --region=europe-west1 --min-instances=1 --max-instances=20 \
  --cpu=2 --memory=2Gi --concurrency=80 \
  --add-cloudsql-instances=<project>:europe-west1:only-horses \
  --set-secrets=DATABASE_URL=db-app-url:latest,JWT_SECRET=jwt-secret:latest,...
```

`--min-instances=1` is deliberate: §24.15's p95 budget does not survive a cold
start on the first request of the morning.

The web app is the same shape with `apps/web/Dockerfile`, and its
`NEXT_PUBLIC_*` values are **build arguments** — they are inlined into the
bundle, so a rebuild is required to change them.

## 5. Scheduled jobs — four acceptance criteria live here

Each is an HTTP POST authenticated by the `x-cron-secret` header, which must
equal `JWT_SECRET`. Without these, features that pass their tests in
development silently do nothing in production.

| Schedule | Path | Why this interval |
|---|---|---|
| `*/2 * * * *` | `/v1/jobs/search-sync` | §11.4 says the outbox drains every 2 s; every 2 min is the honest Cloud Scheduler equivalent, and a listing must be searchable long before §24.5's 5-minute alert budget. |
| `*/2 * * * *` | `/v1/jobs/saved-search-alerts` | §24.5: publish → push within 5 minutes. Two minutes leaves room for the run itself. |
| `0 9 * * *` | `/v1/jobs/health-reminders` | §17's `health.due` at 7 days and on the day. 09:00 local, and `NotificationsService` still applies quiet hours per user. |
| `0 * * * *` | `/v1/jobs/marketplace-sweeps` | §13.6 job expiry, §2 grant expiry, §17 review prompts, §16.1 boost expiry, §24.14 erasures. |

```bash
gcloud scheduler jobs create http saved-search-alerts \
  --location=europe-west1 --schedule="*/2 * * * *" \
  --uri="https://<api-host>/v1/jobs/saved-search-alerts" \
  --http-method=POST \
  --headers="x-cron-secret=<jwt-secret>"
```

## 6. Webhooks

| Provider | Path | Secret |
|---|---|---|
| Stripe (payments) | `POST /v1/webhooks/stripe` | `STRIPE_WEBHOOK_SECRET` |
| Stripe Identity | same path | `STRIPE_IDENTITY_WEBHOOK_SECRET` |

Both verify the signature over the **raw** body. Nothing may sit in front of
Cloud Run that rewrites the request body — a re-serializing proxy breaks the
signature and every subscription silently stops applying.

Send Stripe these events: `checkout.session.completed`,
`customer.subscription.created|updated|deleted`, `invoice.payment_failed`,
`identity.verification_session.verified|requires_input`.

## 7. Search

```bash
pnpm --filter api search:reindex     # builds all four §11.1 collections
```

Run it once after the first deploy and after any change to a search document's
shape. Ordinary changes flow through the outbox by themselves.

## 8. Before announcing it

- [ ] `scripts/m1..m6-acceptance.sh` green against staging, not just locally.
- [ ] One real Stripe test-mode payment through checkout → webhook → boost
      applied. The Stripe adapter has never run (ADR-0007) — this is the pass
      that retires that risk.
- [ ] One real Typesense query through `/v1/listings/search` (ADR-0005).
- [ ] Legal pages reviewed by a lawyer and the `OPERATOR` placeholders in
      `apps/web/src/content/legal.ts` filled in.
- [ ] k6 run at 200 concurrent users against staging (§24.15).
- [ ] Lighthouse on a listing page over throttled 4G (§24.18).
- [ ] Sentry receiving events from both services; alerting on P0/P1.
- [ ] A restore rehearsal: take a Cloud SQL backup and restore it into a scratch
      instance. An untested backup is not a backup.

## 9. Rollback

Cloud Run keeps revisions; traffic can be moved back in one command:

```bash
gcloud run services update-traffic only-horses-api --to-revisions=<previous>=100
```

Migrations do **not** roll back automatically, which is why they are
append-only and additive: a new column or a new function is safe to leave in
place while the previous revision serves. Never write a migration that drops a
column the current revision still reads.
