-- ONLY HORSES · 0012 · functions and triggers (spec §7 "Triggers to implement")

-- ============================================================
-- 1. updated_at auto-touch on every table that has the column
-- ============================================================
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'updated_at'
      AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_touch BEFORE UPDATE ON %1$I
       FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', t);
  END LOOP;
END;
$$;

-- ============================================================
-- 2. listings.price_amount change -> listing_price_history
-- ============================================================
CREATE OR REPLACE FUNCTION log_listing_price_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.price_amount IS DISTINCT FROM OLD.price_amount
     OR NEW.price_currency IS DISTINCT FROM OLD.price_currency THEN
    INSERT INTO listing_price_history (listing_id, old_amount, new_amount, currency)
    VALUES (NEW.id, OLD.price_amount, NEW.price_amount, NEW.price_currency);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_listing_price_history
AFTER UPDATE OF price_amount, price_currency ON listings
FOR EACH ROW EXECUTE FUNCTION log_listing_price_change();

-- ============================================================
-- 3. listing sold -> transfer ownership on the horse record
--
-- The listing closes; the horse lives on with both owners in its history
-- (§2, §24.3). horses.status stays 'active' — a sold horse is still a
-- current horse, only the listing ends.
-- ============================================================
CREATE OR REPLACE FUNCTION transfer_horse_on_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_buyer_name TEXT;
BEGIN
  IF NEW.status = 'sold' AND OLD.status IS DISTINCT FROM 'sold'
     AND NEW.sold_to_profile_id IS NOT NULL THEN

    SELECT display_name INTO v_buyer_name
    FROM profiles WHERE id = NEW.sold_to_profile_id;

    -- Close the outgoing owner's tenure.
    UPDATE horse_ownership_history
    SET to_date = COALESCE(NEW.closed_at::date, CURRENT_DATE)
    WHERE horse_id = NEW.horse_id AND to_date IS NULL;

    -- Open the buyer's tenure, carrying the transaction for provenance.
    INSERT INTO horse_ownership_history (
      horse_id, owner_profile_id, owner_name_text, from_date,
      transfer_listing_id, transfer_price, transfer_currency, price_public, verified)
    VALUES (
      NEW.horse_id, NEW.sold_to_profile_id, v_buyer_name,
      COALESCE(NEW.closed_at::date, CURRENT_DATE),
      NEW.id, NEW.price_amount, NEW.price_currency, FALSE, TRUE);

    -- Edit rights move with ownership (§24.3).
    UPDATE horses
    SET owner_profile_id = NEW.sold_to_profile_id,
        owner_org_id     = NULL,
        status           = 'active',
        updated_at       = now()
    WHERE id = NEW.horse_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_transfer_horse_on_sale
AFTER UPDATE OF status ON listings
FOR EACH ROW EXECUTE FUNCTION transfer_horse_on_sale();

-- ============================================================
-- 4. search outbox enqueue (§11.4)
-- ============================================================
CREATE OR REPLACE FUNCTION enqueue_search_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_collection TEXT;
  v_row        RECORD;
  v_op         TEXT;
  v_listing_id UUID;
BEGIN
  v_row := COALESCE(NEW, OLD);

  v_collection := CASE TG_TABLE_NAME
    WHEN 'listings'         THEN 'listings'
    WHEN 'service_listings' THEN 'services'
    WHEN 'job_listings'     THEN 'jobs'
    WHEN 'profiles'         THEN 'professionals'
    ELSE NULL
  END;

  -- A horse edit changes denormalized fields (breed, age, height) inside the
  -- listing document, so we re-sync that horse's listings instead.
  IF TG_TABLE_NAME = 'horses' THEN
    FOR v_listing_id IN
      SELECT id FROM listings WHERE horse_id = v_row.id
    LOOP
      INSERT INTO search_outbox (collection, document_id, operation)
      VALUES ('listings', v_listing_id, 'upsert');
    END LOOP;
    RETURN NULL;
  END IF;

  IF v_collection IS NULL THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_op := 'delete';
  ELSE
    v_op := 'upsert';
  END IF;

  INSERT INTO search_outbox (collection, document_id, operation)
  VALUES (v_collection, v_row.id, v_op);

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_search_sync_listings
AFTER INSERT OR UPDATE OR DELETE ON listings
FOR EACH ROW EXECUTE FUNCTION enqueue_search_sync();

