-- ONLY HORSES · 0011 · notifications, devices, audit log, search outbox (§7, §11.4, §17)

CREATE TABLE device_tokens (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token        TEXT NOT NULL UNIQUE,
  platform     TEXT NOT NULL CHECK (platform IN ('ios','android','web')),
  app_version  TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_device_tokens_profile ON device_tokens(profile_id);

CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  data       JSONB NOT NULL DEFAULT '{}',
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_unread ON notifications(profile_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE notification_preferences (
  profile_id        UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  prefs             JSONB NOT NULL DEFAULT '{}',
  quiet_hours_start SMALLINT CHECK (quiet_hours_start BETWEEN 0 AND 23),
  quiet_hours_end   SMALLINT CHECK (quiet_hours_end BETWEEN 0 AND 23),
  timezone          TEXT NOT NULL DEFAULT 'Europe/Istanbul'
);

CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    UUID REFERENCES profiles(id),
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   UUID,
  before      JSONB,
  after       JSONB,
  ip          INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id, created_at DESC);

-- §11.4 outbox: DB triggers append here; a BullMQ worker drains every 2s.
CREATE TABLE search_outbox (
  id           BIGSERIAL PRIMARY KEY,
  collection   TEXT NOT NULL,
  document_id  UUID NOT NULL,
  operation    TEXT NOT NULL CHECK (operation IN ('upsert','delete')),
  attempts     SMALLINT NOT NULL DEFAULT 0,
  last_error   TEXT,
  processed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_search_outbox_pending ON search_outbox(created_at) WHERE processed_at IS NULL;
