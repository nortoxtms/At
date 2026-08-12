-- ONLY HORSES · cross-tenant RLS test (spec §24.23)
--
-- "RLS verified by an automated test that attempts cross-tenant reads on all
-- sensitive tables and expects zero rows."
--
-- Run as the application role, not the owner — a table owner bypasses RLS and
-- would make every assertion below pass vacuously (ADR-0004):
--
--   psql -U only_horses_app -d only_horses -v ON_ERROR_STOP=1 -f db/tests/rls.sql
--
-- Fixtures are created with RLS temporarily satisfied by acting as each owner
-- in turn, then the file switches to an unrelated third user and asserts that
-- nothing leaks. Rolls back at the end.

BEGIN;

DO $$
DECLARE
  v_alice   UUID;
  v_bob     UUID;
  v_mallory UUID;
  v_horse   UUID;
  v_leaked  INTEGER;
BEGIN
  -- ── fixtures (auth schema carries no RLS, so this is unscoped) ───────
  INSERT INTO auth.users (email) VALUES ('alice@test.local')   RETURNING id INTO v_alice;
  INSERT INTO auth.users (email) VALUES ('bob@test.local')     RETURNING id INTO v_bob;
  INSERT INTO auth.users (email) VALUES ('mallory@test.local') RETURNING id INTO v_mallory;

  -- Each profile is inserted while acting as itself, satisfying
  -- profiles_insert (migration 0015).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_alice)::text, true);
  INSERT INTO profiles (id, handle, display_name) VALUES (v_alice, 'alice', 'Alice');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_bob)::text, true);
  INSERT INTO profiles (id, handle, display_name) VALUES (v_bob, 'bob', 'Bob');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_mallory)::text, true);
  INSERT INTO profiles (id, handle, display_name) VALUES (v_mallory, 'mallory', 'Mallory');

  -- Alice owns a horse with a private health record and no active listing.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_alice)::text, true);

  INSERT INTO horses (slug, name, sex, owner_profile_id, created_by)
  VALUES ('alice-horse', 'Rüzgar', 'gelding', v_alice, v_alice)
  RETURNING id INTO v_horse;

  INSERT INTO horse_health_records (horse_id, type, title, performed_on, created_by)
  VALUES (v_horse, 'vaccination', 'Grip aşısı', CURRENT_DATE, v_alice);

  INSERT INTO saved_items (profile_id, item_type, item_id)
  VALUES (v_alice, 'horse', v_horse);

  INSERT INTO notifications (profile_id, type, title)
  VALUES (v_alice, 'message.new', 'Yeni mesaj');

  INSERT INTO device_tokens (profile_id, token, platform)
  VALUES (v_alice, 'alice-device-token', 'ios');

  -- ── now act as Mallory, who is unrelated to Alice ───────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_mallory)::text, true);

  -- §24.4: health records invisible to non-granted users on every surface.
  SELECT COUNT(*) INTO v_leaked FROM horse_health_records WHERE horse_id = v_horse;
  IF v_leaked <> 0 THEN
    RAISE EXCEPTION 'health records leaked to a non-granted user (% rows)', v_leaked;
  END IF;

  -- A horse with no active listing is private to its owner.
  SELECT COUNT(*) INTO v_leaked FROM horses WHERE id = v_horse;
  IF v_leaked <> 0 THEN
    RAISE EXCEPTION 'an unlisted horse leaked to a stranger';
  END IF;

  SELECT COUNT(*) INTO v_leaked FROM saved_items WHERE profile_id = v_alice;
  IF v_leaked <> 0 THEN
    RAISE EXCEPTION 'saved items leaked across tenants';
  END IF;

  SELECT COUNT(*) INTO v_leaked FROM notifications WHERE profile_id = v_alice;
  IF v_leaked <> 0 THEN
    RAISE EXCEPTION 'notifications leaked across tenants';
  END IF;

  SELECT COUNT(*) INTO v_leaked FROM device_tokens WHERE profile_id = v_alice;
  IF v_leaked <> 0 THEN
    RAISE EXCEPTION 'device tokens leaked across tenants';
  END IF;

  -- `search_outbox` is governed by GRANT rather than RLS (migration 0029):
  -- it is not row-owned, and the API is the only role that holds a grant. The
  -- property worth asserting is therefore not "no rows" — the API legitimately
  -- reads all of them — but that the table cannot leak anything personal in
  -- the first place.
  SELECT COUNT(*) INTO v_leaked
  FROM information_schema.columns
  WHERE table_name = 'search_outbox'
    AND column_name NOT IN ('id','collection','document_id','operation',
                            'attempts','last_error','processed_at','created_at');
  IF v_leaked <> 0 THEN
    RAISE EXCEPTION 'search_outbox gained % unexpected column(s); it must carry no personal data', v_leaked;
  END IF;

  SELECT COUNT(*) INTO v_leaked FROM moderation_cases;
  IF v_leaked <> 0 THEN
    RAISE EXCEPTION 'moderation cases are readable by a non-moderator';
  END IF;

  -- Mallory must not be able to write into Alice's stable either.
  BEGIN
    INSERT INTO horse_health_records (horse_id, type, title, performed_on, created_by)
    VALUES (v_horse, 'injury', 'Sahte kayıt', CURRENT_DATE, v_mallory);
    RAISE EXCEPTION 'a stranger wrote a health record on another user''s horse';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected
  END;

  BEGIN
    INSERT INTO profiles (id, handle, display_name)
    VALUES (v_bob, 'impostor', 'Impostor');
    RAISE EXCEPTION 'a user created a profile row for someone else';
  EXCEPTION WHEN insufficient_privilege OR unique_violation THEN
    NULL; -- expected
  END;

  -- ── the owner still sees their own data ─────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_alice)::text, true);

  SELECT COUNT(*) INTO v_leaked FROM horse_health_records WHERE horse_id = v_horse;
  IF v_leaked <> 1 THEN
    RAISE EXCEPTION 'the owner cannot read their own health records (% rows)', v_leaked;
  END IF;

  -- ── a granted buyer sees the health file, and only while granted ─────
  -- §2: the buyer requests, the owner approves. The policies encode exactly
  -- that split — a buyer may insert their own request but not approve it.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_bob)::text, true);
  INSERT INTO horse_access_grants (horse_id, grantee_id, scope, status)
  VALUES (v_horse, v_bob, ARRAY['health'], 'requested');

  -- Bob cannot approve his own request.
  UPDATE horse_access_grants SET status = 'granted'
  WHERE horse_id = v_horse AND grantee_id = v_bob;

  SELECT COUNT(*) INTO v_leaked FROM horse_health_records WHERE horse_id = v_horse;
  IF v_leaked <> 0 THEN
    RAISE EXCEPTION 'a buyer approved their own access request';
  END IF;

  -- The owner approves it.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_alice)::text, true);
  UPDATE horse_access_grants SET status = 'granted', decided_at = now()
  WHERE horse_id = v_horse AND grantee_id = v_bob;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_bob)::text, true);

  SELECT COUNT(*) INTO v_leaked FROM horse_health_records WHERE horse_id = v_horse;
  IF v_leaked <> 1 THEN
    RAISE EXCEPTION 'a granted user cannot read the health file (% rows)', v_leaked;
  END IF;

  -- An expired grant stops working without anyone revoking it.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_alice)::text, true);
  UPDATE horse_access_grants SET expires_at = now() - INTERVAL '1 day'
  WHERE horse_id = v_horse AND grantee_id = v_bob;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_bob)::text, true);
  SELECT COUNT(*) INTO v_leaked FROM horse_health_records WHERE horse_id = v_horse;
  IF v_leaked <> 0 THEN
    RAISE EXCEPTION 'an expired grant still reads the health file';
  END IF;

  RAISE NOTICE 'RLS cross-tenant test: all checks passed';
END;
$$;

ROLLBACK;
