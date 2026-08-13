-- ONLY HORSES · 0047 · §24.5's saved-search alerts
--
--   "A saved search produces a push notification within 5 minutes of a
--    matching listing being published."
--
-- The sweep that makes that true has no user behind it and reads every user's
-- saved searches, while `saved_searches_own` scopes the table to its owner —
-- the same shape as every other scheduled job in this codebase. Two functions:
-- one to list what is due, one to record that it ran.

CREATE OR REPLACE FUNCTION list_due_saved_searches(p_limit INTEGER DEFAULT 500)
RETURNS TABLE (
  id UUID,
  profile_id UUID,
  name TEXT,
  entity TEXT,
  query JSONB,
  alert_channel notification_channel[],
  alert_frequency TEXT,
  last_run_at TIMESTAMPTZ,
  last_seen_max_created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.profile_id, s.name, s.entity, s.query, s.alert_channel,
         s.alert_frequency, s.last_run_at, s.last_seen_max_created_at
  FROM saved_searches s
  JOIN profiles p ON p.id = s.profile_id
  WHERE s.alert_frequency <> 'off'
    -- A suspended or deleted account keeps its saved searches and stops
    -- being notified by them.
    AND p.deleted_at IS NULL
    AND p.is_suspended = FALSE
    AND (
      s.last_run_at IS NULL
      OR (s.alert_frequency = 'instant' AND s.last_run_at < now() - INTERVAL '5 minutes')
      OR (s.alert_frequency = 'daily'   AND s.last_run_at < now() - INTERVAL '1 day')
      OR (s.alert_frequency = 'weekly'  AND s.last_run_at < now() - INTERVAL '7 days')
    )
  ORDER BY s.last_run_at NULLS FIRST
  LIMIT p_limit
$$;

GRANT EXECUTE ON FUNCTION list_due_saved_searches(INTEGER) TO only_horses_app;

/**
 * Records a completed run.
 *
 * `last_seen_max_created_at` is a *watermark*, not a timestamp of the run: it
 * moves to the newest listing this search has already reported, so a listing
 * published while the sweep was mid-flight is picked up next time rather than
 * skipped. Comparing against "when the job last ran" would lose exactly those
 * rows, which is the classic way an alerting system quietly drops events.
 */
CREATE OR REPLACE FUNCTION mark_saved_search_run(
  p_id UUID,
  p_watermark TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE saved_searches
  SET last_run_at = now(),
      last_seen_max_created_at = GREATEST(
        COALESCE(last_seen_max_created_at, 'epoch'::timestamptz),
        COALESCE(p_watermark, COALESCE(last_seen_max_created_at, 'epoch'::timestamptz))
      )
  WHERE id = p_id
$$;

GRANT EXECUTE ON FUNCTION mark_saved_search_run(UUID, TIMESTAMPTZ) TO only_horses_app;

/**
 * §18.2 S29's saved list needs the saved *thing*, not just its id, and the
 * five tabs mix entity types. Resolving titles per type in SQL keeps the API
 * from issuing one query per saved row.
 *
 * Only publicly visible rows resolve; a saved listing that has since been
 * withdrawn comes back with a null title, which is what lets §18.2 S29 show
 * "artık yayında değil" instead of a broken card.
 */
CREATE OR REPLACE FUNCTION resolve_saved_items(p_profile_id UUID)
RETURNS TABLE (
  item_type TEXT,
  item_id UUID,
  note TEXT,
  created_at TIMESTAMPTZ,
  title TEXT,
  slug TEXT,
  subtitle TEXT,
  is_available BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.item_type, s.item_id, s.note, s.created_at,
         CASE s.item_type
           WHEN 'listing'      THEN l.title
           WHEN 'service'      THEN sv.title
           WHEN 'job'          THEN j.title
           WHEN 'profile'      THEN pr.display_name
           WHEN 'organization' THEN o.name
           WHEN 'horse'        THEN h.name
         END,
         CASE s.item_type
           WHEN 'listing'      THEN l.slug::text
           WHEN 'service'      THEN sv.slug::text
           WHEN 'job'          THEN j.slug::text
           WHEN 'profile'      THEN pr.handle::text
           WHEN 'organization' THEN o.slug::text
           WHEN 'horse'        THEN h.slug::text
         END,
         CASE s.item_type
           WHEN 'listing' THEN l.city
           WHEN 'service' THEN sv.city
           WHEN 'job'     THEN j.city
           WHEN 'profile' THEN pr.city
           ELSE NULL
         END,
         CASE s.item_type
           WHEN 'listing'      THEN l.status IN ('active','under_offer')
           WHEN 'service'      THEN sv.status = 'active'
           WHEN 'job'          THEN j.status = 'active'
           WHEN 'profile'      THEN pr.deleted_at IS NULL AND pr.is_suspended = FALSE
           WHEN 'organization' THEN o.deleted_at IS NULL
           WHEN 'horse'        THEN h.deleted_at IS NULL
         END
  FROM saved_items s
  LEFT JOIN listings l         ON s.item_type = 'listing'      AND l.id = s.item_id
  LEFT JOIN service_listings sv ON s.item_type = 'service'     AND sv.id = s.item_id
  LEFT JOIN job_listings j     ON s.item_type = 'job'          AND j.id = s.item_id
  LEFT JOIN profiles pr        ON s.item_type = 'profile'      AND pr.id = s.item_id
  LEFT JOIN organizations o    ON s.item_type = 'organization' AND o.id = s.item_id
  LEFT JOIN horses h           ON s.item_type = 'horse'        AND h.id = s.item_id
  WHERE s.profile_id = p_profile_id
  ORDER BY s.created_at DESC
$$;

GRANT EXECUTE ON FUNCTION resolve_saved_items(UUID) TO only_horses_app;

/**
 * `listings.save_count` is §13.2 input and §18.2 S14 analytics. The saver has
 * no rights over the seller's listing, so the counter is a trigger — the same
 * argument as `inquiry_count` (0033) and `application_count` (0037).
 */
CREATE OR REPLACE FUNCTION bump_listing_save_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.item_type = 'listing' THEN
    UPDATE listings SET save_count = save_count + 1 WHERE id = NEW.item_id;
  ELSIF TG_OP = 'DELETE' AND OLD.item_type = 'listing' THEN
    UPDATE listings SET save_count = GREATEST(0, save_count - 1) WHERE id = OLD.item_id;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_listing_save_count
AFTER INSERT OR DELETE ON saved_items
FOR EACH ROW EXECUTE FUNCTION bump_listing_save_count();
