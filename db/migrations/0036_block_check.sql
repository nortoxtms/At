-- ONLY HORSES · 0036 · the block check has to see both directions
--
-- §24.13 requires that blocking prevents new conversations. The check must
-- therefore ask "is either of these two blocking the other?" — and no user can
-- answer that for themselves: `blocks_select` shows you only the blocks you
-- made, which is right. Being able to enumerate who has blocked you is itself
-- a harassment vector.
--
-- So the API asked the question anonymously, got zero rows, and concluded
-- nobody was blocked. A blocked user could open a fresh conversation with the
-- person who blocked them.
--
-- The function returns a bare boolean: enough to refuse the message, and not
-- enough to reveal who blocked whom.

CREATE OR REPLACE FUNCTION is_blocked_between(p_a UUID, p_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM blocks
    WHERE (blocker_id = p_a AND blocked_id = p_b)
       OR (blocker_id = p_b AND blocked_id = p_a)
  )
$$;

GRANT EXECUTE ON FUNCTION is_blocked_between(UUID, UUID) TO only_horses_app;
