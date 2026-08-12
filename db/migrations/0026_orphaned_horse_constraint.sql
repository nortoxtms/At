-- ONLY HORSES · 0026 · let a horse outlive its owner's account
--
-- §7 gives `horses` two rules that cannot both hold:
--
--   owner_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL
--   CONSTRAINT horse_owner_present CHECK (owner_profile_id IS NOT NULL
--                                         OR owner_org_id IS NOT NULL)
--
-- Deleting a profile sets the column to NULL, and the check then rejects it —
-- so any account that has ever registered a horse can never be deleted. That
-- makes §24.14 unreachable: "Account deletion removes personal data within 30
-- days, anonymizes reviews, and retains horse records with `owner_name_text`
-- preserved for provenance."
--
-- The spec's own wording resolves it. An orphaned horse is a legitimate state:
-- the record survives, and provenance lives in `horse_ownership_history`,
-- where `owner_name_text` is retained precisely so a departed owner still
-- appears in the chain. What must not happen is a horse being *created*
-- without an owner, so the rule moves from the table to the insert path.

ALTER TABLE horses DROP CONSTRAINT IF EXISTS horse_owner_present;

ALTER TABLE horses ADD CONSTRAINT horse_owner_present CHECK (
  owner_profile_id IS NOT NULL
  OR owner_org_id IS NOT NULL
  -- Orphaned by an account deletion. `deleted_at` is not required: §24.14
  -- keeps the horse record itself, only the personal data goes.
  OR created_at < now()
);

COMMENT ON CONSTRAINT horse_owner_present ON horses IS
  'A horse must have an owner when created; it may lose one when the owning '
  'account is deleted (§24.14). Ownership at creation is enforced by the API '
  'and by horses_insert, not by this constraint — see migration 0026.';

-- What the constraint no longer guarantees, this trigger does: a horse cannot
-- be *inserted* without an owner.
CREATE OR REPLACE FUNCTION assert_horse_has_owner_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.owner_profile_id IS NULL AND NEW.owner_org_id IS NULL THEN
    RAISE EXCEPTION 'A horse must be created with an owner'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_horse_owner_on_insert
BEFORE INSERT ON horses
FOR EACH ROW EXECUTE FUNCTION assert_horse_has_owner_on_insert();
