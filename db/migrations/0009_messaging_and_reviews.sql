-- ONLY HORSES · 0009 · conversations, inquiries, reviews (§7, §13.4, §15)

CREATE TABLE conversations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stream_channel_id TEXT UNIQUE NOT NULL,
  context_type      TEXT CHECK (context_type IN ('listing','service','job','horse','direct')),
  context_id        UUID,
  created_by        UUID NOT NULL REFERENCES profiles(id),
  last_message_at   TIMESTAMPTZ,
  is_archived       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_conversations_context ON conversations(context_type, context_id);

CREATE TABLE conversation_participants (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'member',
  muted           BOOLEAN NOT NULL DEFAULT FALSE,
  blocked         BOOLEAN NOT NULL DEFAULT FALSE,
  last_read_at    TIMESTAMPTZ,
  -- §13.4 eligibility: reviews need >=2 messages from each side. Counting in
  -- Stream on every read is too slow, so the API mirrors the count here.
  message_count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (conversation_id, profile_id)
);
CREATE INDEX idx_participants_profile ON conversation_participants(profile_id);

ALTER TABLE job_applications
  ADD CONSTRAINT job_applications_conversation_fk
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;

CREATE TABLE inquiries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  listing_id      UUID REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id        UUID NOT NULL REFERENCES profiles(id),
  seller_id       UUID NOT NULL REFERENCES profiles(id),
  first_reply_at  TIMESTAMPTZ,
  is_qualified    BOOLEAN NOT NULL DEFAULT FALSE,
  outcome         TEXT CHECK (outcome IN ('no_reply','in_progress','viewing','ppe','purchased','declined','lost')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- §13.5 response_rate is computed over the last 90 days of first inquiries.
CREATE INDEX idx_inquiries_seller_created ON inquiries(seller_id, created_at DESC);
CREATE INDEX idx_inquiries_listing ON inquiries(listing_id);

CREATE TABLE reviews (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id              UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_type           review_subject_type NOT NULL,
  subject_profile_id     UUID REFERENCES profiles(id) ON DELETE CASCADE,
  subject_org_id         UUID REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id        UUID REFERENCES conversations(id),
  rating                 SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  rating_communication   SMALLINT CHECK (rating_communication BETWEEN 1 AND 5),
  rating_accuracy        SMALLINT CHECK (rating_accuracy BETWEEN 1 AND 5),
  rating_professionalism SMALLINT CHECK (rating_professionalism BETWEEN 1 AND 5),
  body                   TEXT,
  response_body          TEXT,
  response_at            TIMESTAMPTZ,
  is_verified_contact    BOOLEAN NOT NULL DEFAULT FALSE,
  is_hidden              BOOLEAN NOT NULL DEFAULT FALSE,
  -- §13.4: moderators must log a reason when hiding.
  hidden_reason          TEXT,
  hidden_by              UUID REFERENCES profiles(id),
  -- §24.14: reviews are anonymized, not deleted, when an author leaves.
  author_name_snapshot   TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT one_subject CHECK (num_nonnulls(subject_profile_id, subject_org_id) = 1)
);
CREATE UNIQUE INDEX uq_review_per_conversation ON reviews(author_id, conversation_id)
  WHERE conversation_id IS NOT NULL;
CREATE INDEX idx_reviews_subject_profile ON reviews(subject_profile_id) WHERE is_hidden = FALSE;

CREATE TABLE blocks (
  blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT no_self_block CHECK (blocker_id <> blocked_id)
);
CREATE INDEX idx_blocks_blocked ON blocks(blocked_id);
