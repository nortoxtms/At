-- 0054 — let a professional add their own credentials.
--
-- `credentials` shipped with a SELECT policy and nothing else. Under RLS that
-- is not "read-only", it is "the owner can look at rows they can never
-- create": every POST /v1/me/roles/:roleId/credentials failed with "new row
-- violates row-level security policy" and answered 500. §14.1's professional
-- rung is evidence-based — a certificate, a registration number, a reference —
-- and none of it could be submitted.
--
-- The same omission has now appeared three times in this schema (verifications
-- in M5, purchases in M4, here), and the shape is always the same: a SELECT
-- policy written when the table was for reading, and a write path added later
-- against a table that silently refuses it. `role_profiles` next door has an
-- ALL policy, which is why adding a role worked and adding its evidence did
-- not.

CREATE POLICY credentials_write ON credentials
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM role_profiles rp
      WHERE rp.id = credentials.role_profile_id AND rp.profile_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM role_profiles rp
      WHERE rp.id = credentials.role_profile_id AND rp.profile_id = auth.uid()
    )
  );

-- Only staff decide whether a credential is verified (§14.1): a professional
-- may submit evidence and may not mark their own evidence accepted.
CREATE POLICY credentials_staff ON credentials
  FOR ALL
  USING (is_staff())
  WITH CHECK (is_staff());
