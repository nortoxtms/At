-- ── The rest of the equestrian market ─────────────────────────────────────
--
-- Horses, services and jobs cover the people and the animals. They do not
-- cover the objects, and the objects are most of what changes hands: a saddle,
-- a trailer, fifty metres of fencing, a sack of feed, a pair of boots.
--
-- This is a separate table rather than a `listing_type` on `listings`, and
-- that is the load-bearing decision. §1.3 P1 makes a listing a view of a horse
-- record: `listings.horse_id` is NOT NULL, every projection denormalises the
-- horse's breed, sex, age and height, and the whole §8 visibility system hangs
-- off the horse. A rug has no sex and no pedigree. Forcing it through that
-- table means either a fake horse row per rug — poisoning the registry the
-- product is built on — or making `horse_id` nullable, which quietly turns
-- every "a listing has a horse" assumption in the API into a lie.
--
-- So: products are their own thing, with their own categories, their own
-- condition and shipping semantics, and the same lifecycle, RLS shape and
-- search-outbox wiring as the listings that came before.

CREATE TABLE product_categories (
  code         TEXT PRIMARY KEY,
  -- Two levels, no more. A tree deep enough to need breadcrumbs is a tree
  -- people give up navigating on a phone.
  parent_code  TEXT REFERENCES product_categories(code),
  name_en      TEXT NOT NULL,
  name_tr      TEXT NOT NULL,
  icon         TEXT,
  sort_order   SMALLINT NOT NULL DEFAULT 100
);

CREATE INDEX idx_product_categories_parent ON product_categories(parent_code, sort_order);

/**
 * Condition, because a used saddle and a new one are different products at the
 * same price, and "used" alone is not enough information to decide.
 */
CREATE TYPE product_condition AS ENUM (
  'new',
  'like_new',
  'good',
  'used',
  'for_parts'
);

/**
 * How the buyer gets it.
 *
 * A horsebox is collection-only and a bit is posted anywhere; a marketplace
 * that does not say which wastes both sides' time. `shipping` is what the
 * seller offers, not a promise about a carrier.
 */
CREATE TYPE product_delivery AS ENUM (
  'pickup',
  'shipping',
  'both'
);

CREATE TABLE product_listings (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug              CITEXT UNIQUE NOT NULL,
  seller_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  seller_org_id     UUID REFERENCES organizations(id),

  category          TEXT NOT NULL REFERENCES product_categories(code),
  title             TEXT NOT NULL,
  description       TEXT NOT NULL,
  brand             TEXT,
  model             TEXT,
  -- Free text: a saddle is 17.5", a rug is 145 cm, a bit is 125 mm, boots are
  -- size 41. One numeric column cannot hold that, and five columns would be
  -- empty four times out of five.
  size_label        TEXT,
  color             TEXT,
  condition         product_condition NOT NULL DEFAULT 'good',

  price_amount      NUMERIC(10,2),
  price_currency    CHAR(3) NOT NULL DEFAULT 'TRY',
  -- TEXT with a CHECK, matching `listings.price_type` — it is not an enum
  -- there and making it one here would be two vocabularies for one concept.
  price_type        TEXT NOT NULL DEFAULT 'fixed'
                      CHECK (price_type IN ('fixed','negotiable','on_request','auction_reserve','free')),
  -- Feed and bedding are priced per unit and bought by the pallet; a single
  -- number without the unit is how you end up quoting a month's hay as a bale.
  price_unit        TEXT CHECK (price_unit IN ('item','kg','ton','bale','sack','metre','set','pair')),
  quantity          INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),

  delivery          product_delivery NOT NULL DEFAULT 'pickup',
  shipping_note     TEXT,

  country_code      CHAR(2) NOT NULL,
  region            TEXT,
  city              TEXT,
  location          GEOGRAPHY(POINT, 4326),

  status            listing_status NOT NULL DEFAULT 'draft',
  is_boosted        BOOLEAN NOT NULL DEFAULT FALSE,
  boost_expires_at  TIMESTAMPTZ,
  view_count        INTEGER NOT NULL DEFAULT 0,
  save_count        INTEGER NOT NULL DEFAULT 0,
  inquiry_count     INTEGER NOT NULL DEFAULT 0,
  published_at      TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The same generated tsvector the listing search uses (0053). pg_trgm is no
  -- use here for the same reason it was no use there: "at" is two characters
  -- and produces no trigrams, and half of what people search for is a brand.
  text_search       TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(title, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(brand, '') || ' ' ||
      coalesce(model, '') || ' ' ||
      coalesce(size_label, '') || ' ' ||
      coalesce(city, '') || ' ' ||
      coalesce(region, '')
    )
  ) STORED
);

