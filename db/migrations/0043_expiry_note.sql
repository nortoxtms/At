-- ONLY HORSES · 0043 · say why an application was closed
--
-- 0038 wrote the expiry note with COALESCE, keeping any note the employer had
-- left earlier. That reads badly at exactly the wrong moment: an applicant
-- whose status flips to "rejected" would see the note from when they were
-- shortlisted — "your CV looks great, can we talk Friday?" — attached to the
-- rejection.
--
-- `status_note` describes the *current* status, so the expiry reason replaces
-- it. §13.6 asks for the auto-close; the note is what makes it not look like a
-- decision the employer made about them.

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
        status_note = 'İlan süresi doldu.'
    FROM expired e
    WHERE a.job_id = e.id
      AND a.status NOT IN ('rejected','withdrawn')
    RETURNING a.id, a.applicant_id, a.job_id, e.title
  )
  SELECT c.id, c.applicant_id, c.job_id, c.title FROM closed c;
END;
$$;
