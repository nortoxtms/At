-- ONLY HORSES · 0044 · what monetization needs from the database
--
-- Everything here exists because a Stripe webhook has no user behind it. It
-- arrives from Stripe, authenticated by a signature rather than by a session,
-- and then has to change rows that belong to a customer who is not present.
-- Under RLS that means either widening policies until a compromised webhook
-- endpoint could rewrite anything, or narrow SECURITY DEFINER functions that
-- do exactly one thing each. This is the second.

-- ── 1. One subscription per owner ──────────────────────────────────────
/**
 * §24.10 requires every webhook handler to be idempotent — "replay the same
 * event 3× → one effect". Without a unique key there is nothing for an upsert
 * to conflict on, and a replayed `customer.subscription.created` silently
 * produced a second active row. Two active subscriptions then make
 * `EntitlementsService` read whichever the planner returns first.
 *
 * §7 allows a subscription to belong to a profile or an organization
 * (`one_sub_owner`), so this is two partial indexes rather than one.
 */
DELETE FROM subscriptions a
USING subscriptions b
WHERE a.ctid < b.ctid
  AND a.profile_id IS NOT NULL
  AND a.profile_id = b.profile_id;

DELETE FROM subscriptions a
USING subscriptions b
WHERE a.ctid < b.ctid
  AND a.organization_id IS NOT NULL
  AND a.organization_id = b.organization_id;

CREATE UNIQUE INDEX uq_subscription_profile
  ON subscriptions (profile_id) WHERE profile_id IS NOT NULL;

CREATE UNIQUE INDEX uq_subscription_org
  ON subscriptions (organization_id) WHERE organization_id IS NOT NULL;

-- ── 2. Applying a subscription change ──────────────────────────────────
/**
 * The one write `customer.subscription.created|updated|deleted` performs.
 *
 * Returns the tier that was in force before the change, because §24.11's
 * downgrade handling needs to know a downgrade happened — comparing the new
 * tier against the old one is the only way to tell an upgrade from a renewal
 * from a cancellation, and reading it separately would race the update.
 */
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
    p_profile_id, p_tier, p_status, p_period_end,
    COALESCE(p_cancel_at_period_end, FALSE), p_stripe_customer_id, p_stripe_subscription_id)
  ON CONFLICT (profile_id) WHERE profile_id IS NOT NULL DO UPDATE
    SET tier = EXCLUDED.tier,
        status = EXCLUDED.status,
        current_period_end = EXCLUDED.current_period_end,
        cancel_at_period_end = EXCLUDED.cancel_at_period_end,
        -- COALESCE so an event that omits the ids does not erase them.
        stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, subscriptions.stripe_customer_id),
        stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, subscriptions.stripe_subscription_id);

  RETURN COALESCE(v_previous, 'free');
END;
$$;

GRANT EXECUTE ON FUNCTION apply_subscription_change(
  UUID, subscription_tier, subscription_status, TIMESTAMPTZ, BOOLEAN, TEXT, TEXT
) TO only_horses_app;

-- ── 3. Recording a purchase ────────────────────────────────────────────
/**
 * `purchases` has a SELECT policy and no INSERT policy (§8), deliberately: a
 * user who could write their own purchase rows could grant themselves a boost.
 * The webhook writes them instead, keyed on the Stripe session so a replay
 * updates the same row rather than adding a second one (§24.10).
 */
