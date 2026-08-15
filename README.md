# ONLY HORSES

A horse identity registry with a marketplace built on top of it. Owners keep
each horse's permanent record — identity, health, farrier, competition,
ownership history — and when they want to sell, lease or breed, that record
becomes a listing that is already complete and verifiable.

Section references throughout the code and the ADRs (§7, §13.2, §24.23, …)
point at the *ONLY HORSES Full Build Specification v2.0*. Drop that document at
`docs/SPEC.md` so the references resolve for anyone reading the repo cold.

This README covers how to run what exists.

## Where the build stands

Each milestone's Definition of Done (§23) has an executable check —
`scripts/mN-acceptance.sh` — that runs against a live API and a real database.
"Done" below means that script passes, not that the code compiles.

| Milestone | State |
|---|---|
| **M0 — Foundations** | Done · schema, migrations, seed data, API auth, CI |
| **M1 — Identity & stable** | Done · `scripts/m1-acceptance.sh` |
| **M2 — Listings & search** | Done · `scripts/m2-acceptance.sh` |
| **M3 — Trust & messaging** | Done · `scripts/m3-acceptance.sh` |
| **M4 — Services, jobs, reviews** | Done · `scripts/m4-acceptance.sh` |
| **M5 — Monetization** | Done · `scripts/m5-acceptance.sh` |
| M6 — Polish & launch | In progress · `scripts/m6-acceptance.sh` · see [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) |

M6's DoD is "§24 fully green", and it is not: **21 of 29 criteria are verified,
5 are partly verified, and 3 need a released app or production traffic.** [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) walks all 29 with evidence.

Other known gaps, stated plainly:

- **The app has a demo mode that needs no server at all.** "Demo olarak gir"
  on the sign-in screen answers every request from a local store instead of the
  network: you can register a horse, add photos and health records, publish a
  listing and find it in search, message a seller and get a reply, save
  searches, apply to a job. It persists, so what you make is still there next
  launch. `scripts/mobile-demo-e2e.mjs` walks 15 steps with the API *aborted at
  the network layer* — any request that tries to leave fails the run.
- **The mobile app exists and is verified against the API, but has never run
  on a device.** There is no simulator here and no phone. What is verified is
  Expo's web target — the same React tree, components and tokens, rendered by
  react-native-web: `scripts/mobile-e2e.mjs` walks 25 signed-in steps in
  Chromium against the live API (register, role, §3.3's publishing gate, add a
  horse, upload a photo, health log, competition result, transfer, save a
  listing, message a seller, apply to a job, saved search, sign out and back
  in) and `scripts/contrast-audit.mjs` measures WCAG AA on 27 screens. Both run
  in CI. What that does **not** cover is everything native: the keychain, push
  notifications, the Apple and Google sign-in sheets, the camera, and the build
  itself. Nothing here should be read as "ships to the App Store".
- **Three things are deliberately not wired**, all for the same reason — they
  need credentials this repository must not carry (§24.24): the OAuth
  providers, the identity-verification provider (§17), and payment (ADR-0007).
  Each has a screen that says so rather than a button that fails. Password
  reset is a fourth: there is no reset endpoint and no mail sender, and the
  screen says that instead of showing "gönderildi".
- **There is no admin console.** `apps/admin` is an empty directory. §22's
  metrics and the moderation queue are API endpoints with no screen.
- The Typesense adapter has never been run (ADR-0005, ADR-0006); the measured
  search numbers are Postgres's.
- The Stripe adapter has never been run either (ADR-0007) and needs one pass
  against Stripe test mode before launch.

What does exist and is verified: the API, the database and its RLS, the
business rules, the mobile app's screens and flows, and the web app — the
marketing pages, the horse/equipment/service/job indexes and detail pages,
public profiles, the professionals directory, pricing, the policy pages, and
signed-in screens for your account, horses, listings, products, saved items,
saved searches, notifications, verification, settings and messages. Session
tokens are httpOnly cookies, so no token is reachable from script.