CREATE TRIGGER trg_search_sync_services
AFTER INSERT OR UPDATE OR DELETE ON service_listings
FOR EACH ROW EXECUTE FUNCTION enqueue_search_sync();

CREATE TRIGGER trg_search_sync_jobs
AFTER INSERT OR UPDATE OR DELETE ON job_listings
FOR EACH ROW EXECUTE FUNCTION enqueue_search_sync();

CREATE TRIGGER trg_search_sync_profiles
AFTER INSERT OR UPDATE OR DELETE ON profiles
FOR EACH ROW EXECUTE FUNCTION enqueue_search_sync();

CREATE TRIGGER trg_search_sync_horses
AFTER INSERT OR UPDATE OR DELETE ON horses
FOR EACH ROW EXECUTE FUNCTION enqueue_search_sync();

-- ============================================================
-- 5. trust_score recompute (§13.3)
--
-- Never set by hand (P4). Every component is derivable, so the UI can
-- explain the number back to the user.
-- ============================================================
CREATE OR REPLACE FUNCTION compute_trust_score(p_profile_id UUID)
RETURNS SMALLINT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_profile       profiles%ROWTYPE;
  v_score         NUMERIC := 0;
  v_review_count  INTEGER;
  v_review_avg    NUMERIC;
  v_upheld_recent INTEGER;
  v_upheld_total  INTEGER;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- The verification ladder is cumulative: reaching a level implies the
  -- levels below it (§14.1).
  IF v_profile.verification_level >= 'email_verified'    THEN v_score := v_score + 5;  END IF;
  IF v_profile.verification_level >= 'phone_verified'    THEN v_score := v_score + 10; END IF;
  IF v_profile.verification_level >= 'identity_verified' THEN v_score := v_score + 25; END IF;
  IF v_profile.verification_level >= 'professional_verified' THEN v_score := v_score + 15; END IF;

  -- Account age: 1 point per month, capped at 10.
  v_score := v_score + LEAST(10, FLOOR(EXTRACT(EPOCH FROM (now() - v_profile.created_at)) / 2592000));

  -- Verified reviews: average rating scaled by a volume factor, max 20.
  SELECT COUNT(*), AVG(rating) INTO v_review_count, v_review_avg
  FROM reviews
  WHERE subject_profile_id = p_profile_id
    AND is_hidden = FALSE
    AND is_verified_contact = TRUE;

  IF v_review_count > 0 THEN
    v_score := v_score + 20 * (v_review_avg / 5.0) * LEAST(v_review_count::numeric / 10.0, 1.0);
  END IF;

  -- Response rate (§13.5) needs at least 5 inquiries before it counts.
  IF v_profile.response_rate IS NOT NULL AND v_profile.response_rate >= 0.80 THEN
    v_score := v_score + 10;
  END IF;

  SELECT COUNT(*) INTO v_upheld_recent
  FROM moderation_cases
  WHERE subject_profile_id = p_profile_id
    AND is_upheld = TRUE
    AND resolved_at > now() - INTERVAL '12 months';

  IF v_upheld_recent = 0 THEN
    v_score := v_score + 5;
  END IF;

  SELECT COUNT(*) INTO v_upheld_total
  FROM moderation_cases
  WHERE subject_profile_id = p_profile_id AND is_upheld = TRUE;

  v_score := v_score - (20 * v_upheld_total);

  RETURN GREATEST(0, LEAST(100, ROUND(v_score)))::smallint;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_trust_score_from_review()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_subject UUID;
BEGIN
  v_subject := COALESCE(NEW.subject_profile_id, OLD.subject_profile_id);
  IF v_subject IS NOT NULL THEN
    UPDATE profiles
    SET trust_score = compute_trust_score(v_subject)
    WHERE id = v_subject;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_reviews_trust_score
AFTER INSERT OR UPDATE OR DELETE ON reviews
FOR EACH ROW EXECUTE FUNCTION refresh_trust_score_from_review();

-- ============================================================
-- Height conversion helper (§9.4) — cm is the only stored unit.
-- ============================================================
CREATE OR REPLACE FUNCTION cm_to_hands(p_cm NUMERIC)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN p_cm IS NULL THEN NULL ELSE
    FLOOR(p_cm / 10.16)::text || '.' ||
    ROUND((p_cm / 10.16 - FLOOR(p_cm / 10.16)) * 10)::text || ' hh'
  END
$$;
