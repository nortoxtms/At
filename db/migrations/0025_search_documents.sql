-- ONLY HORSES · 0025 · search document store
--
-- Backing table for the Postgres search provider (ADR-0005). Typesense is the
-- production engine (§4); this table lets the §11.4 outbox pipeline, the
-- §18.2 S07 filters and the §11.2 ranking run end to end in development and
-- under Testcontainers, where no Typesense instance exists.
--
-- The document column holds exactly the §11.1 schema, so the two providers
-- index the same shape and a query can be compared across both.

CREATE TABLE IF NOT EXISTS search_documents (
  collection  TEXT NOT NULL,
  document_id UUID NOT NULL,
  document    JSONB NOT NULL,
  -- Denormalized out of the document so PostGIS can index it; §18.2 S07's
  -- radius slider goes to 500 km and a JSONB scan would not hold p95.
  geo         GEOGRAPHY(POINT, 4326),
  indexed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection, document_id)
);

CREATE INDEX IF NOT EXISTS idx_search_documents_geo
  ON search_documents USING GIST (geo);

-- The filter sheet keys off a handful of scalars on every query; expression
-- indexes on those keep the §24.16 p95 within reach as the corpus grows.
CREATE INDEX IF NOT EXISTS idx_search_documents_type
  ON search_documents ((document->>'listing_type')) WHERE collection = 'listings';
CREATE INDEX IF NOT EXISTS idx_search_documents_breed
  ON search_documents ((document->>'breed')) WHERE collection = 'listings';
CREATE INDEX IF NOT EXISTS idx_search_documents_country
  ON search_documents ((document->>'country_code')) WHERE collection = 'listings';
CREATE INDEX IF NOT EXISTS idx_search_documents_price
  ON search_documents (((document->>'price_eur')::float)) WHERE collection = 'listings';
CREATE INDEX IF NOT EXISTS idx_search_documents_rank
  ON search_documents (
    ((document->>'boost_rank')::int) DESC,
    ((document->>'quality_score')::int) DESC,
    ((document->>'published_at')::bigint) DESC
  ) WHERE collection = 'listings';

-- Deliberately NOT under RLS.
--
-- Every field in a search document is already public: the index only ever
-- describes listings in a publicly visible status, and the projection drops
-- everything §2 marks private — no health records, no microchip, no exact
-- location. Access is controlled by GRANT, and the API is the only role that
-- holds one.
--
-- Putting RLS on it would also be self-defeating: a search runs before any
-- listing is known, so there is no row-level subject to scope it to, and a
-- policy keyed on auth.uid() would simply return nothing to guests — who are
-- exactly the audience §1.3 P6 wants the web to reach.
GRANT SELECT, INSERT, UPDATE, DELETE ON search_documents TO only_horses_app;
