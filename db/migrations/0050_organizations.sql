-- ONLY HORSES · 0050 · organizations can now be created
--
-- §8 gives `organization_members` one write policy — `org_members_write`,
-- gated on already being an owner or admin of the organization. That is the
-- right rule and it has a bootstrap hole: the person creating an organization
-- is not yet a member of it, so nobody could ever insert the first row. The
-- same shape as `verifications` in 0045: a policy that is correct for every
-- case except the first one.
--
-- Creation is therefore one function that writes both rows together. It also
-- means an organization can never exist without an owner, which is what makes
-- `organizations_update` meaningful.

CREATE OR REPLACE FUNCTION create_organization(
  p_creator UUID,
  p_slug TEXT,
  p_name TEXT,
  p_type org_type,
  p_country CHAR(2),
  p_city TEXT,
  p_about TEXT
)
RETURNS TABLE (id UUID, slug TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM organizations o WHERE o.slug = p_slug) THEN
    RAISE EXCEPTION 'slug taken' USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO organizations (slug, name, type, country_code, city, about, created_by)
  VALUES (p_slug, p_name, p_type, p_country, p_city, p_about, p_creator)
  RETURNING organizations.id INTO v_id;

  INSERT INTO organization_members (organization_id, profile_id, role, accepted_at)
  VALUES (v_id, p_creator, 'owner', now());

  RETURN QUERY SELECT v_id, p_slug;
END;
$$;

GRANT EXECUTE ON FUNCTION create_organization(UUID, TEXT, TEXT, org_type, CHAR, TEXT, TEXT)
  TO only_horses_app;

/**
 * §12 POST /organizations/:id/members {email, role}.
 *
 * Invitation is by email because the person being invited may not have looked
 * at their profile handle in a year, and a stable owner adding their groom
 * knows their email address. Resolving it needs to read `auth.users`, which no
 * ordinary policy exposes — the lookup returns a membership or nothing, and
 * never reveals whether the address is registered.
 */
CREATE OR REPLACE FUNCTION invite_org_member(
  p_actor UUID,
  p_org_id UUID,
  p_email TEXT,
  p_role org_member_role
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_org_id AND profile_id = p_actor AND role IN ('owner','admin')
  ) THEN
    RAISE EXCEPTION 'not an organization admin';
  END IF;

  SELECT p.id INTO v_profile
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE u.email = lower(p_email) AND p.deleted_at IS NULL;

  IF v_profile IS NULL THEN RETURN NULL; END IF;

  INSERT INTO organization_members (organization_id, profile_id, role, invited_at)
  VALUES (p_org_id, v_profile, p_role, now())
  ON CONFLICT (organization_id, profile_id) DO UPDATE SET role = EXCLUDED.role;

  RETURN v_profile;
END;
$$;

GRANT EXECUTE ON FUNCTION invite_org_member(UUID, UUID, TEXT, org_member_role) TO only_horses_app;

/**
 * The public organization page (§19.1 `/ciftlik/[slug]`).
 *
 * `organizations_select` is already public for non-deleted rows, but the page
 * also needs counts and a rating that cross into tables scoped to other
 * people. Aggregates only — no member list, which is not public.
 */
