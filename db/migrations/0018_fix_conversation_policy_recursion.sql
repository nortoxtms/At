-- ONLY HORSES · 0018 · break the conversation policy recursion
--
-- `participants_select` (migration 0013) allowed a member to see their
-- co-participants by querying `conversation_participants` from inside the
-- policy *on* `conversation_participants`. Evaluating the policy re-triggers
-- the policy, and Postgres aborts with:
--
--   infinite recursion detected in policy for relation "conversation_participants"
--
-- It surfaced from an unrelated direction: the §3.3 entitlement check counts a
-- profile's conversations, `conversations_select` tests membership through
-- `conversation_participants`, and the whole chain collapsed — so creating a
-- horse failed with a 500.
--
-- The fix is the pattern already used for `is_org_member`: a SECURITY DEFINER
-- helper, which runs as the owner and so is not itself subject to RLS. That
-- ends the recursion without widening what anyone can read.

CREATE OR REPLACE FUNCTION is_conversation_participant(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.profile_id = auth.uid()
  )
$$;

DROP POLICY IF EXISTS participants_select ON conversation_participants;
CREATE POLICY participants_select ON conversation_participants FOR SELECT USING (
  profile_id = auth.uid()
  OR is_conversation_participant(conversation_id)
  OR is_staff()
);

DROP POLICY IF EXISTS conversations_select ON conversations;
CREATE POLICY conversations_select ON conversations FOR SELECT USING (
  is_conversation_participant(id) OR is_staff()
);

-- `inquiries` already keys off buyer_id/seller_id directly, so it never
-- entered the cycle and is left alone.