CREATE INDEX idx_products_search   ON product_listings USING GIN (text_search);
CREATE INDEX idx_products_category ON product_listings(category, status);
CREATE INDEX idx_products_location ON product_listings USING GIST (location);
CREATE INDEX idx_products_seller   ON product_listings(seller_profile_id, status);
CREATE INDEX idx_products_active   ON product_listings(published_at DESC) WHERE status = 'active';

CREATE TABLE product_media (
  product_id UUID NOT NULL REFERENCES product_listings(id) ON DELETE CASCADE,
  media_id   UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, media_id)
);

CREATE TRIGGER trg_products_updated_at
BEFORE UPDATE ON product_listings
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────
--
-- Both policies, together, in the migration that creates the table. Five times
-- in this schema a table was given a SELECT policy and a write path that
-- arrived later, and each time the table silently refused the write and the
-- endpoint answered 500. Not a sixth.

ALTER TABLE product_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_media    ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY products_select ON product_listings FOR SELECT USING (
  status = 'active' OR seller_profile_id = auth.uid() OR is_staff()
);

CREATE POLICY products_write ON product_listings FOR ALL
  USING (seller_profile_id = auth.uid())
  WITH CHECK (seller_profile_id = auth.uid());

CREATE POLICY product_media_select ON product_media FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM product_listings p
    WHERE p.id = product_id
      AND (p.status = 'active' OR p.seller_profile_id = auth.uid() OR is_staff())
  )
);

CREATE POLICY product_media_write ON product_media FOR ALL USING (
  EXISTS (
    SELECT 1 FROM product_listings p
    WHERE p.id = product_id AND p.seller_profile_id = auth.uid()
  )
);

-- Reference data: readable by everyone, written by migrations only.
CREATE POLICY product_categories_select ON product_categories FOR SELECT USING (TRUE);

-- ── search sync ───────────────────────────────────────────────────────────
--
-- `enqueue_search_sync` maps a table name to a collection. Adding the trigger
-- without extending that mapping enqueues NULL, which the drain worker skips
-- in silence — a product that never appears in search and no error anywhere.

CREATE OR REPLACE FUNCTION enqueue_search_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row        RECORD;
  v_collection TEXT;
  v_op         TEXT;
  v_listing_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;

  v_collection := CASE TG_TABLE_NAME
    WHEN 'listings'         THEN 'listings'
    WHEN 'service_listings' THEN 'services'
    WHEN 'job_listings'     THEN 'jobs'
    WHEN 'product_listings' THEN 'products'
    WHEN 'profiles'         THEN 'professionals'
    ELSE NULL
  END;

  IF TG_TABLE_NAME = 'horses' THEN
    FOR v_listing_id IN
      SELECT id FROM listings WHERE horse_id = v_row.id
    LOOP
      INSERT INTO search_outbox (collection, document_id, operation)
      VALUES ('listings', v_listing_id, 'upsert');
    END LOOP;
    RETURN NULL;
  END IF;

  IF v_collection IS NULL THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_op := 'delete';
  ELSE
    v_op := 'upsert';
  END IF;

  INSERT INTO search_outbox (collection, document_id, operation)
  VALUES (v_collection, v_row.id, v_op);

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_search_sync_products
AFTER INSERT OR UPDATE OR DELETE ON product_listings
FOR EACH ROW EXECUTE FUNCTION enqueue_search_sync();

-- ── categories ────────────────────────────────────────────────────────────
--
-- "Fence to boot, feed to riding lessons." Eight groups, each with the
-- subcategories a Turkish yard would actually ask for. Turkish first: §1.2
-- makes Türkiye the launch region, and these are the words used there.

