# ADR-0008 — How the Postgres search provider matches text

**Status:** accepted · 2026-08-13
**Context:** §4, §11.1, §24.16 · supersedes nothing · relates to ADR-0005

## Context

§4 names Typesense as the search engine and ADR-0005 records the provider seam
that lets a Postgres implementation stand in for it in development and test.
The spec says what the engine must *do* — filters, facets, ranking, the
boosted-per-page cap — and is silent on how the fallback should match free
text. That silence is this decision.

The original implementation matched with `document->>'title' ILIKE '%q%'`.
Against the 500 listings the M2 acceptance run seeded, this measured 9–12 ms
and §24.16 looked comfortably met.

§24.16 asks for 50 000 listings. Building that corpus changed the answer:

| | 500 listings | 50 000 listings |
|---|---|---|
| single query, free text | 9–12 ms | ~500 ms |
| p95 at 200 concurrent | not measured | **> 20 000 ms** |

A leading wildcard cannot use a btree index, so every free-text search was a
sequential scan of the collection — plus six more, one per facet field.

## Decision

**Match a stored `tsvector` with a prefix `tsquery`, under the `simple`
configuration.** Migration 0053 adds the column and its GIN index.

Three sub-decisions, each of which could reasonably have gone another way:

### Prefix terms, ANDed

`kısr` matches `kısrak`, because a search box has to be useful before the word
is finished. Multiple words narrow rather than widen: typing more is a request
for fewer results, not more.

### `simple`, not `turkish`

Postgres ships a Turkish snowball stemmer, and it would correctly fold
`kısrak` and `kısrağı` together. It also applies a stopword list, on a corpus
where listing titles are largely proper nouns, breed names and place names —
the words most likely to be searched are the ones most at risk of being
discarded. Prefix matching recovers most of what stemming would have given
without that risk.

This is worth revisiting with real query logs. It is a one-line change to the
generated column plus a reindex.

### Operators stripped, not escaped

`to_tsquery` has a syntax: `&`, `|`, `!`, `<->`, `:`, parentheses. Someone
typing "at & !pony" is not writing a query language, they are searching for a
string. Passing that through produces a syntax error at best; at worst `!`
inverts the query and returns the opposite of what was asked for. Everything
that is not a letter, digit, space or internal hyphen is removed.

Hyphens survive because Postgres keeps them — `to_tsvector('simple',
'M5-1755070000')` yields `'m5'` and `'-1755070000'`, so a query that split on
the hyphen would fail to match the text it came from.

An input with no usable token matches nothing rather than everything. This
needs saying because the obvious sentinel is wrong: `!!!__no_match__` parses
as a triple negation, which matches every row in the table.

## What this is not

It is not what production does. Typesense provides typo tolerance and
`_text_match` relevance scoring, and neither has an equivalent here. A query
with a typo returns nothing from this provider and results from Typesense.
Anyone reasoning about relevance from a development environment is reasoning
about the wrong engine.

## Facets

Separately from matching: the facet pass issued one aggregate per field, six
round trips, each scanning the matching set. It is now a single query using a
lateral `VALUES` list with `row_number()` for each field's top 30, and it runs
concurrently with the page query rather than after it.

This remains the expensive half of a broad search — counting facets over
40 000 matching rows costs ~150 ms in Postgres no matter how it is written,
because the work is proportional to the result set. Typesense answers it from
its index. Materialising the facet fields as real columns was measured and
gave 150 ms → 109 ms, which did not justify the table rewrite.

## Consequences

- §24.16 measured at **p95 161 ms over 50 000 listings**, inside the 200 ms
  budget. `m2-acceptance.sh` asserts it, so the regression that hid for two
  milestones cannot return silently.
- Substring matching is gone. `ILIKE '%at%'` matched listings with "at" buried
  inside another word; that noise is no longer returned, and a user who
  genuinely wants an infix search has no way to ask for one.
- Migration 0052's trigram indexes are dropped by 0053. They are left in the
  history rather than edited away, because the migrations are append-only and
  because the reason they were insufficient — pg_trgm cannot index a
  two-character pattern, and "at" is Turkish for "horse" — is worth keeping.
- The `text_search` column is `GENERATED ALWAYS AS ... STORED`, so it cannot
  drift from the document. The cost is paid on write, where the outbox worker
  already absorbs it.
