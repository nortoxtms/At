# ADR-0006 — What M4 decided where the spec is silent

**Status:** accepted · 2026-08-13
**Relates to:** spec §11.1, §13.4, §13.6, §23 M4, §26

## Context

M4 builds services, jobs, applications, reviews and the professional
directory. Five points came up where the spec states an outcome without
stating the rule that produces it. The spec's own instruction is to record
those decisions rather than guess quietly, so here they are.

## 1. §13.4's review window closes 14 days after the last activity

> "14-day window after the conversation goes quiet or the listing closes."

Two readings: the window **opens** 14 days after, or it **closes** 14 days
after. Implemented as a closing deadline —
`max(last_message_at, listing_closed_at, transfer_completed_at) + 14 days`.

The alternative — a fortnight of enforced silence before anyone may write —
would collect fewer and staler reviews (people write while they still care),
and would hand a bad actor two weeks of unrated trading after every deal. The
deadline reading also makes the copy honest: the API returns `windowClosesAt`
so the UI can say "3 gün kaldı" rather than "come back later".

Consequence: the window extends while a conversation is live. That is
intentional; an ongoing conversation is not a stale one.

## 2. §13.6's application flow is ordered, not a fixed edge list

> `submitted → viewed → shortlisted → interview → offered → rejected|withdrawn`

Read literally this is a chain, and an employer who shortlists straight from
`submitted` would be refused. Employers skip rungs constantly, and refusing it
would only teach them to lie about the state. So the progression is treated as
an **order**: any forward move is allowed, backwards is not, `rejected` is
available from any live state, `withdrawn` belongs to the applicant alone, and
both are terminal.

`viewed` is set as a side effect of the employer opening the applicant list
(`mark_applications_viewed`, migration 0038). No employer will ever press a
"mark as viewed" button, and the applicant's only signal that a human looked
at their application is that status.

## 3. "Applications auto-close when the job expires" means `rejected`

§13.6 asks for the auto-close but `application_status` has no `closed` value.
The sweep sets `rejected` with `status_note = 'İlan süresi doldu.'` — the note
replaces any earlier note (migration 0043), because a candidate seeing "your CV
looks great, can we talk Friday?" attached to a rejection is worse than no note
at all. Every affected applicant is notified, as §13.6 requires of every status
change.

Rejected: adding a `closed` enum value. §7's DDL is the contract, and inventing
an enum value to avoid a note is a schema change made for cosmetic reasons.

## 4. §26's minimum-wage check is deliberately narrow

> "block listings that fail minimum-wage or unpaid-full-time checks in the
> listing country where determinable"

"Where determinable" is doing the work. `checkJobLegality` blocks exactly two
things:

- a full-time, part-time, seasonal or contract job advertised at zero pay;
- a stated wage below the country's own statutory monthly floor.

and stays silent everywhere else: no floor published for the country, no salary
quoted ("Maaş görüşülür"), a currency that would need an FX rate to compare, an
internship or working-student position, or a part-time job quoted per month
(which is below a full-time floor by construction, not by wrongdoing).

`MONTHLY_MIN_WAGE` is configuration with an `asOf` date, not law. A stale table
under-blocks — it lets through what a current one would stop — which is the
safe direction for a rule that refuses to publish someone's job.

## 5. The `professionals` collection indexes public role profiles only

§11.1 names the collection and gives no membership rule. A profile is indexed
when it has at least one `role_profiles` row with `is_public` — that flag is
the user saying "list me as a professional". Buyers who registered to look at
horses are absent, which is what makes the directory a directory.

Two triggers keep it true (migration 0040): `role_profiles` changes re-sync the
person, and a service listing changing status re-syncs their card (the service
count is on it). Without them the directory only reflected the last full
reindex — which was silently wrong rather than visibly broken.

## Divergences worth knowing

**Coverage-radius matching is better on Postgres than on Typesense.** A mobile
farrier covering 80 km should appear for a buyer 60 km from their pin.
`PostgresSearchProvider` expresses that as a second `ST_DWithin` against the
provider's own radius. Typesense's `geo:(lat, lng, r km)` filter cannot compare
against a per-document radius, so the Typesense path matches the pin only, and
`includeRadiusMatches` is inert there. Fixing it properly needs a geo-polygon
per provider written at index time; it is not done, and the difference is
recorded rather than hidden.

**The M4 Typesense collections are unrun.** ADR-0005 already states that the
Typesense adapter has never executed in this environment. The three collections
added here (`services`, `jobs`, `professionals`) inherit that: the schemas and
query builders are written against §11.1 and the client library's documented
API, and the measured behaviour in `scripts/m4-acceptance.sh` is entirely
Postgres's.

## Gaps found while building M4, not fixed here

- **`subscriptions` has no unique constraint on `profile_id`.** §24.10 requires
  Stripe webhooks to be idempotent, and an upsert has nothing to conflict on.
  M5's problem, flagged in `scripts/m4-acceptance.sh` where the test has to
  emulate the upsert by hand.
- **`media_select` hid every avatar.** Fixed in migration 0042 — but it had
  been silently producing directory cards and review lists with no pictures
  since M1, because an unauthorized `LEFT JOIN` yields NULL rather than an
  error. This is the fourth variant of the same failure mode in this codebase;
  the lint rule proposed at the end of M3 (every `db.query` must either call a
  SECURITY DEFINER function or carry an explicit `// system:` comment) would
  have caught it.
