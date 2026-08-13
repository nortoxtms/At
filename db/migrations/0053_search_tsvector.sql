-- 0053 — full-text search vector for §24.16.
--
-- 0052 added trigram indexes and they work, but only for terms of three
-- characters or more: pg_trgm cannot index a pattern it cannot cut into
-- trigrams, so `%at%` still fell back to a sequential scan. "at" is Turkish
-- for "horse". On this site it is not an edge case, it is the first thing
-- anyone types.
--
-- The fix is to stop asking the question as a substring match. A stored
-- tsvector with a GIN index answers "which documents contain a word starting
-- with this" in constant-ish time regardless of term length, and it is also
-- the better answer: `ILIKE '%at%'` matched every listing with "at" buried
-- inside another word, which is noise the user did not ask for.
--
-- The configuration is 'simple' rather than 'turkish' deliberately. The
-- Turkish snowball stemmer would fold "kısrak" and "kısrağı" together, which
-- is desirable, but it also drops its stopword list on a corpus where the
-- listing titles are mostly proper nouns and breed names. 'simple' plus prefix
-- matching (`kısr:*`) gives the behaviour a marketplace search box is expected
-- to have without discarding tokens. Production search is Typesense
-- (ADR-0005); this is the fallback engine, and ADR-0008 records the choice.

ALTER TABLE search_documents
  ADD COLUMN IF NOT EXISTS text_search tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'simple',
      coalesce(document->>'title', '') || ' ' ||
      coalesce(document->>'description', '') || ' ' ||
      coalesce(document->>'horse_name', '') || ' ' ||
      coalesce(document->>'display_name', '') || ' ' ||
      coalesce(document->>'headline', '') || ' ' ||
      coalesce(document->>'organization_name', '') || ' ' ||
      coalesce(document->>'breed', '') || ' ' ||
      coalesce(document->>'region', '') || ' ' ||
      coalesce(document->>'city', '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_search_documents_text_search
  ON search_documents USING gin (text_search);

-- The trigram indexes 0052 added are superseded: nothing queries ILIKE on
-- these fields any more, and an unused GIN index is not free — it is
-- maintained on every write the outbox drains. Dropping them here rather than
-- editing 0052 keeps the migration history append-only.
DROP INDEX IF EXISTS idx_search_documents_listing_title_trgm;
DROP INDEX IF EXISTS idx_search_documents_listing_description_trgm;
DROP INDEX IF EXISTS idx_search_documents_listing_horse_name_trgm;
DROP INDEX IF EXISTS idx_search_documents_service_title_trgm;
DROP INDEX IF EXISTS idx_search_documents_job_title_trgm;
DROP INDEX IF EXISTS idx_search_documents_professional_name_trgm;

ANALYZE search_documents;
