-- ONLY HORSES · 0001 · extensions + auth schema
--
-- Spec §7 was written against Supabase, where `auth.users` and `auth.uid()`
-- ship with the platform. We run on Cloud SQL for PostgreSQL with Firebase
-- Auth as the identity provider (ADR-0001), so this migration creates those
-- objects itself:
--
--   auth.users  — local mirror of the Firebase user, keyed by firebase_uid.
--                 The API upserts a row on first authenticated request, which
--                 keeps `profiles.id -> auth.users(id)` a real foreign key.
--   auth.uid()  — reads the current request's subject from a session GUC. The
--                 NestJS request interceptor issues
--                 `SET LOCAL request.jwt.claims = '{"sub":"..."}'` on the
--                 transaction, so the §8 RLS policies work unchanged.
--
-- Everything is IF NOT EXISTS so the file is also safe on a Supabase project
-- and reproducible from scratch under Testcontainers (§24, §27).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firebase_uid       TEXT UNIQUE,
  email              CITEXT UNIQUE,
  phone              TEXT UNIQUE,
  email_confirmed_at TIMESTAMPTZ,
  phone_confirmed_at TIMESTAMPTZ,
  providers          TEXT[] NOT NULL DEFAULT '{}',
  app_metadata       JSONB NOT NULL DEFAULT '{}',
  user_metadata      JSONB NOT NULL DEFAULT '{}',
  last_sign_in_at    TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auth_users_firebase ON auth.users(firebase_uid);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    'anon'
  )
$$;
