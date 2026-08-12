# ADR-0004 — Keeping §8 RLS without PostgREST

**Status:** accepted · 2026-08-12
**Depends on:** ADR-0001

## Context

§8 requires RLS on every table, and §24.23 requires an automated test that
attempts cross-tenant reads on all sensitive tables and expects zero rows. The
policies are written against `auth.uid()`, which on Supabase resolves from the
JWT that PostgREST attaches to the connection.

On Cloud SQL there is no PostgREST. Every connection belongs to the API's
single service account, so a naive port would make `auth.uid()` return NULL and
silently turn every policy into "deny all" — or, worse, tempt us to drop RLS
and rely solely on application checks.

§4 is explicit that RLS is "a second line of defense, not the primary one", so
the goal is to keep it meaningful rather than to route reads through it.

## Decision

`auth.uid()` reads a session-local GUC instead of a PostgREST claim:

```sql
current_setting('request.jwt.claims', true)::jsonb ->> 'sub'
```

A NestJS interceptor opens a transaction per authenticated request and issues:

```sql
SET LOCAL request.jwt.claims = '{"sub":"<profile_id>","role":"authenticated"}';
```

`SET LOCAL` is scoped to the transaction, so a pooled connection cannot leak
one user's identity into the next request — it reverts on COMMIT or ROLLBACK
regardless of outcome.

## Consequences

The §8 policies are used **verbatim**. No policy in `0013_row_level_security.sql`
was rewritten for the platform change, which is the point: the security model
stays reviewable against the spec.

`db/tests/` can exercise policies on plain PostgreSQL by setting the GUC
directly, so §24.23 runs under Testcontainers with no Supabase dependency and
no network.

**The API must connect as a non-superuser role.** Table owners and superusers
bypass RLS. The migration runner connects as the owner; the application
connects as a dedicated `only_horses_app` role with no BYPASSRLS attribute.
Getting this wrong makes every policy inert while all tests still pass, so it
is asserted at boot: the API refuses to start if
`SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user` is true.

**Two tables carry RLS with zero policies**, which denies all non-superuser
access by design: `search_outbox` and `stripe_events`. Only the service role
touches them.