The two clients now cover the same §18.2 flows: recording a horse, its health
log and competition results, §6's ownership transfer, composing a listing,
and the equipment marketplace all exist on both. One thing does not — uploading
photos is mobile-only, because the web has no upload widget yet; the horse
record says so rather than showing a control that does nothing.

§3.3's identity gate covers both marketplaces: publishing a horse listing and
publishing a product each require `identity_verified`, and neither level is
purchasable. Pausing and closing are never gated — a seller must always be
able to take something down.

`scripts/web-account.mjs` walks the signed-in journey in a browser (16 steps)
and `scripts/web-shot.mjs` renders all 34 routes against a live API; both run
in CI.

## Stack

Two deviations from spec §4, both recorded as ADRs:

- **Google Cloud instead of Supabase** (ADR-0001) — Cloud SQL for PostgreSQL
  with PostGIS, Firebase Auth, Cloud Storage, Cloud Run, Memorystore, FCM.
  Not Firestore: the data model is irreducibly relational.
- **React Native + Expo instead of Flutter** (ADR-0002) — so mobile consumes
  the same zod schemas and business rules as the API and the web.

Unchanged: NestJS, Typesense, Next.js, Stripe, Stream Chat, Mux, Resend,
PostHog, Sentry, Cloudflare Images.

## Layout

```
apps/api          NestJS — owns all business logic (spec §4)
apps/web          Next.js App Router — SSR listing pages for SEO (§19), plus
                  the signed-in screens
apps/admin        empty — §22's console has not been started
apps/mobile       Expo Router (ADR-0002) — §18.2's screens; see "known gaps"
packages/
  shared-types    zod schemas, §20 design tokens, the Turkish enum labels, and
                  the business rules the API and both clients must agree on
  demo-content    the exported dataset the web preview and the app fall back to
  config          Tailwind preset derived from the design tokens
db/
  migrations      the §7 schema, append-only and checksummed
  seed.sql        §9 reference data: 130 breeds, 26 disciplines, 22 categories
  tests/          SQL suites for the §7 triggers and §24.23 RLS isolation
docs/decisions    ADRs
```

## Running it

Requires Node 22, pnpm 10, and PostgreSQL 16 with PostGIS.

```bash
pnpm install
cp .env.example .env        # fill in what you need; nothing is committed

# Create the schema, the reference data and the application role.
DIRECT_URL=postgresql://postgres@localhost:5432/only_horses \
  pnpm db:reset

pnpm dev                    # api on :3001, web on :3000
```

The API refuses to start in production if it is connected as a role that
bypasses RLS, because that would silently make every §8 policy inert
(ADR-0004).

### Identity in development

Firebase Auth is the identity provider whenever `FIREBASE_PROJECT_ID` is set.
Without it the API falls back to a local provider that stores an scrypt hash in
Postgres, so the whole stack runs and is testable with no cloud credentials.
That fallback is refused in production.

```bash
curl -X POST localhost:3001/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"guclu-sifre-123","displayName":"Adın"}'
```

## Tests

```bash
pnpm test        # unit tests, including the §24.21 rule coverage
pnpm test:db     # rebuilds the schema from scratch, then the SQL suites
pnpm typecheck
```

`pnpm test:db` needs two connection strings, because the RLS suite is only
meaningful when run as the non-owner application role:

```bash
DIRECT_URL=postgresql://postgres@localhost:5432/only_horses \
DATABASE_URL=postgresql://only_horses_app@localhost:5432/only_horses \
  pnpm test:db
```

### Milestone acceptance runs

Each script drives §23's Definition of Done over HTTP against a running API —
real database, real storage, real notifications. Start the API first.

```bash
bash scripts/m4-acceptance.sh   # post → apply → shortlist → message, end to end
```

They register a handful of accounts, so §12's auth rate limit (10 per 5 minutes
per IP) refuses a second run inside five minutes. That is the limiter working;
wait, or restart the API to clear its window.

## Migrations

Append-only. The runner records a checksum per file and refuses to continue if
an already-applied migration changed — add a new file instead.

```bash
pnpm db:status    # what is applied, pending, or altered
pnpm db:migrate   # apply pending
pnpm db:reset     # drop and rebuild, then seed reference data
```
