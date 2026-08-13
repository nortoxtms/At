-- ONLY HORSES · 0041 · consuming a paid job post
--
-- §8 gives `purchases` a SELECT policy and nothing else, which is right: a
-- user who could UPDATE their own purchases could mark one unapplied and
-- publish job after job on a single payment.
--
-- But the same absence means the API's `UPDATE purchases SET applied_at` in
-- `JobsService.publish` matched zero rows and reported success — the caller
-- then read "no purchase" and answered PAYMENT_REQUIRED to somebody who had
-- already paid. A narrow SECURITY DEFINER function does exactly the one thing
-- that must happen, and nothing else.

CREATE OR REPLACE FUNCTION consume_job_post_purchase(p_profile_id UUID, p_job_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- SKIP LOCKED so two concurrent publishes cannot consume the same row, and
  -- `applied_at IS NULL` so one payment publishes exactly one job.
  SELECT id INTO v_id
  FROM purchases
  WHERE profile_id = p_profile_id
    AND product = 'job_post'
    AND status = 'paid'
    AND applied_at IS NULL
    -- A purchase made for a specific job may only publish that job; one made
    -- without a target (bought up front) may publish any of the buyer's.
    AND (target_id IS NULL OR (target_type = 'job' AND target_id = p_job_id))
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_id IS NULL THEN RETURN NULL; END IF;

  UPDATE purchases
  SET applied_at = now(),
      target_type = 'job',
      target_id = p_job_id
  WHERE id = v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION consume_job_post_purchase(UUID, UUID) TO only_horses_app;
