-- ONLY HORSES · 0007 · listings (§7, §13.1)

CREATE TABLE listings (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug               CITEXT UNIQUE NOT NULL,
  horse_id           UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  seller_profile_id  UUID NOT NULL REFERENCES profiles(id),
  seller_org_id      UUID REFERENCES organizations(id),
  type               listing_type NOT NULL,
  status             listing_status NOT NULL DEFAULT 'draft',
  title              TEXT NOT NULL,
  summary            TEXT,
  description        TEXT,
  price_amount       NUMERIC(12,2),
  price_currency     CHAR(3) NOT NULL DEFAULT 'EUR',
  price_type         TEXT NOT NULL DEFAULT 'fixed'
                     CHECK (price_type IN ('fixed','negotiable','on_request','auction_reserve','free')),
  price_period       TEXT CHECK (price_period IN ('month','season','year')),
  vat_included       BOOLEAN,
  trial_allowed      BOOLEAN NOT NULL DEFAULT TRUE,
  ppe_welcome        BOOLEAN NOT NULL DEFAULT TRUE,
  transport_help     BOOLEAN NOT NULL DEFAULT FALSE,
  suitable_for       TEXT[] NOT NULL DEFAULT '{}',
  country_code       CHAR(2) NOT NULL,
  region             TEXT,
  city               TEXT,
  location           GEOGRAPHY(POINT, 4326),
  view_count         INTEGER NOT NULL DEFAULT 0,
  save_count         INTEGER NOT NULL DEFAULT 0,
  inquiry_count      INTEGER NOT NULL DEFAULT 0,
  quality_score      SMALLINT NOT NULL DEFAULT 0,
  is_boosted         BOOLEAN NOT NULL DEFAULT FALSE,
  boost_expires_at   TIMESTAMPTZ,
  published_at       TIMESTAMPTZ,
  expires_at         TIMESTAMPTZ,
  -- §13.1: under_offer auto-reverts to active after 14 days of no change.
  under_offer_since  TIMESTAMPTZ,
  closed_at          TIMESTAMPTZ,
  closed_reason      TEXT CHECK (closed_reason IN ('sold_on_platform','sold_elsewhere','not_selling','other')),
  sold_to_profile_id UUID REFERENCES profiles(id),
  rejection_reason   TEXT,
  legal_hold         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_listings_status_pub ON listings(status, published_at DESC);
CREATE INDEX idx_listings_horse ON listings(horse_id);
CREATE INDEX idx_listings_seller ON listings(seller_profile_id, status);
CREATE INDEX idx_listings_location ON listings USING GIST (location);
CREATE UNIQUE INDEX uq_one_active_listing_per_horse
  ON listings(horse_id) WHERE status IN ('active','pending_review','under_offer');

ALTER TABLE horse_ownership_history
  ADD CONSTRAINT ownership_transfer_listing_fk
  FOREIGN KEY (transfer_listing_id) REFERENCES listings(id) ON DELETE SET NULL;

CREATE TABLE listing_price_history (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  old_amount NUMERIC(12,2),
  new_amount NUMERIC(12,2),
  currency   CHAR(3),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_price_history_listing ON listing_price_history(listing_id, changed_at DESC);
