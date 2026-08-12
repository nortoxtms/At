-- ONLY HORSES · 0023 · the reminder job's candidate query
--
-- The §17 `health.due` job is inherently cross-tenant: it sweeps every
-- owner's records on a schedule, with no user behind the request. Under
-- `health_select` it sees nothing at all, so the job ran cleanly and sent
-- zero reminders — a silent failure of the mechanism §1.2 leans on for
-- weekly retention.
--
-- Exposed as a SECURITY DEFINER function rather than by relaxing the policy,
-- so the widened read is limited to records that are actually due and to the
-- fields the notification needs. Note what is absent: `notes`, cost, and the
-- document ids never leave the health file.

CREATE OR REPLACE FUNCTION list_due_health_reminders(p_lead_days INTEGER)
RETURNS TABLE (
  record_id        UUID,
  horse_id         UUID,
  horse_name       TEXT,
  owner_profile_id UUID,
  type             health_record_type,
  title            TEXT,
  next_due_on      DATE,
  days_until       INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- DISTINCT ON keeps the most recent record per horse and type: a horse with
  -- five years of vaccinations has five rows carrying a next_due_on, and only
  -- the latest is actually outstanding.
  SELECT DISTINCT ON (r.horse_id, r.type)
         r.id, r.horse_id, h.name, h.owner_profile_id, r.type, r.title,
         r.next_due_on, (r.next_due_on - CURRENT_DATE)::integer
  FROM horse_health_records r
  JOIN horses h ON h.id = r.horse_id
  WHERE h.deleted_at IS NULL
    AND h.status = 'active'
    AND h.owner_profile_id IS NOT NULL
    -- §26: records under legal hold are skipped by background jobs.
    AND h.legal_hold = FALSE
    AND r.next_due_on IN (CURRENT_DATE, CURRENT_DATE + p_lead_days)
  ORDER BY r.horse_id, r.type, r.next_due_on DESC
$$;

GRANT EXECUTE ON FUNCTION list_due_health_reminders(INTEGER) TO only_horses_app;
