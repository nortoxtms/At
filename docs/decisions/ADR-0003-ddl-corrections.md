# ADR-0003 — Corrections applied to the §7 DDL

**Status:** accepted · 2026-08-12

The §7 DDL is authoritative for the data model, but does not execute as
written. These are the minimum changes needed to make it run, plus the tables
the spec references elsewhere but never defines. Everything here is verified by
`db/tests/smoke.sql` against a real PostgreSQL 16 + PostGIS instance.

## Blocking fixes

**1. Reference tables were declared after their referents.**
§7 places `breeds`, `disciplines` and `service_categories` in the final block,
but `horses.breed_id` references `breeds(code)` and `service_listings.category`
references `service_categories(code)`. Moved to `0003_reference_tables.sql`,
ahead of both.

**2. `placing` is a reserved word.**
`horse_competition_results.placing` fails to parse in PostgreSQL. The column
name is kept for spec fidelity but quoted in the DDL. Prisma and the query
builder quote identifiers automatically; raw SQL must write `"placing"`.

**3. Circular references split into `ALTER TABLE`.**
`profiles.avatar_media_id` → `media`, and `media.owner_profile_id` → `profiles`,
form a cycle. The FK from `profiles`, `organizations` and `credentials` to
`media` is added in `0005_media.sql` after both tables exist. Same treatment
for `horse_ownership_history.transfer_listing_id` → `listings` (0007) and
`job_applications.conversation_id` → `conversations` (0009); §7 declares both
as bare `UUID` with no constraint, which loses referential integrity for no
gain.

## Tables the spec requires but never defines

- **`fx_rates`** — §11.3 mandates `price_eur` computed daily from "an FX rate
  table (`fx_rates`, source: ECB)". Added in 0003 with EUR/TRY/USD/GBP seeded.
- **`search_outbox`** — §11.4 mandates the outbox pattern with a 2-second
  drain. Added in 0011.
- **`stripe_events`** — §16.2 mandates upsert-by-`stripe_event_id` before
  processing any webhook, which §24.10 tests. Added in 0010.

## Columns added

Each one exists because a numbered requirement cannot be satisfied without it.

| Column | Required by |
|---|---|
| `media.exif_stripped_at` | §10.3 / §24.8 — auditable proof GPS stripping ran |
| `listings.under_offer_since` | §13.1 — `under_offer` auto-reverts after 14 days |
| `conversation_participants.message_count` | §13.4 — review eligibility needs ≥2 messages per side without querying Stream on every read |
| `reviews.hidden_reason`, `reviews.hidden_by` | §13.4 — moderators must log a reason when hiding |
| `reviews.author_name_snapshot` | §24.14 — reviews are anonymized, not deleted |
| `moderation_cases.is_upheld`, `.subject_profile_id` | §13.3 — the −20 penalty applies only to *upheld* actions against a specific user |
| `horses.ownership_verified_at` | §14.1 — the "Ownership verified" badge |
| `profiles.date_of_birth` | §26 — 18+ to publish, 16+ to register |
| `legal_hold` on `profiles`, `horses`, `listings` | §26 — deletion jobs skip records under dispute |

## Deliberately not changed

`horses.status` stays `'active'` after a sale (trigger 3 in §7). A sold horse
is still a current horse; only the listing closes. The `'sold'` value in
`horse_status` is reserved for a horse whose record is retired from the
platform after leaving it.
