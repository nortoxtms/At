-- ONLY HORSES · 0031 · moderation enforcement runs as the system
--
-- Two kinds of moderation write cannot be scoped to the caller:
--
--   · Hiding a target after §14.2's automated signals fire. The caller there
--     is the *reporter* — an ordinary user with no rights over the listing
--     they reported. Scoped to them the update touches nothing, and a
--     severity-5 case would leave the content live.
--
--   · Recomputing trust after a decision. `profiles_update` lets a user edit
--     their own row; a moderator penalising someone else's score is neither
--     the subject nor covered by that policy.
--
-- Both are exposed as SECURITY DEFINER functions with a fixed, narrow effect,
-- rather than by widening `profiles_update` or `listings_update` — a policy
-- broad enough to let moderation work would also be broad enough to let a
-- moderator's compromised session rewrite arbitrary listings.

CREATE OR REPLACE FUNCTION moderation_hide_target(
  p_target_type TEXT,
  p_target_id UUID,
  p_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Held, not destroyed: a cleared case must be able to put the content back
  -- exactly where it was.
  IF p_target_type = 'listing' THEN
    UPDATE listings SET status = 'pending_review', rejection_reason = p_reason
    WHERE id = p_target_id AND status IN ('active','under_offer');
  ELSIF p_target_type = 'media' THEN
    UPDATE media SET moderation_flag = 'under_review' WHERE id = p_target_id;
  ELSIF p_target_type = 'review' THEN
    -- §13.4: only moderators may hide a review, and the reason is logged.
    UPDATE reviews SET is_hidden = TRUE, hidden_reason = p_reason WHERE id = p_target_id;
  ELSE
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION moderation_release_target(
  p_target_type TEXT,
  p_target_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_target_type = 'listing' THEN
    UPDATE listings SET status = 'active', rejection_reason = NULL
    WHERE id = p_target_id AND status = 'pending_review';
  ELSIF p_target_type = 'media' THEN
    UPDATE media SET moderation_flag = NULL WHERE id = p_target_id;
  ELSIF p_target_type = 'review' THEN
    UPDATE reviews SET is_hidden = FALSE, hidden_reason = NULL WHERE id = p_target_id;
  ELSE
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

/**
 * Recomputes a profile's trust score. Callable for anyone, because the value
 * is entirely derived (§13.3 P4: "computed, never manually set") — there is
 * nothing to abuse in asking for it to be recalculated.
 */
CREATE OR REPLACE FUNCTION refresh_trust_score(p_profile_id UUID)
RETURNS SMALLINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score SMALLINT;
BEGIN
  -- Two steps, deliberately: compute_trust_score is STABLE and reads the
  -- committed row, so computing it inside the UPDATE that changes its inputs
  -- would score the previous state.
  v_score := compute_trust_score(p_profile_id);
  UPDATE profiles SET trust_score = v_score WHERE id = p_profile_id;
  RETURN v_score;
END;
$$;

CREATE OR REPLACE FUNCTION moderation_suspend_profile(p_profile_id UUID, p_reason TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles SET is_suspended = TRUE, suspended_reason = p_reason WHERE id = p_profile_id;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION moderation_hide_target(TEXT, UUID, TEXT) TO only_horses_app;
GRANT EXECUTE ON FUNCTION moderation_release_target(TEXT, UUID) TO only_horses_app;
GRANT EXECUTE ON FUNCTION refresh_trust_score(UUID) TO only_horses_app;
GRANT EXECUTE ON FUNCTION moderation_suspend_profile(UUID, TEXT) TO only_horses_app;
