-- ONLY HORSES · 0038 · the job expiry sweep runs as the system
--
-- §13.6: "Applications auto-close when the job expires."
--
-- The sweep has no user behind it. `jobs_write` is the poster's and
-- `applications_update` is the poster's or the applicant's, so an unscoped
-- UPDATE from the API role matches zero rows and reports success — the exact
-- failure this codebase has hit repeatedly: a policy silently returning
-- nothing rather than raising. One SECURITY DEFINER function, returning the
-- rows it closed so the caller can notify each applicant (§17).

CREATE OR REPLACE FUNCTION close_expired_jobs()
RETURNS TABLE (
  application_id UUID,
  applicant_id UUID,
  job_id UUID,
  job_title TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH expired AS (
    UPDATE job_listings
    SET status = 'expired'
    WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < now()
    RETURNING id, title
  ),
  closed AS (
    UPDATE job_applications a
    SET status = 'rejected',
        status_note = COALESCE(a.status_note, 'İlan süresi doldu.')
    FROM expired e
    WHERE a.job_id = e.id
      AND a.status NOT IN ('rejected','withdrawn')
    RETURNING a.id, a.applicant_id, a.job_id, e.title
  )
  SELECT c.id, c.applicant_id, c.job_id, c.title FROM closed c;
END;
$$;

GRANT EXECUTE ON FUNCTION close_expired_jobs() TO only_horses_app;

/**
 * Marks an application as viewed the first time its poster opens the list.
 *
 * §13.6's first transition is the one no employer will click. Doing it as a
 * side effect of reading is honest — the applicant is told the application was
 * seen, which is exactly what happened — and it must be attributed to the
 * poster, so it is checked here rather than trusted from the caller.
 */
CREATE OR REPLACE FUNCTION mark_applications_viewed(p_job_id UUID, p_actor UUID)
RETURNS SETOF UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM job_listings j
    WHERE j.id = p_job_id
      AND (j.poster_profile_id = p_actor
           OR EXISTS (SELECT 1 FROM organization_members m
                      WHERE m.organization_id = j.organization_id
                        AND m.profile_id = p_actor
                        AND m.role IN ('owner','admin')))
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE job_applications
  SET status = 'viewed'
  WHERE job_id = p_job_id AND status = 'submitted'
  RETURNING id;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_applications_viewed(UUID, UUID) TO only_horses_app;

/**
 * §13.4's second qualifier: "or a completed transfer".
 *
 * `ownership_history_select` shows a user their own ownership rows and the
 * rows of horses they can edit — which is right, and which means neither party
 * to a completed sale can see the *other's* row once the horse has moved on.
 * Asked directly, the question would answer "no transfer" for every genuine
 * sale, and §13.4's alternative path would be dead code.
 *
 * The function answers with a single date and nothing else: enough to open the
 * review window, not enough to enumerate anyone's horses.
 */
CREATE OR REPLACE FUNCTION ownership_transfer_between(p_a UUID, p_b UUID)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT max(later.from_date)
  FROM horse_ownership_history later
  JOIN horse_ownership_history earlier
    ON earlier.horse_id = later.horse_id
   AND earlier.to_date IS NOT NULL
   AND earlier.to_date <= later.from_date
  WHERE (later.owner_profile_id = p_a AND earlier.owner_profile_id = p_b)
     OR (later.owner_profile_id = p_b AND earlier.owner_profile_id = p_a)
$$;

GRANT EXECUTE ON FUNCTION ownership_transfer_between(UUID, UUID) TO only_horses_app;
