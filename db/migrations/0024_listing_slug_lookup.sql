-- ONLY HORSES · 0024 · listing slug uniqueness lookup
--
-- Same shape as migration 0020 and for the same reason: `listings.slug` is
-- globally unique, but `listings_select` (§8) hides drafts and other sellers'
-- listings, so an ordinary SELECT reports a taken slug as free and the insert
-- then fails on the constraint.

CREATE OR REPLACE FUNCTION listing_slug_taken(p_slug TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM listings WHERE slug = p_slug)
$$;

GRANT EXECUTE ON FUNCTION listing_slug_taken(TEXT) TO only_horses_app;
