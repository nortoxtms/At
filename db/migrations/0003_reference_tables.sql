-- ONLY HORSES · 0003 · reference tables (spec §7 "REFERENCE TABLES", §9)
--
-- Ordering note: §7 lists these tables last, but `horses.breed_id` and
-- `service_listings.category` reference them, so they must exist first.
-- See ADR-0003.

CREATE TABLE breeds (
  code        TEXT PRIMARY KEY,
  name_en     TEXT NOT NULL,
  name_tr     TEXT,
  name_es     TEXT,
  name_de     TEXT,
  origin      CHAR(2),
  group_code  TEXT,
  typical_height_min_cm SMALLINT,
  typical_height_max_cm SMALLINT,
  sort_order  SMALLINT NOT NULL DEFAULT 100
);

CREATE TABLE disciplines (
  code       TEXT PRIMARY KEY,
  name_en    TEXT NOT NULL,
  name_tr    TEXT,
  name_es    TEXT,
  name_de    TEXT,
  sort_order SMALLINT NOT NULL DEFAULT 100
);

CREATE TABLE service_categories (
  code       TEXT PRIMARY KEY,
  name_en    TEXT NOT NULL,
  name_tr    TEXT,
  name_es    TEXT,
  name_de    TEXT,
  icon       TEXT,
  sort_order SMALLINT NOT NULL DEFAULT 100
);

-- §11.3 price normalization: listings are filtered on price_eur, refreshed
-- daily from ECB rates. Referenced by §11.3 but absent from the §7 DDL.
CREATE TABLE fx_rates (
  currency    CHAR(3) PRIMARY KEY,
  rate_to_eur NUMERIC(18,8) NOT NULL CHECK (rate_to_eur > 0),
  source      TEXT NOT NULL DEFAULT 'ECB',
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO fx_rates (currency, rate_to_eur) VALUES
  ('EUR', 1),
  ('TRY', 0.0270),
  ('USD', 0.9200),
  ('GBP', 1.1800)
ON CONFLICT (currency) DO NOTHING;
