-- ONLY HORSES · 0051 · the admin console's numbers
--
-- §23 M6 asks for admin metrics, and §22 names the one that matters:
--
--   "North Star metric: weekly qualified inquiries — conversations where the
--    seller replied within 48 h and both sides sent ≥2 messages."
--
-- Plus the guardrails §22 lists beside it: seller response rate, median
-- days-to-first-inquiry, % listings sold within 60 days, reports per 1,000
-- listings, D30 retention of horse owners.
--
-- One SECURITY DEFINER function, staff-gated inside: every number here spans
-- every tenant, which is exactly what no RLS policy will ever allow.

CREATE OR REPLACE FUNCTION admin_metrics(p_actor UUID, p_days INTEGER DEFAULT 7)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_staff BOOLEAN;
  v_since    TIMESTAMPTZ := now() - (p_days || ' days')::interval;
BEGIN
  SELECT is_moderator OR is_admin INTO v_is_staff FROM profiles WHERE id = p_actor;
  IF NOT COALESCE(v_is_staff, FALSE) THEN
    RAISE EXCEPTION 'not a moderator';
  END IF;

  RETURN jsonb_build_object(
    'window', jsonb_build_object('days', p_days, 'since', v_since),

    -- §22's North Star, spelled out rather than approximated: both sides at
    -- two messages, and the seller's first reply inside 48 hours.
    'qualifiedInquiries', (
      SELECT count(*)
      FROM conversations c
      JOIN inquiries i ON i.conversation_id = c.id
      WHERE c.created_at >= v_since
        AND i.first_reply_at IS NOT NULL
        AND i.first_reply_at - i.created_at <= INTERVAL '48 hours'
        AND (SELECT count(*) FROM conversation_participants p
              WHERE p.conversation_id = c.id AND p.message_count >= 2) >= 2
    ),

    'signups', (SELECT count(*) FROM profiles WHERE created_at >= v_since),
    'listingsPublished', (SELECT count(*) FROM listings WHERE published_at >= v_since),
    'listingsActive', (SELECT count(*) FROM listings WHERE status IN ('active','under_offer')),
    'conversationsStarted', (SELECT count(*) FROM conversations WHERE created_at >= v_since),
    'messagesSent', (SELECT count(*) FROM conversation_messages WHERE created_at >= v_since),

    -- Guardrails.
    'sellerResponseRate', (
      SELECT round(avg(response_rate)::numeric, 3) FROM profiles WHERE response_rate IS NOT NULL
    ),
    'medianDaysToFirstInquiry', (
      SELECT round(percentile_cont(0.5) WITHIN GROUP (
               ORDER BY EXTRACT(EPOCH FROM (i.created_at - l.published_at)) / 86400
             )::numeric, 1)
      FROM listings l
      JOIN LATERAL (
        SELECT min(created_at) AS created_at FROM inquiries WHERE listing_id = l.id
      ) i ON TRUE
      WHERE l.published_at IS NOT NULL AND i.created_at IS NOT NULL
    ),
    'soldWithin60DaysPct', (
      SELECT CASE WHEN count(*) = 0 THEN NULL
             ELSE round(100.0 * count(*) FILTER (
               WHERE l.status = 'sold' AND l.closed_at - l.published_at <= INTERVAL '60 days'
             ) / count(*), 1) END
      FROM listings l WHERE l.published_at IS NOT NULL AND l.published_at < now() - INTERVAL '60 days'
    ),
    'reportsPer1000Listings', (
      SELECT CASE WHEN (SELECT count(*) FROM listings) = 0 THEN NULL
             ELSE round(1000.0 * (SELECT count(*) FROM reports WHERE created_at >= v_since)
                        / (SELECT count(*) FROM listings), 2) END
    ),
    -- D30 retention of horse owners: of the people who added a horse 30–60
    -- days ago, how many did anything at all in the last 30.
    'ownerD30RetentionPct', (
      SELECT CASE WHEN count(*) = 0 THEN NULL
             ELSE round(100.0 * count(*) FILTER (WHERE active_since) / count(*), 1) END
      FROM (
        SELECT p.id,
               EXISTS (
                 SELECT 1 FROM listings l
                  WHERE l.seller_profile_id = p.id AND l.published_at >= now() - INTERVAL '30 days'
                 UNION ALL
                 SELECT 1 FROM conversation_messages m
                  WHERE m.sender_id = p.id AND m.created_at >= now() - INTERVAL '30 days'
                 UNION ALL
                 SELECT 1 FROM horses h
                  WHERE h.owner_profile_id = p.id AND h.created_at >= now() - INTERVAL '30 days'
               ) AS active_since
        FROM profiles p
        WHERE EXISTS (SELECT 1 FROM horses h WHERE h.owner_profile_id = p.id)
          AND p.created_at BETWEEN now() - INTERVAL '60 days' AND now() - INTERVAL '30 days'
      ) cohort
    ),

    -- Operational health: what a moderator has to act on right now.
    'moderationOpen', (SELECT count(*) FROM moderation_cases WHERE status IN ('open','in_review')),
    'verificationsPending', (SELECT count(*) FROM verifications WHERE status = 'pending'),
    'searchBacklog', (SELECT count(*) FROM search_outbox WHERE processed_at IS NULL),
    'webhookFailures', (SELECT count(*) FROM stripe_events WHERE processed_at IS NULL AND error IS NOT NULL),
    'dataRequestsPending', (SELECT count(*) FROM data_requests WHERE status = 'pending'),

    -- §16: the business side.
    'subscriptionsByTier', (
      SELECT COALESCE(jsonb_object_agg(tier, n), '{}'::jsonb)
      FROM (SELECT tier::text, count(*) AS n FROM subscriptions
             WHERE status IN ('active','trialing') GROUP BY tier) t
    ),
    'revenueEurWindow', (
      SELECT COALESCE(round(sum(amount)::numeric, 2), 0)
      FROM purchases WHERE status = 'paid' AND created_at >= v_since
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_metrics(UUID, INTEGER) TO only_horses_app;
