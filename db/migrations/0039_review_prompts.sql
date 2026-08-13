-- ONLY HORSES · 0039 · §17 `review.prompt`
--
-- "review.prompt — 48 h after listing closed — push."
--
-- Who to prompt is not a separate rule: it is §13.4's eligibility rule read
-- forwards. Someone may be prompted exactly when they *could* write a review —
-- a two-sided conversation, inside the window, nothing written yet. Asking
-- anyone else produces a push that leads to a form that refuses them.
--
-- SECURITY DEFINER because the sweep spans every tenant and has no user
-- behind it; it returns only the pairs to notify.

CREATE OR REPLACE FUNCTION list_review_prompts()
RETURNS TABLE (
  profile_id UUID,
  subject_id UUID,
  listing_id UUID,
  listing_title TEXT,
  conversation_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT me.profile_id, them.profile_id, l.id, l.title, c.id
  FROM listings l
  JOIN conversations c ON c.context_type = 'listing' AND c.context_id = l.id
  JOIN conversation_participants me ON me.conversation_id = c.id
  JOIN conversation_participants them
    ON them.conversation_id = c.id AND them.profile_id <> me.profile_id
  WHERE l.closed_at IS NOT NULL
    -- §17's delay, and §13.4's window as the far edge: prompting someone after
    -- their right to review has lapsed is worse than not prompting at all.
    AND l.closed_at <= now() - INTERVAL '48 hours'
    AND l.closed_at >  now() - INTERVAL '14 days'
    AND me.message_count >= 2
    AND them.message_count >= 2
    AND me.blocked = FALSE
    AND NOT EXISTS (
      SELECT 1 FROM reviews r
      WHERE r.author_id = me.profile_id AND r.conversation_id = c.id
    )
$$;

GRANT EXECUTE ON FUNCTION list_review_prompts() TO only_horses_app;
