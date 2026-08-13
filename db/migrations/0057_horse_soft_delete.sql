-- 0057 — archive a horse.
--
-- `DELETE /v1/horses/:id` is a soft delete: it sets `deleted_at` and moves the
-- status to archived, because §2 keeps the record. It answered 500 for every
-- caller, including the owner.
--
-- The cause is subtle and worth writing down, because the same shape will
-- recur anywhere a row hides itself. `horses_select` requires `deleted_at IS
-- NULL`; the moment the update sets it, the *new* row no longer satisfies the
-- table's own visibility rule, and Postgres refuses it as a row-level security
-- violation. The update is not unauthorised — the owner is allowed to write
-- this row — it is that the row it produces is one nobody may see.
--
-- Loosening `horses_select` to expose archived horses would be the wrong fix:
-- that policy is what keeps a deleted record out of search, out of a
-- profile, and out of anyone else's reach. So the write goes through a
-- function that re-checks the same ownership the UPDATE policy checks.

CREATE OR REPLACE FUNCTION archive_horse(p_actor UUID, p_horse UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID;
  v_org UUID;
BEGIN
  SELECT owner_profile_id, owner_org_id INTO v_owner, v_org
  FROM horses
  WHERE id = p_horse AND deleted_at IS NULL;

  IF v_owner IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_owner <> p_actor AND NOT EXISTS (
    SELECT 1 FROM organization_members m
    WHERE m.organization_id = v_org
      AND m.profile_id = p_actor
      AND m.role IN ('owner', 'admin')
  ) THEN
    RETURN FALSE;
  END IF;

  -- §5 already refuses this in the service when a live listing exists; the
  -- check is repeated here because the function is the last thing standing
  -- between a caller and the row, and a listing pointing at an archived horse
  -- is the state nothing downstream expects.
  IF EXISTS (
    SELECT 1 FROM listings
    WHERE horse_id = p_horse
      AND status IN ('active', 'pending_review', 'under_offer')
  ) THEN
    RETURN FALSE;
  END IF;

  UPDATE horses
     SET deleted_at = now(),
         status = 'archived'
   WHERE id = p_horse;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION archive_horse(UUID, UUID) TO only_horses_app;
