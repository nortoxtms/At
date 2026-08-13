-- ONLY HORSES · 0035 · a buyer may ask again
--
-- §2's flow lets a buyer request the health file, the owner decide, and — if
-- circumstances change — the buyer ask again. The last step had no policy:
-- `grants_update` requires horse edit rights, so re-requesting after a denial,
-- a revocation or an expiry failed for the only person who would ever do it.
--
-- The permission is deliberately narrow. The grantee may move their own row
-- from a terminal state back to 'requested' and to nothing else, so this
-- cannot become a path to self-approval — which db/tests/rls.sql asserts
-- separately and must keep asserting.

CREATE POLICY grants_reopen ON horse_access_grants FOR UPDATE
  USING (
    grantee_id = auth.uid()
    AND status IN ('denied', 'revoked', 'expired')
  )
  WITH CHECK (
    grantee_id = auth.uid()
    AND status = 'requested'
    -- An owner decision is recorded on the row it belongs to; re-asking must
    -- not carry the previous answer forward.
    AND decided_at IS NULL
    AND expires_at IS NULL
  );
