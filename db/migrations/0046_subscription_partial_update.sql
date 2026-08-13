-- ONLY HORSES · 0046 · a subscription update that does not need to read first
--
-- `invoice.payment_failed` changes one field — the status — and must leave the
-- tier, the period end and the cancellation flag alone. The handler expressed
-- that by passing subselects for the fields it was not changing:
--
--   apply_subscription_change($1, (SELECT tier FROM subscriptions ...), ...)
--
-- Those subselects ran outside the function, as the API role with no user
-- context, and `subscriptions_select` scopes rows to their owner. They
-- returned NULL, the upsert took its INSERT branch, and Postgres refused the
-- null tier. The not-null constraint caught what would otherwise have been the
-- familiar silent version of this bug: a paying customer downgraded to free by
-- a failed-payment notice.
--
-- The fix is to make NULL mean "leave it as it is", so a partial update needs
-- no read at all.

CREATE OR REPLACE FUNCTION apply_subscription_change(
  p_profile_id UUID,
  p_tier subscription_tier,
  p_status subscription_status,
  p_period_end TIMESTAMPTZ,
  p_cancel_at_period_end BOOLEAN,
  p_stripe_customer_id TEXT,
  p_stripe_subscription_id TEXT
)
RETURNS subscription_tier
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previous subscription_tier;
BEGIN
  SELECT tier INTO v_previous FROM subscriptions WHERE profile_id = p_profile_id;

  INSERT INTO subscriptions (
    profile_id, tier, status, current_period_end, cancel_at_period_end,
    stripe_customer_id, stripe_subscription_id)
  VALUES (
    p_profile_id,
    -- NULL means "keep what is there"; with no row at all, Free is the plan
    -- everyone starts on (§16.1).
    COALESCE(p_tier, v_previous, 'free'),
    COALESCE(p_status, 'active'),
    p_period_end,
    COALESCE(p_cancel_at_period_end, FALSE),
    p_stripe_customer_id,
    p_stripe_subscription_id)
  ON CONFLICT (profile_id) WHERE profile_id IS NOT NULL DO UPDATE
    SET tier = COALESCE(EXCLUDED.tier, subscriptions.tier),
        status = COALESCE(EXCLUDED.status, subscriptions.status),
        current_period_end = COALESCE(EXCLUDED.current_period_end, subscriptions.current_period_end),
        cancel_at_period_end = COALESCE(EXCLUDED.cancel_at_period_end, subscriptions.cancel_at_period_end),
        stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, subscriptions.stripe_customer_id),
        stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, subscriptions.stripe_subscription_id);

  RETURN COALESCE(v_previous, 'free');
END;
$$;
