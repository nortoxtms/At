-- ONLY HORSES · 0032 · message bodies for the local messaging provider
--
-- §7 says "message bodies live in Stream" and the schema keeps only
-- conversation metadata. That is right for production, and it leaves the
-- messaging flow — inquiries, first-reply timing, the §13.4 review
-- eligibility rule, §14.2's off-platform payment scanner — untestable
-- without a Stream account.
--
-- This table backs LocalMessagingProvider. It is also the shape a self-hosted
-- implementation would use, which §15.2 requires to remain possible.

CREATE TABLE IF NOT EXISTS conversation_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  -- NULL for system messages (§15.1 renders those as centred chips), and left
  -- behind when an author deletes their account (§24.14).
  sender_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  body            TEXT NOT NULL,
  attachment      JSONB,
  is_system       BOOLEAN NOT NULL DEFAULT FALSE,
  -- §14.2 offsite_payment_language: the thread is flagged and the buyer sees
  -- an inline warning. Recorded per message so a moderator can see which one.
  payment_warning BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON conversation_messages(conversation_id, created_at);

ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

-- Only participants read a thread. Reuses the helper from migration 0018 so
-- this policy cannot re-introduce the recursion that one fixed.
CREATE POLICY messages_select ON conversation_messages FOR SELECT USING (
  is_conversation_participant(conversation_id) OR is_staff()
);

CREATE POLICY messages_insert ON conversation_messages FOR INSERT WITH CHECK (
  sender_id = auth.uid() AND is_conversation_participant(conversation_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON conversation_messages TO only_horses_app;
