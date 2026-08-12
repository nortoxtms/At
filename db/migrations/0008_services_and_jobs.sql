-- ONLY HORSES · 0008 · service listings, job listings, applications (§7)

CREATE TABLE service_listings (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug                CITEXT UNIQUE NOT NULL,
  provider_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider_org_id     UUID REFERENCES organizations(id),
  category            TEXT NOT NULL REFERENCES service_categories(code),
  title               TEXT NOT NULL,
  description         TEXT NOT NULL,
  price_min           NUMERIC(10,2),
  price_max           NUMERIC(10,2),
  price_unit          TEXT CHECK (price_unit IN ('hour','session','day','week','month','job','km')),
  currency            CHAR(3) NOT NULL DEFAULT 'EUR',
  country_code        CHAR(2) NOT NULL,
  region              TEXT,
  city                TEXT,
  location            GEOGRAPHY(POINT, 4326),
  service_radius_km   INTEGER,
  is_mobile           BOOLEAN NOT NULL DEFAULT FALSE,
  availability_note   TEXT,
  status              listing_status NOT NULL DEFAULT 'draft',
  is_boosted          BOOLEAN NOT NULL DEFAULT FALSE,
  boost_expires_at    TIMESTAMPTZ,
  view_count          INTEGER NOT NULL DEFAULT 0,
  inquiry_count       INTEGER NOT NULL DEFAULT 0,
  published_at        TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_services_location ON service_listings USING GIST (location);
CREATE INDEX idx_services_category ON service_listings(category, status);

CREATE TABLE service_media (
  service_id UUID NOT NULL REFERENCES service_listings(id) ON DELETE CASCADE,
  media_id   UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (service_id, media_id)
);

CREATE TABLE job_listings (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug                 CITEXT UNIQUE NOT NULL,
  poster_profile_id    UUID NOT NULL REFERENCES profiles(id),
  organization_id      UUID REFERENCES organizations(id),
  title                TEXT NOT NULL,
  description          TEXT NOT NULL,
  responsibilities     TEXT,
  requirements         TEXT,
  job_type             job_type NOT NULL,
  roles_needed         role_type[] NOT NULL DEFAULT '{}',
  disciplines          TEXT[] NOT NULL DEFAULT '{}',
  country_code         CHAR(2) NOT NULL,
  region               TEXT,
  city                 TEXT,
  location             GEOGRAPHY(POINT, 4326),
  salary_min           NUMERIC(10,2),
  salary_max           NUMERIC(10,2),
  salary_currency      CHAR(3),
  salary_period        TEXT CHECK (salary_period IN ('hour','day','week','month','year')),
  salary_public        BOOLEAN NOT NULL DEFAULT TRUE,
  accommodation        TEXT CHECK (accommodation IN ('none','shared','private','negotiable')),
  meals_included       BOOLEAN NOT NULL DEFAULT FALSE,
  visa_support         BOOLEAN NOT NULL DEFAULT FALSE,
  horse_count          INTEGER,
  experience_years_min SMALLINT,
  languages_required   TEXT[] NOT NULL DEFAULT '{}',
  start_date           DATE,
  application_deadline DATE,
  apply_method         TEXT NOT NULL DEFAULT 'in_app' CHECK (apply_method IN ('in_app','email','external_url')),
  apply_email          CITEXT,
  apply_url            TEXT,
  status               listing_status NOT NULL DEFAULT 'draft',
  is_featured          BOOLEAN NOT NULL DEFAULT FALSE,
  view_count           INTEGER NOT NULL DEFAULT 0,
  application_count    INTEGER NOT NULL DEFAULT 0,
  published_at         TIMESTAMPTZ,
  expires_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jobs_location ON job_listings USING GIST (location);
CREATE INDEX idx_jobs_status ON job_listings(status, published_at DESC);

CREATE TABLE job_applications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id          UUID NOT NULL REFERENCES job_listings(id) ON DELETE CASCADE,
  applicant_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cover_letter    TEXT,
  cv_media_id     UUID REFERENCES media(id),
  video_media_id  UUID REFERENCES media(id),
  answers         JSONB NOT NULL DEFAULT '{}',
  status          application_status NOT NULL DEFAULT 'submitted',
  status_note     TEXT,
  conversation_id UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, applicant_id)
);
CREATE INDEX idx_applications_applicant ON job_applications(applicant_id, status);
