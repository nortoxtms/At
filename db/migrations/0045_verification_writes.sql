-- ONLY HORSES · 0045 · the verification ladder could not be written to
--
-- §8 gives `verifications` one policy — `verifications_own`, FOR SELECT — and
-- nothing else. With RLS on, that means:
--
--   · `POST /verification/submit` (§12) raised "new row violates row-level
--     security policy" for every professional, business and horse-ownership
--     submission. §14.1's manual queues could not be entered at all.
--   · `VerificationService.decide` updated the row unscoped, matched nothing,
--     and returned success. An approved professional badge changed no rows and
--     raised no level.
--
-- M3's acceptance run drove identity verification straight through SQL, which
-- is why neither showed up: the milestone's DoD sentence was about publishing
-- being blocked without identity, and that part was real.
--
-- Two fixes, of different kinds. Submitting is a user action and gets a
-- policy. Deciding is a privileged action taken *about* someone else and gets
-- a function, because a policy broad enough for a moderator to approve anyone
-- would also let a compromised moderator session rewrite any verification row.

CREATE POLICY verifications_insert ON verifications FOR INSERT
  WITH CHECK (profile_id = auth.uid());

/**
 * The whole §14.1 decision, in one statement that cannot be half-applied.
 *
 * Mirrors what `VerificationService.decide` was written to do, including the
 * two details that are easy to lose: the level is *raised* only (approving a
 * professional badge must not demote someone already business-verified), and
 * the trust score is recomputed after the level lands, never in the same
 * statement (§13.3 — `compute_trust_score` is STABLE and would read the old
 * row).
 */
CREATE OR REPLACE FUNCTION decide_verification(
  p_verification_id UUID,
  p_reviewer UUID,
  p_status TEXT,
  p_note TEXT
)
RETURNS TABLE (profile_id UUID, kind TEXT, level TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row      verifications%ROWTYPE;
  v_is_staff BOOLEAN;
  v_level    verification_level;
  v_order    verification_level[] := ARRAY[
    'none','email_verified','phone_verified','identity_verified',
    'professional_verified','business_verified'
  ]::verification_level[];
BEGIN
  -- A reviewer is required for the manual queues; the identity path has no
  -- human and calls decide_identity_verification instead.
  SELECT is_moderator OR is_admin INTO v_is_staff FROM profiles WHERE id = p_reviewer;
  IF NOT COALESCE(v_is_staff, FALSE) THEN
    RAISE EXCEPTION 'not a moderator';
  END IF;

  SELECT * INTO v_row FROM verifications WHERE id = p_verification_id;
  IF NOT FOUND OR v_row.status <> 'pending' THEN
    RETURN;
  END IF;

  UPDATE verifications
  SET status = p_status, reviewer_id = p_reviewer, reviewer_note = p_note, decided_at = now()
  WHERE id = p_verification_id;

  IF p_status <> 'approved' THEN
    RETURN QUERY SELECT v_row.profile_id, v_row.kind, NULL::TEXT;
    RETURN;
  END IF;

  v_level := CASE v_row.kind
    WHEN 'email'        THEN 'email_verified'
    WHEN 'phone'        THEN 'phone_verified'
    WHEN 'identity'     THEN 'identity_verified'
    WHEN 'professional' THEN 'professional_verified'
    WHEN 'business'     THEN 'business_verified'
    ELSE NULL
  END::verification_level;

  IF v_level IS NOT NULL THEN
    UPDATE profiles
    SET verification_level = v_level
    WHERE id = v_row.profile_id
      AND array_position(v_order, verification_level) < array_position(v_order, v_level);
  END IF;

  IF v_row.kind = 'horse_ownership' AND v_row.horse_id IS NOT NULL THEN
    UPDATE horses SET ownership_verified_at = now() WHERE id = v_row.horse_id;
  END IF;

  IF v_row.kind = 'business' AND v_row.organization_id IS NOT NULL THEN
    UPDATE organizations SET verification_level = 'business_verified'
    WHERE id = v_row.organization_id;
  END IF;

  PERFORM refresh_trust_score(v_row.profile_id);

  RETURN QUERY SELECT v_row.profile_id, v_row.kind, v_level::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION decide_verification(UUID, UUID, TEXT, TEXT) TO only_horses_app;

/**
 * §14.1: "identity is decided by Stripe Identity's webhook, never by a client
 * call". There is no reviewer and no pending row to find — the session was
 * started by the user and finished at Stripe — so this creates or updates the
 * identity row itself and then applies the same level logic.
 */
CREATE OR REPLACE FUNCTION decide_identity_verification(
  p_profile_id UUID,
  p_approved BOOLEAN,
  p_provider_ref TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order verification_level[] := ARRAY[
    'none','email_verified','phone_verified','identity_verified',
    'professional_verified','business_verified'
  ]::verification_level[];
BEGIN
  INSERT INTO verifications (profile_id, kind, status, provider, provider_ref, decided_at)
  VALUES (
    p_profile_id, 'identity',
    CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
    'stripe_identity', p_provider_ref, now());

  IF NOT p_approved THEN RETURN FALSE; END IF;

  UPDATE profiles
  SET verification_level = 'identity_verified'
  WHERE id = p_profile_id
    AND array_position(v_order, verification_level)
        < array_position(v_order, 'identity_verified'::verification_level);

  PERFORM refresh_trust_score(p_profile_id);
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION decide_identity_verification(UUID, BOOLEAN, TEXT) TO only_horses_app;

/**
 * Stripe identifies the customer, not the profile. `invoice.payment_failed`
 * carries only the customer id, and `subscriptions_select` belongs to the
 * subscriber — who is not making this request.
 */
CREATE OR REPLACE FUNCTION profile_id_for_stripe_customer(p_customer_id TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT profile_id FROM subscriptions WHERE stripe_customer_id = p_customer_id LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION profile_id_for_stripe_customer(TEXT) TO only_horses_app;
