-- ONLY HORSES · 0020 · uniqueness lookups that RLS cannot blind
--
-- `horses` carries three global unique constraints — slug, microchip_number
-- and ueln — but `horses_select` (§8) only exposes a caller's own horses and
-- those with an active listing. Any check written as an ordinary SELECT is
-- therefore blind to most of the table: it reports "free" for a slug that is
-- taken, and the insert then fails on the constraint with a 500.
--
-- The §18.2 S10 microchip flow makes this worse than a cosmetic bug. A chip
-- that is already registered is supposed to offer "Bu mikroçip numarası
-- kayıtlı. Sahiplik devri mi yapıyorsun?" — that prompt is unreachable if the
-- lookup cannot see the other owner's horse.
--
-- These SECURITY DEFINER functions answer exactly those two questions and
-- nothing more. They deliberately do not expose the row: `horse_slug_taken`
-- returns a boolean, and `find_horse_by_identifier` returns only what the
-- transfer prompt needs to name the horse and its current owner.

CREATE OR REPLACE FUNCTION horse_slug_taken(p_slug TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM horses WHERE slug = p_slug)
$$;

CREATE OR REPLACE FUNCTION find_horse_by_identifier(
  p_microchip TEXT,
  p_ueln TEXT,
  p_exclude_horse_id UUID DEFAULT NULL
)
RETURNS TABLE (
  horse_id UUID,
  horse_name TEXT,
  matched_on TEXT,
  owner_display_name TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.id,
         h.name,
         CASE WHEN p_microchip IS NOT NULL AND h.microchip_number = p_microchip
              THEN 'microchip' ELSE 'ueln' END,
         p.display_name
  FROM horses h
  LEFT JOIN profiles p ON p.id = h.owner_profile_id
  WHERE h.deleted_at IS NULL
    AND (p_exclude_horse_id IS NULL OR h.id <> p_exclude_horse_id)
    AND ((p_microchip IS NOT NULL AND h.microchip_number = p_microchip)
         OR (p_ueln IS NOT NULL AND h.ueln = p_ueln))
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION horse_slug_taken(TEXT) TO only_horses_app;
GRANT EXECUTE ON FUNCTION find_horse_by_identifier(TEXT, TEXT, UUID) TO only_horses_app;
