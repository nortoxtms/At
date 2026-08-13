# §24 acceptance criteria — where each one actually stands

M6's Definition of Done (§23) is "§24 fully green". It is not, and this
document says exactly which lines are green, which are not, and why — because
the alternative is a checklist that claims a launch is ready when it is not.

Measured on 2026-08-13 against the branch `claude/only-horses-full-spec-ech40x`,
with the API and web app running locally over PostgreSQL 16 + PostGIS.

**Legend** — ✅ verified by an executable check · ⚠️ implemented, not measured
to the stated threshold · ❌ not possible in this environment.

---

## Functional

| # | Criterion | State | Evidence |
|---|---|---|---|
| 1 | Install → published, searchable listing without support | ⚠️ | The API half is covered end to end (`m1`, `m2`). The *install* half needs a device build, which this environment cannot produce (see §24.17). |
| 2 | Publishing without identity verification is impossible from every client | ✅ | `m2-acceptance.sh`, `m3-acceptance.sh` — `VERIFICATION_REQUIRED` from a direct API call; the rule lives in `EntitlementsService`, so no client can route around it. |
| 3 | A horse record survives a sale | ✅ | `m1-acceptance.sh` — transfer moves edit rights and the ownership history shows both owners. |
| 4 | Health records invisible to non-granted users everywhere | ✅ | `m3-acceptance.sh`; the search projection carries `has_xray` and never the records themselves. |
| 5 | Saved search → push within 5 minutes | ✅ | `m6-acceptance.sh` — measured at **1 s** from publish to push, against a 300 s budget. |
| 6 | Vaccination/farrier reminders at 7 days and on the day, respecting quiet hours | ✅ | `m1-acceptance.sh`; quiet hours are enforced in `NotificationsService.dispatch`. |
| 7 | Duplicate photo across accounts → `pending_review` + moderation case | ✅ | `m3-acceptance.sh` — pHash match on a real re-uploaded image. |
| 8 | EXIF GPS absent from every stored image | ✅ | `m1-acceptance.sh` — `exiftool` over 20 stored uploads. |
| 9 | Rate limits: 429 with `Retry-After`, per profile | ✅ | `m1-acceptance.sh`; observed live during M4/M5 runs, which is how the limiter proved itself. |
| 10 | Every Stripe webhook idempotent (3× → one effect) | ✅ | `m5-acceptance.sh` — 3 deliveries → 1 subscription row, 1 purchase row, boost still 7 days. |
| 11 | Pro → Free with 8 active listings pauses the newest 5, notifies, deletes nothing | ✅ | `m5-acceptance.sh` — 8 → 3 active + 5 paused, verified to be *the newest five*. |
| 12 | Reviews require a qualifying conversation | ✅ | `m4-acceptance.sh` — refused with `no_qualifying_contact`, then allowed after 2 messages each way. |
| 13 | Blocking removes the user from search, hides their listings, freezes threads | ✅ | `m3-acceptance.sh` (threads) + `m6-acceptance.sh` (search). The search half was missing until M6 — the block only froze conversations. |
| 14 | Deletion removes personal data in 30 days, anonymizes reviews, keeps horses with `owner_name_text` | ✅ | `m6-acceptance.sh` — including the legal-hold refusal and the 30-day cancel window. |

## Quality

| # | Criterion | State | Notes |
|---|---|---|---|
| 15 | API p95 < 300 ms reads / < 800 ms writes at 200 concurrent | ⚠️ | Single-user reads measure in the low tens of ms, but **no load test has been run** — §27 names k6 and it has not been used. The number that matters here is unmeasured. |
| 16 | Search p95 < 200 ms with 50k listings | ⚠️ | Measured at **9–12 ms with 500 listings** (`m2-acceptance.sh`). The 50k corpus has never been built, and the production engine is Typesense, which has never run here (ADR-0005). |
| 17 | Mobile cold start < 2.5 s on a mid-tier Android | ❌ | No Android SDK, no Xcode, no device. The mobile app type-checks; it has never been built or launched. |
| 18 | Web LCP < 2.5 s on 4G for listing detail | ⚠️ | Pages are server-rendered with ISR and ship ~102 kB of shared JS, which is the right shape — but no Lighthouse run against a throttled connection has been done. |
| 19 | Crash-free sessions > 99.5 % over 7 days | ❌ | Requires a released app and real users. |
| 20 | No P0/P1 Sentry issues open | ❌ | Requires a Sentry project receiving production traffic. |

