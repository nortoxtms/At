-- ONLY HORSES · 0049 · enum arrays cross the driver as text
--
-- node-postgres parses array results by OID, and it only knows the built-in
-- array OIDs. `text[]` and `uuid[]` come back as JavaScript arrays; an array of
-- a *custom enum* has a dynamic OID the driver has never seen, so it arrives as
-- the raw string `{rider,groom}`.
--
-- The schema has exactly two of them, and both were quietly broken:
--
--   · `job_listings.roles_needed` (`role_type[]`) was indexed into the §11.1
--     jobs document as the string "{farrier}" rather than an array, so
--     `GET /jobs/search?roles=farrier` matched nothing. M4's acceptance run
--     covered the jobType and accommodation filters but not this one.
--   · `saved_searches.alert_channel` (`notification_channel[]`) reached the
--     §24.5 alert job as a string, and dispatching threw
--     "input.channels.filter is not a function" — which at least failed loudly.
--
-- The fix is to cast at the boundary. This migration handles the function;
-- the two call sites that select the column directly cast it themselves, with
-- a comment pointing here.

DROP FUNCTION IF EXISTS list_due_saved_searches(INTEGER);

CREATE OR REPLACE FUNCTION list_due_saved_searches(p_limit INTEGER DEFAULT 500)
RETURNS TABLE (
  id UUID,
  profile_id UUID,
  name TEXT,
  entity TEXT,
  query JSONB,
  -- text[], not notification_channel[]: see the note above.
  alert_channel TEXT[],
  alert_frequency TEXT,
  last_run_at TIMESTAMPTZ,
  last_seen_max_created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.profile_id, s.name, s.entity, s.query, s.alert_channel::text[],
         s.alert_frequency, s.last_run_at, s.last_seen_max_created_at
  FROM saved_searches s
  JOIN profiles p ON p.id = s.profile_id
  WHERE s.alert_frequency <> 'off'
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

COMMENT ON COLUMN job_listings.roles_needed IS
  'role_type[]. Cast to text[] when selecting: node-pg cannot parse arrays of '
  'custom enum types and returns the raw string (migration 0049).';
COMMENT ON COLUMN saved_searches.alert_channel IS
  'notification_channel[]. Cast to text[] when selecting (migration 0049).';
