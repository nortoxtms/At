-- 0055 — a professional may submit evidence, not accept it.
--
-- 0054's write policy is scoped to the owner, which is right for creating and
-- editing a credential and wrong for one column: `verified_at`. §14.1 puts
-- that decision with staff, and an owner who can set it can award themselves
-- the professional rung — the exact claim buyers are meant to rely on.
--
-- There is no endpoint that would let them today. That is not the point: RLS
-- is the last line of defence precisely because it holds when a future
-- endpoint forgets (ADR-0004), and a policy that trusts "no route does this
-- yet" is a policy that fails the first time one does.

CREATE OR REPLACE FUNCTION credentials_guard_verification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF is_staff() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.verified_at IS NOT NULL OR NEW.verified_by IS NOT NULL THEN
      RAISE EXCEPTION 'Bir belgeyi yalnızca ekip doğrulayabilir.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.verified_by IS DISTINCT FROM OLD.verified_by THEN
    RAISE EXCEPTION 'Bir belgeyi yalnızca ekip doğrulayabilir.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER credentials_guard_verification
  BEFORE INSERT OR UPDATE ON credentials
  FOR EACH ROW EXECUTE FUNCTION credentials_guard_verification();
