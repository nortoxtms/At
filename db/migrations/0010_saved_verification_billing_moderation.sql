-- ONLY HORSES · 0010 · saved items, verification, billing, moderation (§7, §14, §16)

CREATE TABLE saved_items (
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  item_type  TEXT NOT NULL CHECK (item_type IN ('listing','service','job','profile','organization','horse')),
  item_id    UUID NOT NULL,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, item_type, item_id)
);

CREATE TABLE saved_searches (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id               UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name                     TEXT NOT NULL,
  entity                   TEXT NOT NULL CHECK (entity IN ('listings','services','jobs')),
  query                    JSONB NOT NULL,
  alert_channel            notification_channel[] NOT NULL DEFAULT '{push}',
  alert_frequency          TEXT NOT NULL DEFAULT 'instant' CHECK (alert_frequency IN ('instant','daily','weekly','off')),
  last_run_at              TIMESTAMPTZ,
  last_seen_max_created_at TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_saved_searches_freq ON saved_searches(alert_frequency, last_run_at);

CREATE TABLE verifications (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  kind               TEXT NOT NULL CHECK (kind IN ('email','phone','identity','professional','business','horse_ownership')),
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
  provider           TEXT,
  provider_ref       TEXT,
  evidence_media_ids UUID[] NOT NULL DEFAULT '{}',
  horse_id           UUID REFERENCES horses(id),
  reviewer_id        UUID REFERENCES profiles(id),
  reviewer_note      TEXT,
  submitted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at         TIMESTAMPTZ,
  expires_at         TIMESTAMPTZ
);
CREATE INDEX idx_verifications_queue ON verifications(status, submitted_at);
CREATE INDEX idx_verifications_profile ON verifications(profile_id, kind);

CREATE TABLE subscriptions (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id             UUID REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id        UUID REFERENCES organizations(id) ON DELETE CASCADE,
  tier                   subscription_tier NOT NULL DEFAULT 'free',
  status                 subscription_status NOT NULL DEFAULT 'active',
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT UNIQUE,
  current_period_end     TIMESTAMPTZ,
  cancel_at_period_end   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT one_sub_owner CHECK (num_nonnulls(profile_id, organization_id) = 1)
);
CREATE INDEX idx_subscriptions_profile ON subscriptions(profile_id);

CREATE TABLE purchases (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id            UUID NOT NULL REFERENCES profiles(id),
  product               TEXT NOT NULL CHECK (product IN ('boost_7d','boost_30d','job_post','featured_profile_30d')),
  target_type           TEXT CHECK (target_type IN ('listing','service','job','profile')),
  target_id             UUID,
  amount                NUMERIC(10,2) NOT NULL,
  currency              CHAR(3) NOT NULL,
  stripe_session_id     TEXT UNIQUE,
  stripe_payment_intent TEXT,
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded')),
  applied_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- §16.2 idempotency: every webhook handler upserts here before processing.
CREATE TABLE stripe_events (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  payload      JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  error        TEXT,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reports (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  target_type        TEXT NOT NULL CHECK (target_type IN ('listing','service','job','profile','organization','message','horse','review')),
  target_id          UUID NOT NULL,
  reason             TEXT NOT NULL CHECK (reason IN ('scam','stolen_photos','misrepresentation','welfare','prohibited_content','spam','harassment','duplicate','wrong_category','other')),
  details            TEXT,
  evidence_media_ids UUID[] NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- §14.2 repeat_reports_same_target: >=3 reports on one target in 7 days.
CREATE INDEX idx_reports_target_created ON reports(target_type, target_id, created_at DESC);

CREATE TABLE moderation_cases (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_type  TEXT NOT NULL,
  target_id    UUID NOT NULL,
  status       moderation_status NOT NULL DEFAULT 'open',
  severity     SMALLINT NOT NULL DEFAULT 1 CHECK (severity BETWEEN 1 AND 5),
  signals      JSONB NOT NULL DEFAULT '{}',
  report_ids   UUID[] NOT NULL DEFAULT '{}',
  assigned_to  UUID REFERENCES profiles(id),
  action_taken TEXT,
  -- §13.3 trust penalty applies only to upheld actions.
  is_upheld    BOOLEAN,
  subject_profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_moderation_queue ON moderation_cases(status, severity DESC, created_at);
CREATE INDEX idx_moderation_target ON moderation_cases(target_type, target_id);
CREATE INDEX idx_moderation_subject ON moderation_cases(subject_profile_id) WHERE is_upheld = TRUE;
