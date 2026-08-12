-- ONLY HORSES · 0004 · profiles, role profiles, credentials, organizations (§7)

CREATE TABLE profiles (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle              CITEXT UNIQUE NOT NULL,
  display_name        TEXT NOT NULL,
  avatar_media_id     UUID,
  bio                 TEXT,
  country_code        CHAR(2),
  region              TEXT,
  city                TEXT,
  location            GEOGRAPHY(POINT, 4326),
  location_precision  TEXT DEFAULT 'city' CHECK (location_precision IN ('exact','city','region')),
  phone_e164          TEXT,
  phone_public        BOOLEAN NOT NULL DEFAULT FALSE,
  email_public        BOOLEAN NOT NULL DEFAULT FALSE,
  languages           TEXT[] NOT NULL DEFAULT '{}',
  verification_level  verification_level NOT NULL DEFAULT 'none',
  trust_score         SMALLINT NOT NULL DEFAULT 0,
  response_rate       NUMERIC(4,3),
  response_time_mins  INTEGER,
  is_moderator        BOOLEAN NOT NULL DEFAULT FALSE,
  is_admin            BOOLEAN NOT NULL DEFAULT FALSE,
  is_suspended        BOOLEAN NOT NULL DEFAULT FALSE,
  suspended_reason    TEXT,
  onboarding_step     TEXT,
  locale              TEXT NOT NULL DEFAULT 'tr',
  preferred_currency  CHAR(3) NOT NULL DEFAULT 'EUR',
  preferred_units     TEXT NOT NULL DEFAULT 'metric' CHECK (preferred_units IN ('metric','imperial')),
  -- §26: 18+ to publish, 16+ to register.
  date_of_birth       DATE,
  legal_hold          BOOLEAN NOT NULL DEFAULT FALSE,
  last_active_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);
CREATE INDEX idx_profiles_location ON profiles USING GIST (location);
CREATE INDEX idx_profiles_name_trgm ON profiles USING GIN (display_name gin_trgm_ops);

CREATE TABLE role_profiles (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role              role_type NOT NULL,
  headline          TEXT,
  about             TEXT,
  years_experience  SMALLINT CHECK (years_experience BETWEEN 0 AND 80),
  specialties       TEXT[] NOT NULL DEFAULT '{}',
  disciplines       TEXT[] NOT NULL DEFAULT '{}',
  service_radius_km INTEGER,
  travels           BOOLEAN NOT NULL DEFAULT FALSE,
  hourly_rate_min   NUMERIC(10,2),
  hourly_rate_max   NUMERIC(10,2),
  currency          CHAR(3),
  is_primary        BOOLEAN NOT NULL DEFAULT FALSE,
  is_public         BOOLEAN NOT NULL DEFAULT TRUE,
  verified_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, role)
);
CREATE INDEX idx_role_profiles_profile ON role_profiles(profile_id);

CREATE TABLE credentials (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_profile_id   UUID NOT NULL REFERENCES role_profiles(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  issuer            TEXT,
  issued_on         DATE,
  expires_on        DATE,
  document_media_id UUID,
  verified_at       TIMESTAMPTZ,
  verified_by       UUID REFERENCES profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE organizations (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug               CITEXT UNIQUE NOT NULL,
  name               TEXT NOT NULL,
  type               org_type NOT NULL,
  about              TEXT,
  logo_media_id      UUID,
  cover_media_id     UUID,
  country_code       CHAR(2),
  region             TEXT,
  city               TEXT,
  address_line       TEXT,
  location           GEOGRAPHY(POINT, 4326),
  website            TEXT,
  phone_e164         TEXT,
  email              CITEXT,
  facilities         TEXT[] NOT NULL DEFAULT '{}',
  disciplines        TEXT[] NOT NULL DEFAULT '{}',
  stall_count        INTEGER,
  tax_id             TEXT,
  verification_level verification_level NOT NULL DEFAULT 'none',
  trust_score        SMALLINT NOT NULL DEFAULT 0,
  created_by         UUID NOT NULL REFERENCES profiles(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ
);
CREATE INDEX idx_org_location ON organizations USING GIST (location);

CREATE TABLE organization_members (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role            org_member_role NOT NULL DEFAULT 'staff',
  title           TEXT,
  invited_at      TIMESTAMPTZ,
  accepted_at     TIMESTAMPTZ,
  PRIMARY KEY (organization_id, profile_id)
);
CREATE INDEX idx_org_members_profile ON organization_members(profile_id);