INSERT INTO product_categories (code, parent_code, name_en, name_tr, icon, sort_order) VALUES
  ('tack',            NULL, 'Tack & saddlery',      'Koşum ve saraciye',     'ribbon',        10),
  ('rider',           NULL, 'Rider equipment',      'Binici ekipmanı',       'shirt',         20),
  ('horse_care',      NULL, 'Horse care',           'At bakımı',             'medkit',        30),
  ('feed',            NULL, 'Feed & bedding',       'Yem ve altlık',         'nutrition',     40),
  ('stable',          NULL, 'Stable & fencing',     'Ahır ve çit',           'construct',     50),
  ('arena',           NULL, 'Arena & training',     'Manej ve antrenman',    'flag',          60),
  ('transport',       NULL, 'Transport',            'Nakliye ve römork',     'bus',           70),
  ('other_product',   NULL, 'Other',                'Diğer',                 'ellipsis-horizontal', 90),

  ('saddle',          'tack',       'Saddles',              'Eyer',                  NULL, 11),
  ('bridle',          'tack',       'Bridles & reins',      'Başlık ve dizgin',      NULL, 12),
  ('bit',             'tack',       'Bits',                 'Gem',                   NULL, 13),
  ('girth',           'tack',       'Girths & stirrups',    'Kolan ve üzengi',       NULL, 14),
  ('saddle_pad',      'tack',       'Saddle pads',          'Eyer altı',             NULL, 15),
  ('harness',         'tack',       'Driving harness',      'Araba koşumu',          NULL, 16),

  ('helmet',          'rider',      'Helmets',              'Kask',                  NULL, 21),
  ('riding_boots',    'rider',      'Boots',                'Binici çizmesi',        NULL, 22),
  ('breeches',        'rider',      'Breeches & jackets',   'Pantolon ve ceket',     NULL, 23),
  ('body_protector',  'rider',      'Body protectors',      'Koruyucu yelek',        NULL, 24),
  ('gloves_spurs',    'rider',      'Gloves, spurs, whips', 'Eldiven, mahmuz, kamçı', NULL, 25),

  ('horse_boots',     'horse_care', 'Horse boots & bandages', 'At tozluğu ve bandaj', NULL, 31),
  ('rugs',            'horse_care', 'Rugs & blankets',      'Battaniye ve çul',      NULL, 32),
  ('grooming',        'horse_care', 'Grooming',             'Tımar malzemeleri',     NULL, 33),
  ('supplements',     'horse_care', 'Supplements',          'Takviye ve vitamin',    NULL, 34),
  ('farrier_tools',   'horse_care', 'Farrier & hoof care',  'Nal ve tırnak bakımı',  NULL, 35),

  ('hay',             'feed',       'Hay & forage',         'Kuru ot ve yonca',      NULL, 41),
  ('grain',           'feed',       'Grain & concentrate',  'Yem ve kesif yem',      NULL, 42),
  ('bedding',         'feed',       'Bedding',              'Altlık ve talaş',       NULL, 43),

  ('fencing',         'stable',     'Fencing',              'Çit ve tel',            NULL, 51),
  ('stalls',          'stable',     'Stalls & panels',      'Boks ve panel',         NULL, 52),
  ('waterer',         'stable',     'Waterers & feeders',   'Suluk ve yemlik',       NULL, 53),
  ('barn_equipment',  'stable',     'Barn equipment',       'Ahır ekipmanı',         NULL, 54),

  ('jumps',           'arena',      'Jumps & poles',        'Engel ve sırık',        NULL, 61),
  ('footing',         'arena',      'Footing & maintenance', 'Zemin ve bakım',       NULL, 62),
  ('lunging',         'arena',      'Lunging equipment',    'Longe ekipmanı',        NULL, 63),

  ('trailer',         'transport',  'Trailers & horseboxes', 'Römork ve at kamyonu', NULL, 71),
  ('transport_gear',  'transport',  'Transport equipment',  'Nakliye ekipmanı',      NULL, 72);
