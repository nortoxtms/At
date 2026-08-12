-- ONLY HORSES · 0017 · the application role
--
-- ADR-0004 requires the API to connect as a role that does NOT bypass RLS,
-- and the API asserts this at boot. Creating that role by hand is exactly the
-- kind of setup step that gets skipped on a fresh environment — and skipping
-- it makes every §8 policy inert while all tests still pass. So it belongs in
-- the migrations, where `--reset` cannot lose it.
--
-- No password is set here: §24.24 forbids secrets in the repository. Local
-- development uses trust auth, and Cloud SQL uses IAM database authentication.
-- Set a password out of band if a deployment needs one:
--   ALTER ROLE only_horses_app WITH PASSWORD '...';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'only_horses_app') THEN
    -- NOSUPERUSER / NOBYPASSRLS are the defaults, but stating them makes the
    -- intent reviewable rather than implied.
    CREATE ROLE only_horses_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END;
$$;

GRANT USAGE ON SCHEMA public, auth TO only_horses_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO only_horses_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO only_horses_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO only_horses_app;

-- Tables added by later migrations inherit the same grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO only_horses_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO only_horses_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO only_horses_app;

-- The application must never read the migration ledger or the system tables
-- that carry no policies; RLS covers the latter, and this covers the former.
REVOKE ALL ON schema_migrations FROM only_horses_app;
