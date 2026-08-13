-- 0052 — trigram indexes for §24.16.
--
-- The Postgres search provider matches free text with
-- `document->>'title' ILIKE '%q%'`. A leading wildcard cannot use a btree
-- index, so every free-text search was a sequential scan of the whole
-- collection. At 500 seeded listings that cost nothing and the M2 acceptance
-- run measured 9–12 ms. At the 50 000 §24.16 actually asks for, one query
-- costs ~57 ms of CPU before facets, and 200 concurrent users turned that into
-- a p95 above twenty seconds — a hundred times the budget.
--
-- pg_trgm indexes make a `%substring%` match selective. The extension is
-- already installed (0001 needs it for slug similarity); these are the indexes
-- that were missing.
--
-- Production search is Typesense (ADR-0005), so this is the fallback engine
-- getting an index it should always have had. It is also what runs in every
-- development and test environment, which is where the number above was
-- measured.

CREATE INDEX IF NOT EXISTS idx_search_documents_listing_title_trgm
  ON search_documents USING gin ((document->>'title') gin_trgm_ops)
  WHERE collection = 'listings';

CREATE INDEX IF NOT EXISTS idx_search_documents_listing_description_trgm
  ON search_documents USING gin ((document->>'description') gin_trgm_ops)
  WHERE collection = 'listings';

CREATE INDEX IF NOT EXISTS idx_search_documents_listing_horse_name_trgm
  ON search_documents USING gin ((document->>'horse_name') gin_trgm_ops)
  WHERE collection = 'listings';

CREATE INDEX IF NOT EXISTS idx_search_documents_service_title_trgm
  ON search_documents USING gin ((document->>'title') gin_trgm_ops)
  WHERE collection = 'services';

CREATE INDEX IF NOT EXISTS idx_search_documents_job_title_trgm
  ON search_documents USING gin ((document->>'title') gin_trgm_ops)
  WHERE collection = 'jobs';

CREATE INDEX IF NOT EXISTS idx_search_documents_professional_name_trgm
  ON search_documents USING gin ((document->>'display_name') gin_trgm_ops)
  WHERE collection = 'professionals';

-- The facet pass groups by these six fields under the same WHERE clause. With
-- the text filter now indexed, the grouping is what remains to be scanned;
-- a covering index on (collection, field) keeps the common unfiltered browse
-- — the first page every visitor sees — off a full heap scan.
CREATE INDEX IF NOT EXISTS idx_search_documents_listing_region
  ON search_documents ((document->>'region'))
  WHERE collection = 'listings';

CREATE INDEX IF NOT EXISTS idx_search_documents_listing_sex
  ON search_documents ((document->>'sex'))
  WHERE collection = 'listings';

CREATE INDEX IF NOT EXISTS idx_search_documents_listing_color
  ON search_documents ((document->>'color'))
  WHERE collection = 'listings';

ANALYZE search_documents;
