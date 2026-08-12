-- ONLY HORSES · schema smoke test
--
-- Exercises the §7 triggers and the §13.3 scoring function against a real
-- database. Run with:  psql -d only_horses -v ON_ERROR_STOP=1 -f db/tests/smoke.sql
-- Every check raises an exception on failure, so a clean exit means a pass.
-- The whole file runs in one transaction and rolls back — no rows survive.

BEGIN;

DO $$
DECLARE
  v_seller  UUID;
  v_buyer   UUID;
  v_horse   UUID;
  v_listing UUID;
  v_owner   UUID;
  v_rows    INTEGER;
  v_score   SMALLINT;
  v_outbox  INTEGER;
BEGIN
  -- ── fixtures ────────────────────────────────────────────────────────
  INSERT INTO auth.users (email) VALUES ('seller@test.local') RETURNING id INTO v_seller;
  INSERT INTO auth.users (email) VALUES ('buyer@test.local')  RETURNING id INTO v_buyer;

  INSERT INTO profiles (id, handle, display_name, verification_level, created_at)
  VALUES (v_seller, 'seller', 'Ayşe Satıcı', 'identity_verified', now() - INTERVAL '8 months');
  INSERT INTO profiles (id, handle, display_name, verification_level)
  VALUES (v_buyer, 'buyer', 'Mehmet Alıcı', 'identity_verified');

  INSERT INTO horses (slug, name, sex, breed_id, height_cm, owner_profile_id, created_by)
  VALUES ('luna-test', 'Luna', 'mare', 'arabian', 155.0, v_seller, v_seller)
  RETURNING id INTO v_horse;

  INSERT INTO horse_ownership_history (horse_id, owner_profile_id, owner_name_text, from_date)
  VALUES (v_horse, v_seller, 'Ayşe Satıcı', CURRENT_DATE - 400);

  INSERT INTO listings (slug, horse_id, seller_profile_id, type, status, title,
                        price_amount, price_currency, country_code, published_at)
  VALUES ('luna-satilik', v_horse, v_seller, 'sale', 'active', 'Luna — Arap kısrak',
          12000, 'EUR', 'TR', now())
  RETURNING id INTO v_listing;

  -- ── trigger 2: price change writes history (§7) ─────────────────────
  UPDATE listings SET price_amount = 10500 WHERE id = v_listing;

  SELECT COUNT(*) INTO v_rows FROM listing_price_history WHERE listing_id = v_listing;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'price history: expected 1 row, got %', v_rows;
  END IF;

  SELECT COUNT(*) INTO v_rows FROM listing_price_history
  WHERE listing_id = v_listing AND old_amount = 12000 AND new_amount = 10500;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'price history: old/new amounts not recorded';
  END IF;

  -- ── uq_one_active_listing_per_horse (§7) ────────────────────────────
  BEGIN
    INSERT INTO listings (slug, horse_id, seller_profile_id, type, status, title,
                          price_currency, country_code)
    VALUES ('luna-ikinci', v_horse, v_seller, 'lease', 'active', 'İkinci ilan', 'EUR', 'TR');
    RAISE EXCEPTION 'a horse accepted two active listings';
  EXCEPTION WHEN unique_violation THEN
    NULL; -- expected
  END;

  -- ── trigger 3: sale transfers ownership (§24.3) ─────────────────────
  UPDATE listings
  SET status = 'sold', sold_to_profile_id = v_buyer,
      closed_at = now(), closed_reason = 'sold_on_platform'
  WHERE id = v_listing;

  SELECT owner_profile_id INTO v_owner FROM horses WHERE id = v_horse;
  IF v_owner <> v_buyer THEN
    RAISE EXCEPTION 'sale did not move ownership to the buyer';
  END IF;

  -- The horse record survives the sale with both owners on file.
  SELECT COUNT(*) INTO v_rows FROM horse_ownership_history WHERE horse_id = v_horse;
  IF v_rows <> 2 THEN
    RAISE EXCEPTION 'ownership history: expected 2 rows, got %', v_rows;
  END IF;

  SELECT COUNT(*) INTO v_rows FROM horse_ownership_history
  WHERE horse_id = v_horse AND owner_profile_id = v_seller AND to_date IS NOT NULL;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'the previous owner tenure was not closed';
  END IF;

  SELECT COUNT(*) INTO v_rows FROM horse_ownership_history
  WHERE horse_id = v_horse AND owner_profile_id = v_buyer
    AND to_date IS NULL AND transfer_listing_id = v_listing;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'the buyer tenure was not opened against the listing';
  END IF;

  -- ── trigger 4: search outbox (§11.4) ────────────────────────────────
  SELECT COUNT(*) INTO v_outbox FROM search_outbox
  WHERE collection = 'listings' AND document_id = v_listing;
  IF v_outbox < 1 THEN
    RAISE EXCEPTION 'listing changes did not reach the search outbox';
  END IF;

  -- A horse edit re-syncs that horse's listings, not a "horses" collection.
  DELETE FROM search_outbox;
  UPDATE horses SET color = 'kula' WHERE id = v_horse;
  SELECT COUNT(*) INTO v_outbox FROM search_outbox
  WHERE collection = 'listings' AND document_id = v_listing;
  IF v_outbox < 1 THEN
    RAISE EXCEPTION 'a horse edit did not re-sync its listing';
  END IF;

  -- ── trigger 5 + §13.3: trust score ──────────────────────────────────
  -- Seller: identity_verified (5+10+25) + 8 months age (8) + no upheld
  -- moderation (5) = 53, before any reviews.
  v_score := compute_trust_score(v_seller);
  IF v_score <> 53 THEN
    RAISE EXCEPTION 'trust score: expected 53 for a verified 8-month account, got %', v_score;
  END IF;

  INSERT INTO conversations (stream_channel_id, context_type, context_id, created_by)
  VALUES ('test-channel', 'listing', v_listing, v_buyer);

  INSERT INTO reviews (author_id, subject_type, subject_profile_id, conversation_id,
                       rating, is_verified_contact)
  SELECT v_buyer, 'user', v_seller, id, 5, TRUE FROM conversations WHERE stream_channel_id = 'test-channel';

  -- The insert trigger writes the new score straight onto the profile.
  SELECT trust_score INTO v_score FROM profiles WHERE id = v_seller;
  -- +20 * (5/5) * (1/10) = +2
  IF v_score <> 55 THEN
    RAISE EXCEPTION 'trust score after a 5-star verified review: expected 55, got %', v_score;
  END IF;

  -- An upheld moderation action costs 20 and forfeits the clean-record 5.
  INSERT INTO moderation_cases (target_type, target_id, subject_profile_id, status,
                                is_upheld, resolved_at, action_taken)
  VALUES ('listing', v_listing, v_seller, 'actioned', TRUE, now(), 'removed');

  v_score := compute_trust_score(v_seller);
  IF v_score <> 30 THEN
    RAISE EXCEPTION 'trust score after an upheld action: expected 30, got %', v_score;
  END IF;

  -- ── §9.4 unit conversion ────────────────────────────────────────────
  IF cm_to_hands(165.0) <> '16.2 hh' THEN
    RAISE EXCEPTION '165 cm should render as 16.2 hh, got %', cm_to_hands(165.0);
  END IF;

  -- ── trigger 1: updated_at auto-touch ────────────────────────────────
  -- now() is the transaction timestamp and does not advance inside this
  -- block, so backdate the column first and check the trigger pulls it
  -- forward on the next write.
  UPDATE horses SET updated_at = now() - INTERVAL '1 day' WHERE id = v_horse;
  UPDATE horses SET color = 'doru' WHERE id = v_horse;

  SELECT COUNT(*) INTO v_rows FROM horses
  WHERE id = v_horse AND updated_at = now();
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'updated_at was not touched on update';
  END IF;

  RAISE NOTICE 'schema smoke test: all checks passed';
END;
$$;

ROLLBACK;