CREATE OR REPLACE FUNCTION organization_page(p_slug TEXT)
RETURNS TABLE (
  id UUID,
  slug TEXT,
  name TEXT,
  type org_type,
  about TEXT,
  country_code CHAR(2),
  region TEXT,
  city TEXT,
  website TEXT,
  facilities TEXT[],
  disciplines TEXT[],
  stall_count INTEGER,
  verification_level verification_level,
  trust_score SMALLINT,
  logo_image TEXT,
  cover_image TEXT,
  member_count BIGINT,
  active_listings BIGINT,
  active_services BIGINT,
  active_jobs BIGINT,
  rating_average NUMERIC,
  rating_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.slug::text, o.name, o.type, o.about, o.country_code, o.region, o.city,
         o.website, o.facilities, o.disciplines, o.stall_count,
         o.verification_level, o.trust_score,
         logo.cf_image_id, cover.cf_image_id,
         (SELECT count(*) FROM organization_members m WHERE m.organization_id = o.id),
         (SELECT count(*) FROM listings l
           WHERE l.seller_org_id = o.id AND l.status IN ('active','under_offer')),
         (SELECT count(*) FROM service_listings s
           WHERE s.provider_org_id = o.id AND s.status = 'active'),
         (SELECT count(*) FROM job_listings j
           WHERE j.organization_id = o.id AND j.status = 'active'),
         r.average, r.total
  FROM organizations o
  LEFT JOIN media logo ON logo.id = o.logo_media_id
  LEFT JOIN media cover ON cover.id = o.cover_media_id
  LEFT JOIN LATERAL review_summary(NULL, o.id) r ON TRUE
  WHERE o.slug = p_slug AND o.deleted_at IS NULL
$$;

GRANT EXECUTE ON FUNCTION organization_page(TEXT) TO only_horses_app;

/**
 * §12 GET /search/suggest — typeahead across all entities.
 *
 * One query rather than four round trips, and deliberately narrow: it returns
 * a label, a type and a slug, which is all a suggestion row renders. Only
 * publicly visible rows are considered, so this cannot be used to probe for
 * drafts.
 */
CREATE OR REPLACE FUNCTION search_suggest(p_query TEXT, p_limit INTEGER DEFAULT 8)
RETURNS TABLE (kind TEXT, label TEXT, slug TEXT, sublabel TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH q AS (SELECT '%' || btrim(p_query) || '%' AS pattern)
  SELECT * FROM (
    SELECT 'listing'::text, l.title, l.slug::text, l.city
    FROM listings l, q
    WHERE l.status = 'active' AND l.title ILIKE q.pattern
    LIMIT p_limit
  ) listings
  UNION ALL
  SELECT * FROM (
    SELECT 'breed'::text, COALESCE(b.name_tr, b.name_en), b.code, b.group_code
    FROM breeds b, q
    WHERE COALESCE(b.name_tr, b.name_en) ILIKE q.pattern
    LIMIT p_limit
  ) breeds
  UNION ALL
  SELECT * FROM (
    SELECT 'service'::text, s.title, s.slug::text, s.city
    FROM service_listings s, q
    WHERE s.status = 'active' AND s.title ILIKE q.pattern
    LIMIT p_limit
  ) services
  UNION ALL
  SELECT * FROM (
    SELECT 'job'::text, j.title, j.slug::text, j.city
    FROM job_listings j, q
    WHERE j.status = 'active' AND j.title ILIKE q.pattern
    LIMIT p_limit
  ) jobs
  UNION ALL
  SELECT * FROM (
    SELECT 'professional'::text, p.display_name, p.handle::text, p.city
    FROM profiles p, q
    WHERE p.deleted_at IS NULL AND p.is_suspended = FALSE
      AND p.display_name ILIKE q.pattern
      AND EXISTS (SELECT 1 FROM role_profiles r WHERE r.profile_id = p.id AND r.is_public)
    LIMIT p_limit
  ) professionals
$$;

GRANT EXECUTE ON FUNCTION search_suggest(TEXT, INTEGER) TO only_horses_app;

/**
 * §12 GET /listings/similar/:id.
 *
 * Similarity is breed, then discipline overlap, then price proximity — the
 * three things a buyer actually substitutes between. Excludes the listing
 * itself and anything not currently for sale.
 */
CREATE OR REPLACE FUNCTION similar_listings(p_listing_id UUID, p_limit INTEGER DEFAULT 6)
RETURNS TABLE (id UUID, slug TEXT, title TEXT, price_amount NUMERIC, price_currency CHAR(3),
               city TEXT, cover_image TEXT, score INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH source AS (
    SELECT l.id, l.price_amount, l.country_code, h.breed_id, h.disciplines
    FROM listings l JOIN horses h ON h.id = l.horse_id
    WHERE l.id = p_listing_id
  )
  SELECT l.id, l.slug::text, l.title, l.price_amount, l.price_currency, l.city,
         cover.cf_image_id,
         ((CASE WHEN h.breed_id = s.breed_id THEN 3 ELSE 0 END)
          + (CASE WHEN h.disciplines && s.disciplines THEN 2 ELSE 0 END)
          + (CASE WHEN l.country_code = s.country_code THEN 1 ELSE 0 END)
          + (CASE WHEN s.price_amount IS NOT NULL AND l.price_amount IS NOT NULL
                   AND abs(l.price_amount - s.price_amount) <= s.price_amount * 0.35
                  THEN 2 ELSE 0 END))::int AS score
  FROM listings l
  JOIN horses h ON h.id = l.horse_id
  CROSS JOIN source s
  LEFT JOIN media cover ON cover.id = h.cover_media_id
  WHERE l.id <> s.id
    AND l.status IN ('active','under_offer')
    AND h.deleted_at IS NULL
  ORDER BY score DESC, l.published_at DESC
  LIMIT p_limit
$$;

GRANT EXECUTE ON FUNCTION similar_listings(UUID, INTEGER) TO only_horses_app;
