-- ONLY HORSES · 0042 · three gaps M4 surfaced
--
--   1. Avatars and logos were unreadable to anyone but their owner, so every
--      public surface that shows a face — the directory card, a service
--      listing, a review — rendered without one.
--   2. Notifying an applicant needs to read the application it is about, and
--      `applications_select` is written for the two parties, not for the
--      system doing the notifying.
--   3. Reviewing an organization needs to know who its owner is, and
--      `org_members_select` is members-only.

-- ── 1. Public media ────────────────────────────────────────────────────
/**
 * `media_select` (§8) exposed exactly one thing: images attached to a horse
 * with an active listing. Everything else was owner-only — including the
 * avatar shown on a public profile and the logo on an organization page.
 *
 * The failure was silent in the worst way: the indexer runs unauthenticated,
 * so `LEFT JOIN media` simply produced NULL and every directory card was
 * built without a picture. No error, no empty result, just a worse product.
 *
 * The policy is replaced rather than widened field by field, because the set
 * being added is one idea: media a user has deliberately published about
 * themselves. Documents stay excluded everywhere — §10.3 keeps them behind
 * short-lived signed URLs.
 */
DROP POLICY IF EXISTS media_select ON media;

CREATE POLICY media_select ON media FOR SELECT
  USING (
    owner_profile_id = auth.uid()
    OR is_staff()
    OR (
      type <> 'document'
      AND (
        -- Photos and videos of a horse that is publicly listed.
        EXISTS (
          SELECT 1 FROM horse_media hm
          JOIN listings l ON l.horse_id = hm.horse_id AND l.status = 'active'
          WHERE hm.media_id = media.id AND hm.visibility = 'public'
        )
        -- A profile avatar: shown wherever the person is shown.
        OR EXISTS (SELECT 1 FROM profiles p WHERE p.avatar_media_id = media.id)
        -- An organization's logo and cover: §19.1 renders the page publicly.
        OR EXISTS (
          SELECT 1 FROM organizations o
          WHERE o.logo_media_id = media.id OR o.cover_media_id = media.id
        )
        -- The gallery on a published service listing (§18.2 S16).
        OR EXISTS (
          SELECT 1 FROM service_media sm
          JOIN service_listings s ON s.id = sm.service_id AND s.status = 'active'
          WHERE sm.media_id = media.id
        )
      )
    )
  );

-- ── 2. Application notification context ────────────────────────────────
/**
 * §13.6: "Every status change notifies the applicant."
 *
 * The notifier is the poster, and the row it must read to address the
 * notification belongs to the applicant. Read unscoped it returned nothing
 * and the notification was quietly skipped — the DoD sentence for this whole
 * milestone, failing without an error. Four fields, no more.
 */
CREATE OR REPLACE FUNCTION application_notification_context(p_application_id UUID)
RETURNS TABLE (
  applicant_id UUID,
  job_id UUID,
  job_title TEXT,
  conversation_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.applicant_id, a.job_id, j.title, a.conversation_id
  FROM job_applications a
  JOIN job_listings j ON j.id = a.job_id
  WHERE a.id = p_application_id
$$;

GRANT EXECUTE ON FUNCTION application_notification_context(UUID) TO only_horses_app;

-- ── 3. Organization owner ──────────────────────────────────────────────
/**
 * §13.4 lets a review name an organization as its subject, and the
 * notification has to reach a person. `org_members_select` shows a
 * membership list only to members, which is right — the roster is not public
 * — so this answers the one question the review path needs.
 */
CREATE OR REPLACE FUNCTION organization_owner(p_org_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT profile_id FROM organization_members
  WHERE organization_id = p_org_id AND role = 'owner'
  ORDER BY accepted_at NULLS LAST, invited_at
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION organization_owner(UUID) TO only_horses_app;
