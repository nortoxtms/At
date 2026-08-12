-- ONLY HORSES · 0006 · horses — the permanent record (§2, §7)

CREATE TABLE horses (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug                  CITEXT UNIQUE NOT NULL,
  name                  TEXT NOT NULL,
  stable_name           TEXT,
  microchip_number      TEXT UNIQUE,
  ueln                  TEXT UNIQUE,
  passport_number       TEXT,
  passport_issuer       TEXT,
  registry_name         TEXT,
  registry_number       TEXT,
  date_of_birth         DATE,
  birth_year_estimated  BOOLEAN NOT NULL DEFAULT FALSE,
  sex                   horse_sex NOT NULL,
  breed_id              TEXT REFERENCES breeds(code),
  breed_secondary_id    TEXT REFERENCES breeds(code),
  color                 TEXT,
  markings              TEXT,
  height_cm             NUMERIC(5,1) CHECK (height_cm BETWEEN 50 AND 220),
  weight_kg             NUMERIC(6,1),
  country_of_birth      CHAR(2),
  current_country       CHAR(2),
  current_region        TEXT,
  current_city          TEXT,
  location              GEOGRAPHY(POINT, 4326),
  location_precision    TEXT NOT NULL DEFAULT 'city'
                        CHECK (location_precision IN ('exact','city','region')),
  stabled_at_org_id     UUID REFERENCES organizations(id),
  owner_profile_id      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  owner_org_id          UUID REFERENCES organizations(id) ON DELETE SET NULL,
  disciplines           TEXT[] NOT NULL DEFAULT '{}',
  training_level        TEXT,
  temperament_score     SMALLINT CHECK (temperament_score BETWEEN 1 AND 10),
  rider_level_min       TEXT,
  about                 TEXT,
  training_notes        TEXT,
  temperament_notes     TEXT,
  health_summary        TEXT,
  is_broodmare          BOOLEAN NOT NULL DEFAULT FALSE,
  is_breeding_stallion  BOOLEAN NOT NULL DEFAULT FALSE,
  sire_horse_id         UUID REFERENCES horses(id),
  dam_horse_id          UUID REFERENCES horses(id),
  sire_name_text        TEXT,
  dam_name_text         TEXT,
  status                horse_status NOT NULL DEFAULT 'active',
  cover_media_id        UUID REFERENCES media(id),
  visibility_health     field_visibility NOT NULL DEFAULT 'on_request',
  visibility_pedigree   field_visibility NOT NULL DEFAULT 'public',
  visibility_documents  field_visibility NOT NULL DEFAULT 'on_request',
  visibility_location   field_visibility NOT NULL DEFAULT 'public',
  ownership_verified_at TIMESTAMPTZ,
  legal_hold            BOOLEAN NOT NULL DEFAULT FALSE,
  created_by            UUID NOT NULL REFERENCES profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ,
  CONSTRAINT horse_owner_present CHECK (owner_profile_id IS NOT NULL OR owner_org_id IS NOT NULL)
);
CREATE INDEX idx_horses_owner ON horses(owner_profile_id);
CREATE INDEX idx_horses_location ON horses USING GIST (location);
CREATE INDEX idx_horses_breed ON horses(breed_id);
CREATE INDEX idx_horses_name_trgm ON horses USING GIN (name gin_trgm_ops);

CREATE TABLE horse_media (
  horse_id   UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  media_id   UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  category   TEXT NOT NULL DEFAULT 'general'
             CHECK (category IN ('general','conformation','under_saddle','walk','trot','canter','jumping','free_movement','xray','document')),
  sort_order SMALLINT NOT NULL DEFAULT 0,
  visibility field_visibility NOT NULL DEFAULT 'public',
  PRIMARY KEY (horse_id, media_id)
);

CREATE TABLE horse_health_records (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  horse_id       UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  type           health_record_type NOT NULL,
  title          TEXT NOT NULL,
  notes          TEXT,
  performed_on   DATE NOT NULL,
  next_due_on    DATE,
  performed_by_profile_id UUID REFERENCES profiles(id),
  performed_by_name TEXT,
  clinic_name    TEXT,
  cost_amount    NUMERIC(10,2),
  cost_currency  CHAR(3),
  document_media_ids UUID[] NOT NULL DEFAULT '{}',
  is_sensitive   BOOLEAN NOT NULL DEFAULT FALSE,
  created_by     UUID NOT NULL REFERENCES profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_health_horse_date ON horse_health_records(horse_id, performed_on DESC);
CREATE INDEX idx_health_due ON horse_health_records(next_due_on) WHERE next_due_on IS NOT NULL;

CREATE TABLE horse_ownership_history (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  horse_id            UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  owner_profile_id    UUID REFERENCES profiles(id),
  owner_org_id        UUID REFERENCES organizations(id),
  -- §24.14: retained after account deletion so provenance survives.
  owner_name_text     TEXT,
  from_date           DATE NOT NULL,
  to_date             DATE,
  transfer_listing_id UUID,
  transfer_price      NUMERIC(12,2),
  transfer_currency   CHAR(3),
  price_public        BOOLEAN NOT NULL DEFAULT FALSE,
  verified            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ownership_horse ON horse_ownership_history(horse_id, from_date DESC);

CREATE TABLE horse_competition_results (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  horse_id         UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  event_name       TEXT NOT NULL,
  discipline       TEXT,
  class_name       TEXT,
  level            TEXT,
  event_date       DATE NOT NULL,
  -- PLACING is a reserved word in Postgres, so this identifier must stay
  -- quoted in raw SQL. Prisma and the query builder quote automatically.
  "placing"        SMALLINT,
  score            NUMERIC(6,2),
  rider_profile_id UUID REFERENCES profiles(id),
  rider_name_text  TEXT,
  location         TEXT,
  proof_media_id   UUID REFERENCES media(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_competitions_horse ON horse_competition_results(horse_id, event_date DESC);

CREATE TABLE horse_access_grants (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  horse_id     UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  grantee_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scope        TEXT[] NOT NULL DEFAULT '{health}',
  status       grant_status NOT NULL DEFAULT 'requested',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at   TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  message      TEXT,
  UNIQUE (horse_id, grantee_id)
);
CREATE INDEX idx_grants_grantee ON horse_access_grants(grantee_id, status);
