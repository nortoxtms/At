# ADR-0005 — A search provider seam, with Typesense as production

**Status:** accepted · 2026-08-12
**Relates to:** spec §4 (Search: Typesense 27.x), §11

## Context

§4 fixes search on Typesense and §11 specifies the collections, the ranking and
the outbox sync in detail. Typesense is the right engine for this product:
faceted filtering over a wide schema, geo search, typo tolerance in Turkish,
and a boost field the ranking can key on.

It could not be installed in the environment this was built in. The agent
proxy allows package registries only, so `dl.typesense.org` is unreachable and
no server binary is published to npm. Building the Typesense adapter blind —
writing the query builder, the collection schema and the outbox worker with no
way to run any of them — would have produced code that compiles and has never
answered a question.

## Decision

Introduce a `SearchProvider` interface with two implementations:

- **`TypesenseSearchProvider`** — production, selected whenever
  `TYPESENSE_HOST` and `TYPESENSE_API_KEY` are set. The collection schema is
  §11.1 field for field and the sort is §11.2's `_text_match:desc,
  boost_rank:desc, quality_score:desc, published_at:desc`.
- **`PostgresSearchProvider`** — reads the same documents from a
  `search_documents` table, so the §11.4 outbox pipeline, the §18.2 S07
  filters, the §11.2 ranking and the boosted-per-page cap all run and are
  tested end to end without an engine.

This is the fourth use of a pattern already established for identity (ADR-0001),
object storage and push: the vendor is behind a seam, and the seam carries a
local implementation so the feature is exercisable.

## Consequences

**Unlike storage and identity, the fallback is not refused in production.**
Without a bucket, uploads would vanish on the next Cloud Run deploy; without
Firebase, passwords would silently live in Postgres. Both are correctness
failures and the API refuses to start. Losing Typesense is a *quality* failure:
no typo tolerance, no `_text_match` relevance, weaker Turkish stemming. Worse
search is a better outcome than no site, so the Postgres provider is allowed to
serve if Typesense is unreachable.

**The Typesense adapter is written but unrun.** That is stated plainly rather
than implied: the M2 acceptance numbers — 500 listings, 21 filter
combinations, p95 of 9 ms — were measured against Postgres. They say the
pipeline and the query semantics are right; they say nothing about Typesense's
performance, which will differ in both directions (faster text matching, a
network hop). Standing up a Typesense instance and re-running
`scripts/m2-acceptance.sh` against it is a prerequisite for M6, and §24.16's
50k-listing target has not been measured on either provider.

**Two providers can drift.** The mitigation is that they consume an identical
document: `SearchIndexerService` builds one `ListingDocument` and hands it to
whichever provider is configured, so a projection change cannot reach one and
miss the other. Query semantics are the exposed surface, and
`scripts/m2-acceptance.sh` is written to run against either — pointing it at a
Typesense-backed API is how the two are held to the same behaviour.
