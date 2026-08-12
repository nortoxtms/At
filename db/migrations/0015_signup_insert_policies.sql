-- ONLY HORSES · 0015 · insert policies for the signup path
--
-- §8 sketches SELECT and UPDATE policies for `profiles` but no INSERT, so
-- with RLS enabled nothing could create a profile row at all. The gap shows
-- up the first time a real user registers.
--
-- The fix keeps RLS strict rather than carving out an exemption: profile
-- provisioning runs inside a transaction whose `request.jwt.claims.sub` is
-- the id of the user being created (AuthService.provisionProfile), so
-- `id = auth.uid()` holds and a caller still cannot create a row for anyone
-- but themselves.
--
-- The auth.users row is written first and outside this scope: the `auth`
-- schema is not under RLS, and it is the identity mirror rather than user
-- data.

CREATE POLICY profiles_insert ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- Every account starts on the free tier (§16.1). Paid transitions are driven
-- by Stripe webhooks, which run as a system role and are not covered here.
CREATE POLICY subscriptions_insert ON subscriptions FOR INSERT
  WITH CHECK (profile_id = auth.uid());
