-- ONLY HORSES · 0037 · what M4 needs from the database
--
-- Services, jobs, applications and reviews all have tables and read policies
-- from §7/§8, but the write paths §12 describes do not fit them yet. Four
-- gaps, in order of how badly they break:
--
--   1. slug uniqueness is invisible under RLS (same shape as 0020 and 0024);
--   2. `job_listings.application_count` is bumped by the applicant, who has no
--      rights over the poster's job row;
--   3. organizations post jobs (`jobs_write` says so) but could not act on the
--      applications, because `applications_update` names only the poster;
--   4. an organization could not answer a review written about it, because
--      `reviews_update` names only `subject_profile_id`.

-- ── 1. Slug lookups ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION service_slug_taken(p_slug TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM service_listings WHERE slug = p_slug)
$$;

CREATE OR REPLACE FUNCTION job_slug_taken(p_slug TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM job_listings WHERE slug = p_slug)
$$;

GRANT EXECUTE ON FUNCTION service_slug_taken(TEXT) TO only_horses_app;
GRANT EXECUTE ON FUNCTION job_slug_taken(TEXT) TO only_horses_app;

-- ── 2. Application counter ─────────────────────────────────────────────────
/**
 * Mirrors `bump_listing_inquiry_count` (0033) and exists for the same reason:
 * the counter belongs to the poster's row, the insert is made by the
 * applicant, and widening `jobs_write` so an applicant could touch the job
 * would be a far larger hole than the counter is worth.
 *
 * It decrements on withdrawal so §18.2 S20's "12 başvuru" stays true — a
 * number that only ever goes up is a vanity metric, not a queue depth.
 */
CREATE OR REPLACE FUNCTION bump_job_application_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE job_listings SET application_count = application_count + 1 WHERE id = NEW.job_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE job_listings SET application_count = GREATEST(0, application_count - 1) WHERE id = OLD.job_id;
  ELSIF NEW.status = 'withdrawn' AND OLD.status <> 'withdrawn' THEN
    UPDATE job_listings SET application_count = GREATEST(0, application_count - 1) WHERE id = NEW.job_id;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_job_application_count
AFTER INSERT OR DELETE OR UPDATE OF status ON job_applications
FOR EACH ROW EXECUTE FUNCTION bump_job_application_count();

-- ── 3. Organizations act on their own jobs' applications ───────────────────
-- `applications_select` (§8) already lets org members read them; only the
-- decision path was missing, so a stable's admin could see a shortlist and not
-- move anyone along it.
CREATE POLICY applications_update_org ON job_applications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM job_listings j
      WHERE j.id = job_applications.job_id
        AND is_org_member(j.organization_id, ARRAY['owner','admin']::org_member_role[])
    )
  );

-- ── 4. Organizations answer reviews about themselves ───────────────────────
-- §13.4 gives the subject exactly one response. For an organization the
-- "subject" is a company, so the right to answer belongs to its owners and
-- admins — not to every member, since a response is published under the
-- company's name.
CREATE POLICY reviews_update_org ON reviews FOR UPDATE
  USING (
    subject_org_id IS NOT NULL
    AND is_org_member(subject_org_id, ARRAY['owner','admin']::org_member_role[])
  );

-- ── Indexes for the three new search collections ───────────────────────────
-- 0025's indexes are all partial on `collection = 'listings'`, so services,
-- jobs and professionals would each fall back to a sequential scan of the
-- whole index table.
CREATE INDEX idx_search_documents_service_category
  ON search_documents ((document->>'category')) WHERE collection = 'services';

CREATE INDEX idx_search_documents_job_type
  ON search_documents ((document->>'job_type')) WHERE collection = 'jobs';

CREATE INDEX idx_search_documents_published
  ON search_documents (collection, ((document->>'published_at')::bigint) DESC);

/**
 * Review aggregates for a profile or an organization.
 *
 * SECURITY DEFINER because it is called on public surfaces — a professional's
 * directory card, a service listing, an organization page — where the reader
 * is often anonymous, and because it returns only counts and averages. It
 * excludes hidden reviews, so a moderator's decision (§13.4) takes effect on
 * the rating as well as on the text.
 */
CREATE OR REPLACE FUNCTION review_summary(p_profile_id UUID, p_org_id UUID)
RETURNS TABLE (
  average NUMERIC,
  total BIGINT,
  stars_1 BIGINT,
  stars_2 BIGINT,
  stars_3 BIGINT,
  stars_4 BIGINT,
  stars_5 BIGINT,
  communication NUMERIC,
  accuracy NUMERIC,
  professionalism NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT round(avg(rating)::numeric, 2),
         count(*),
         count(*) FILTER (WHERE rating = 1),
         count(*) FILTER (WHERE rating = 2),
         count(*) FILTER (WHERE rating = 3),
         count(*) FILTER (WHERE rating = 4),
         count(*) FILTER (WHERE rating = 5),
         round(avg(rating_communication)::numeric, 2),
         round(avg(rating_accuracy)::numeric, 2),
         round(avg(rating_professionalism)::numeric, 2)
  FROM reviews
  WHERE is_hidden = FALSE
    AND ((p_profile_id IS NOT NULL AND subject_profile_id = p_profile_id)
      OR (p_org_id IS NOT NULL AND subject_org_id = p_org_id))
$$;

GRANT EXECUTE ON FUNCTION review_summary(UUID, UUID) TO only_horses_app;

/**
 * §13.4's hide, with its logged reason and its author.
 *
 * `moderation_hide_target('review', …)` (0031) already hides a review and
 * stores the reason, but it runs unattributed — it is called from the
 * automated signal path, where there is no moderator. §13.4 says a review is
 * "only hidden by moderators with a logged reason", so the deliberate,
 * human act gets its own entry point that refuses a non-moderator, refuses an
 * empty reason, and records who decided.
 */
CREATE OR REPLACE FUNCTION moderation_hide_review(
  p_review_id UUID,
  p_moderator UUID,
  p_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_staff BOOLEAN;
BEGIN
  SELECT is_moderator OR is_admin INTO v_is_staff FROM profiles WHERE id = p_moderator;
  IF NOT COALESCE(v_is_staff, FALSE) THEN
    RAISE EXCEPTION 'not a moderator';
  END IF;

  IF coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'a hidden review needs a logged reason';
  END IF;

  UPDATE reviews
  SET is_hidden = TRUE, hidden_reason = p_reason, hidden_by = p_moderator
  WHERE id = p_review_id;

  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- Closes the case the hide answers, if one was opened by a report.
  UPDATE moderation_cases
  SET status = 'actioned', action_taken = 'hide_review', is_upheld = TRUE,
      assigned_to = p_moderator, resolved_at = now()
  WHERE target_type = 'review' AND target_id = p_review_id AND status IN ('open','in_review');

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION moderation_hide_review(UUID, UUID, TEXT) TO only_horses_app;
