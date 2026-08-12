-- ONLY HORSES · 0021 · narrow system lookups for the media pipeline
--
-- Two operations in §10.1 are legitimately cross-tenant and cannot be
-- expressed as a user-scoped query:
--
--   · The §14.2 `phash_duplicate_other_owner` check exists precisely to
--     compare a new upload against *other accounts'* media. `media_select`
--     hides those rows, so the check would never fire — the anti-fraud
--     control most likely to catch a horse-sale scam would be silently dead.
--
--   · Opening the resulting moderation case writes to a table that only
--     staff may touch, from a request made by an ordinary user.
--
-- Both are exposed as SECURITY DEFINER functions rather than by loosening the
-- policies, so the widened access is limited to these two shapes and is
-- reviewable in one place.

/**
 * Candidate rows for perceptual-hash comparison. Returns only the fields the
 * comparison needs — never the storage key, the filename, or anything that
 * would let a caller enumerate another account's library.
 */
CREATE OR REPLACE FUNCTION list_phash_candidates(
  p_exclude_owner UUID,
  p_exclude_media UUID,
  p_limit INTEGER DEFAULT 5000
)
RETURNS TABLE (id UUID, phash TEXT, owner_profile_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.phash, m.owner_profile_id
  FROM media m
  WHERE m.phash IS NOT NULL
    AND m.status = 'ready'
    AND m.owner_profile_id <> p_exclude_owner
    AND m.id <> p_exclude_media
  ORDER BY m.created_at DESC
  LIMIT p_limit
$$;

/**
 * Opens a moderation case. Called from ordinary user requests when an
 * automated signal fires (§14.2), which is why it runs as the owner.
 */
CREATE OR REPLACE FUNCTION open_moderation_case(
  p_target_type TEXT,
  p_target_id UUID,
  p_severity SMALLINT,
  p_signals JSONB,
  p_subject_profile_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case_id UUID;
BEGIN
  INSERT INTO moderation_cases (target_type, target_id, severity, signals, subject_profile_id)
  VALUES (p_target_type, p_target_id, p_severity, p_signals, p_subject_profile_id)
  RETURNING id INTO v_case_id;

  RETURN v_case_id;
END;
$$;

GRANT EXECUTE ON FUNCTION list_phash_candidates(UUID, UUID, INTEGER) TO only_horses_app;
GRANT EXECUTE ON FUNCTION open_moderation_case(TEXT, UUID, SMALLINT, JSONB, UUID) TO only_horses_app;