## Coverage & security

| # | Criterion | State | Notes |
|---|---|---|---|
| 21 | ≥ 70 % on API business logic; 100 % on lifecycle, quality score, trust score, limits, webhook handlers | ⚠️ | **Split.** The named rules live in `packages/shared-types` and are at **100 % statements** each (listing-lifecycle 100, quality-score 100, trust 100, limits 100, billing 100; package total 96.9 %, 108 tests). The NestJS services are at **4.5 % statements** — they are covered end to end by six acceptance scripts, not by unit tests. The 70 % line is **not met** as written. |
| 22 | E2E covers signup → horse → listing → search → inquiry → reply → close | ⚠️ | The journey is covered by `m1`/`m2`/`m3` over HTTP, which is stronger than a UI script in some ways and weaker in others: no browser, no mobile `integration_test`. Playwright is installed and unused. |
| 23 | RLS verified by an automated cross-tenant test | ✅ | `db/tests/rls.sql`, run by `pnpm test:db` **as the application role** — as the owner it would pass vacuously. |
| 24 | No secrets in the repository; `gitleaks` clean in CI | ✅ | `.github/workflows/ci.yml` runs gitleaks on every push; `.env` is git-ignored and every key is read from the environment. |
| 25 | OWASP top-10 pass (auth, IDOR, injection, SSRF, file-type validation) | ⚠️ | IDOR is checked on every `:id` route the acceptance scripts touch, and answers `NOT_FOUND` rather than `FORBIDDEN` by design. Every query is parameterized; uploads are validated by magic bytes. **No ZAP baseline scan has been run**, and SSRF on URL fields (`apply_url`, `website`) is validated only as a URL, not fetched-and-checked. |

## Content & legal

| # | Criterion | State | Evidence |
|---|---|---|---|
| 26 | ToS, Privacy, Welfare, Cookie notice in tr + en, linked from signup and settings | ✅ | `m6-acceptance.sh` — 7 documents × 2 languages, each substantive and cross-linked, each stating the rule the code enforces. **Drafted, not lawyer-reviewed**, and the operator entity fields are visible placeholders. |
| 27 | GDPR/KVKK export: complete JSON + media archive within 24 h | ✅ | `m6-acceptance.sh` — every section present, media as signed URLs, and one user cannot download another's. |
| 28 | Prohibited content blocks publish with a specific message | ✅ | `m2-acceptance.sh` (welfare), `m4-acceptance.sh` (§26 wage rules) — each refusal names the rule it broke. |
| 29 | Store listings pass Apple and Google review including UGC requirements | ❌ | No build, no store account. The UGC requirements themselves — report, block, moderation contact — are implemented and tested. |

---

## Summary

**19 of 29 verified. 7 implemented but unmeasured. 3 impossible here.**

The three impossible ones (§24.17, §24.19, §24.20, §24.29 — four counting store
review) all need a released mobile app and production traffic. Nothing in the
codebase blocks them.

The seven unmeasured ones split into two groups:

- **Needs a load generator and a corpus** — §24.15, §24.16, §24.18. k6,
  a 50k-listing index and a Lighthouse run are each a day's work and none of
  them are blocked by anything.
- **Needs test-writing** — §24.21's API-side 70 % and §24.22's browser E2E.
  This is the honest weak point of the build: the business *rules* are
  thoroughly tested, and the NestJS *plumbing* around them is covered only by
  end-to-end scripts. Those scripts are real — they run against a live API and
  a real database, and they have caught eleven genuine bugs across M1–M6 —
  but they are not a substitute for unit tests when a service is refactored.

Two adapters have never executed: **Typesense** (ADR-0005) and **Stripe**
(ADR-0007). Both have working local counterparts that the acceptance runs
exercise, and both need one pass against the real service before launch.
