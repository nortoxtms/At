-- ONLY HORSES · 0014 · password hash column for the local identity provider
--
-- Identity is Firebase Auth in every deployed environment (ADR-0001), and
-- this column stays NULL there. It exists so the API can run and be tested
-- end to end without Firebase credentials — see LocalIdentityProvider. §27
-- requires integration tests on plain Postgres under Testcontainers, and a
-- test suite that cannot create a user cannot test anything above it.

ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS password_hash TEXT;

COMMENT ON COLUMN auth.users.password_hash IS
  'scrypt hash, populated only by LocalIdentityProvider in development and '
  'test. NULL in every environment backed by Firebase Auth.';