CREATE OR REPLACE FUNCTION record_purchase(
  p_profile_id UUID,
  p_product TEXT,
  p_target_type TEXT,
  p_target_id UUID,
  p_amount NUMERIC,
  p_currency CHAR(3),
  p_session_id TEXT,
  p_payment_intent TEXT,
  p_status TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO purchases (
    profile_id, product, target_type, target_id, amount, currency,
    stripe_session_id, stripe_payment_intent, status)
  VALUES (
    p_profile_id, p_product, p_target_type, p_target_id, p_amount, p_currency,
    p_session_id, p_payment_intent, p_status)
  ON CONFLICT (stripe_session_id) DO UPDATE
    SET status = EXCLUDED.status,
        stripe_payment_intent = COALESCE(EXCLUDED.stripe_payment_intent, purchases.stripe_payment_intent)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION record_purchase(UUID, TEXT, TEXT, UUID, NUMERIC, CHAR, TEXT, TEXT, TEXT)
  TO only_horses_app;

-- ── 4. Applying and expiring a boost ───────────────────────────────────
/**
 * §16.2 step 4: "On boost payment success: set `listings.is_boosted = true`,
 * `boost_expires_at = now() + interval`, reindex."
 *
 * The reindex happens by itself — `listings` carries the §11.4 outbox trigger,
 * so updating the row enqueues the document. That is the whole reason the
 * outbox exists rather than each call site remembering to reindex.
 *
 * Extending an unexpired boost adds to the remaining time instead of
 * restarting it: someone who buys 30 days on day 3 of a 7-day boost paid for
 * 37 days of visibility, not 30.
 */
CREATE OR REPLACE FUNCTION apply_boost(p_listing_id UUID, p_days INTEGER)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expires TIMESTAMPTZ;
BEGIN
  UPDATE listings
  SET is_boosted = TRUE,
      boost_expires_at = GREATEST(COALESCE(boost_expires_at, now()), now())
                         + (p_days || ' days')::interval
  WHERE id = p_listing_id
  RETURNING boost_expires_at INTO v_expires;

  RETURN v_expires;
END;
$$;

GRANT EXECUTE ON FUNCTION apply_boost(UUID, INTEGER) TO only_horses_app;

/**
 * §11.2 already treats an expired boost as unboosted at query time, so this
 * sweep is about the *index* and the seller's own view of what they are
 * paying for, not about correctness of ranking.
 */
CREATE OR REPLACE FUNCTION expire_boosts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE listings
  SET is_boosted = FALSE
  WHERE is_boosted = TRUE AND boost_expires_at IS NOT NULL AND boost_expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION expire_boosts() TO only_horses_app;

-- ── 5. §24.11's downgrade ──────────────────────────────────────────────
/**
 * "Downgrading from Pro to Free with 8 active listings pauses the newest 5 and
 * notifies the user; it never silently deletes content."
 *
 * The *choice* of which listings to pause is made in shared-types
 * (`selectListingsToPause`) so the paywall can warn before the user
 * downgrades — "3 ilanın duraklatılacak" — using the same rule the API
 * applies. This function only performs the pause, on ids it is given, and
 * returns what it actually changed so the notification cannot claim more than
 * happened.
 */
CREATE OR REPLACE FUNCTION pause_listings(p_ids UUID[])
RETURNS TABLE (id UUID, title TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE listings
  SET status = 'paused'
  WHERE id = ANY(p_ids) AND status IN ('active','under_offer')
  RETURNING id, title
$$;

GRANT EXECUTE ON FUNCTION pause_listings(UUID[]) TO only_horses_app;

/**
 * The active listings a downgrade has to consider. Read as the system because
 * the webhook has no session, and narrow: two columns, one owner.
 */
CREATE OR REPLACE FUNCTION active_listings_of(p_profile_id UUID)
RETURNS TABLE (id UUID, published_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, published_at FROM listings
  WHERE seller_profile_id = p_profile_id
    AND status IN ('active','under_offer')
  ORDER BY published_at
$$;

GRANT EXECUTE ON FUNCTION active_listings_of(UUID) TO only_horses_app;

-- ── 6. Boost view statistics for §18.2 S28 ─────────────────────────────
/**
 * The median extra views a boost has actually produced. Returns the sample
 * size alongside it so the client can refuse to show a median drawn from three
 * listings — §18.2 S28 allows an estimate, not a fabrication.
 */
CREATE OR REPLACE FUNCTION boost_view_median(p_days INTEGER)
RETURNS TABLE (median_views NUMERIC, sample_size BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY l.view_count),
         count(*)
  FROM purchases p
  JOIN listings l ON l.id = p.target_id
  WHERE p.status = 'paid'
    AND p.target_type = 'listing'
    AND p.product = CASE WHEN p_days >= 30 THEN 'boost_30d' ELSE 'boost_7d' END
$$;

GRANT EXECUTE ON FUNCTION boost_view_median(INTEGER) TO only_horses_app;
