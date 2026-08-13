-- 0056 — hand a horse to its new owner.
--
-- §2 makes the horse record permanent and its owner temporary, and §24.3
-- requires the record to survive a sale. The transfer endpoint implemented
-- exactly that and then failed at the last statement: `UPDATE horses SET
-- owner_profile_id = <someone else>` is a row the outgoing owner is no longer
-- allowed to see, so the WITH CHECK on `horses_write` refused it and the API
-- answered 500. Ownership transfer — the operation the whole data model is
-- built around — has never worked.
--
-- The fix is not to loosen the policy. "An owner may write a horse row that
-- belongs to somebody else" is precisely the rule worth keeping; what is
-- needed is one narrow exception that checks the same thing the policy would
-- have, and moves the row in a single statement.

CREATE OR REPLACE FUNCTION transfer_horse_ownership(
  p_actor UUID,
  p_horse UUID,
  p_to UUID
)
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
  FROM horses WHERE id = p_horse;

  IF v_owner IS NULL THEN
    RETURN FALSE;
  END IF;

  -- The same authorisation the policy enforces: the owner, or an admin of the
  -- organisation that owns it. Staff are deliberately not included — moving a
  -- horse between accounts is not a moderation action.
  IF v_owner <> p_actor AND NOT EXISTS (
    SELECT 1 FROM organization_members m
    WHERE m.organization_id = v_org
      AND m.profile_id = p_actor
      AND m.role IN ('owner', 'admin')
  ) THEN
    RETURN FALSE;
  END IF;

  IF p_to = v_owner THEN
    RETURN FALSE;
  END IF;

  UPDATE horses
     SET owner_profile_id = p_to,
         owner_org_id = NULL
   WHERE id = p_horse;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION transfer_horse_ownership(UUID, UUID, UUID) TO only_horses_app;
