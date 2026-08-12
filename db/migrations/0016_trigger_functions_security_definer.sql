-- ONLY HORSES · 0016 · trigger functions run as owner
--
-- Trigger functions default to SECURITY INVOKER, so they execute with the
-- privileges — and the RLS policies — of whoever fired them. That is wrong for
-- every trigger in §7: they enforce system invariants, not user intent.
--
-- Concretely, before this migration:
--   · creating a profile failed, because the §11.4 search-outbox trigger tried
--     to write to `search_outbox`, which carries RLS with no policies by design
--   · a buyer leaving a review could not update the seller's trust score,
--     because `profiles_update` only lets a user update their own row
--   · closing a sale could not write `horse_ownership_history`, which has no
--     INSERT policy
--
-- The invariants must hold no matter who triggered them, so the functions are
-- recreated as SECURITY DEFINER with `search_path` pinned to keep a hostile
-- search_path from redirecting them.

CREATE OR REPLACE FUNCTION enqueue_search_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION refresh_trust_score_from_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION transfer_horse_on_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buyer_name TEXT;
BEGIN
  IF NEW.status = 'sold' AND OLD.status IS DISTINCT FROM 'sold'
     AND NEW.sold_to_profile_id IS NOT NULL THEN

    SELECT display_name INTO v_buyer_name
    FROM profiles WHERE id = NEW.sold_to_profile_id;

    UPDATE horse_ownership_history
    SET to_date = COALESCE(NEW.closed_at::date, CURRENT_DATE)
    WHERE horse_id = NEW.horse_id AND to_date IS NULL;

    INSERT INTO horse_ownership_history (
      horse_id, owner_profile_id, owner_name_text, from_date,
      transfer_listing_id, transfer_price, transfer_currency, price_public, verified)
    VALUES (
      NEW.horse_id, NEW.sold_to_profile_id, v_buyer_name,
      COALESCE(NEW.closed_at::date, CURRENT_DATE),
      NEW.id, NEW.price_amount, NEW.price_currency, FALSE, TRUE);

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

CREATE OR REPLACE FUNCTION log_listing_price_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
