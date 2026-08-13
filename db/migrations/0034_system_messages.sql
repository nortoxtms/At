-- ONLY HORSES · 0034 · system messages have no sender
--
-- `messages_insert` requires `sender_id = auth.uid()`, which no system message
-- can satisfy: §15.1 renders them as centred chips precisely because nobody
-- said them. With sender_id NULL and auth.uid() NULL the check evaluates to
-- NULL, not true, so the pinned context card — the first thing every thread
-- shows — could never be written.
--
-- Widening the policy to allow `sender_id IS NULL` would let any participant
-- forge a system message, and "Ayşe sağlık dosyasını paylaştı" is exactly the
-- kind of statement worth forging. So system messages get their own narrow
-- path instead.

CREATE OR REPLACE FUNCTION post_system_message(
  p_conversation_id UUID,
  p_body TEXT,
  p_attachment JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO conversation_messages (conversation_id, sender_id, body, attachment, is_system)
  VALUES (p_conversation_id, NULL, p_body, p_attachment, TRUE)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION post_system_message(UUID, TEXT, JSONB) TO only_horses_app;
