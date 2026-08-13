-- ONLY HORSES · 0030 · the access-grant expiry sweep
--
-- §2 makes health-file grants time-limited, which only means anything if
-- something actually expires them. The sweep runs on a schedule with no user
-- behind it, so under `grants_update` (which requires can_edit_horse) it can
-- touch nothing at all — a grant would read as active forever and the time
-- limit would be decorative.
--
-- Exposed as a SECURITY DEFINER function that can do exactly one thing:
-- move a lapsed 'granted' row to 'expired'. It cannot grant, deny, or extend.

CREATE OR REPLACE FUNCTION expire_lapsed_access_grants()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired INTEGER;
BEGIN
  UPDATE horse_access_grants
  SET status = 'expired'
  WHERE status = 'granted'
    AND expires_at IS NOT NULL
    AND expires_at <= now();

  GET DIAGNOSTICS v_expired = ROW_COUNT;
  RETURN v_expired;
END;
$$;

GRANT EXECUTE ON FUNCTION expire_lapsed_access_grants() TO only_horses_app;
