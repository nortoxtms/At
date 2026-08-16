-- ── Buying, not just listing ──────────────────────────────────────────────
--
-- The product marketplace (0058) could be sold *into* and not bought *from*:
-- a buyer's only action was "message the seller", and everything after that
-- happened somewhere this system could not see. That is a classifieds board,
-- and it is fine for a horse — §16.3 rules out escrow and held funds for horse
-- sales, and a 240 000 ₺ animal is not bought with a card in a hurry.
--
-- An object is different. A bit, a rug, a sack of feed: the buyer wants to
-- press a button, and the seller wants to know it is sold before they post it.
-- So products get an order, and the order carries the money.
--
-- Scoped deliberately to products. `listings` — the horse side — is untouched
-- and stays a classifieds board, because that is what §16.3 says it must be.

/**
 * The order lifecycle.
 *
 * Two states before money and two after, and the split is the point: the seller
 * confirms availability first, because the alternative is taking a buyer's card
 * for a saddle that sold last week and then owing them a refund.
 *
 * `completed` is the buyer's confirmation, not the seller's. A seller who could
 * mark their own sale complete is a seller who can close a dispute they are a
 * party to.
 */
CREATE TYPE order_status AS ENUM (
  'pending_seller',
  'awaiting_payment',
  'paid',
  'shipped',
  'completed',
  'cancelled',
  'refunded'
);

/**
 * Where the money is, tracked separately from where the order is.
 *
 * They diverge in exactly the case that matters: a `cancelled` order with
 * `payment_status = 'paid'` is the one that owes somebody money, and folding
 * the two into a single column is how that row becomes invisible.
 */
CREATE TYPE order_payment_status AS ENUM (
  'none',
  'pending',
  'paid',
  'refunded',
  'failed'
);

CREATE TABLE product_orders (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- What both sides quote at each other in a message. A UUID is not something
  -- anyone reads down a phone.
  reference          TEXT UNIQUE NOT NULL,

  product_id         UUID NOT NULL REFERENCES product_listings(id) ON DELETE RESTRICT,
  seller_profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  buyer_profile_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,

  quantity           INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),

  /*
   * A price snapshot, not a join.
   *
   * The seller may edit the listing tomorrow and close it next week, and an
   * order that reprices itself when they do is an order neither side can
   * argue from. `ON DELETE RESTRICT` above stops the product vanishing under
   * a live order; the title is copied anyway so a closed listing still renders
   * in the buyer's history.
   */
  title_snapshot     TEXT NOT NULL,
  unit_price_amount  NUMERIC(12,2) NOT NULL CHECK (unit_price_amount >= 0),
  price_unit         TEXT,
  currency           CHAR(3) NOT NULL DEFAULT 'TRY',
  shipping_fee       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (shipping_fee >= 0),
  /*
   * §16.3 says no transaction fees, and the default holds it at zero. The
   * column exists because the alternative — adding it the day a commission is
   * introduced — means a migration over live orders whose totals were computed
   * without it, and no way to tell which was which.
   */
  platform_fee       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),
  total_amount       NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),

  delivery           product_delivery NOT NULL,
  -- Collected only for shipping; a pickup order has nowhere to post to.
  ship_to_name       TEXT,
  ship_to_phone      TEXT,
  ship_to_line1      TEXT,
  ship_to_city       TEXT,
  ship_to_region     TEXT,
  ship_to_postcode   TEXT,
  buyer_note         TEXT,

  status             order_status NOT NULL DEFAULT 'pending_seller',
  payment_status     order_payment_status NOT NULL DEFAULT 'none',
  payment_provider   TEXT,
  payment_reference  TEXT,

  paid_at            TIMESTAMPTZ,
  shipped_at         TIMESTAMPTZ,
  tracking_note      TEXT,
  completed_at       TIMESTAMPTZ,
  cancelled_at       TIMESTAMPTZ,
  cancel_reason      TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Buying your own listing is not a transaction, it is a mistake or a way to
  -- manufacture a sales record.
  CONSTRAINT product_orders_distinct_parties CHECK (buyer_profile_id <> seller_profile_id),
  -- Shipping needs somewhere to ship to. Enforced here rather than only in the
  -- API because an order with no address is unfulfillable and unfixable.
  CONSTRAINT product_orders_shipping_has_address CHECK (
    delivery <> 'shipping' OR (ship_to_line1 IS NOT NULL AND ship_to_city IS NOT NULL)
  )
);

CREATE INDEX idx_product_orders_buyer  ON product_orders (buyer_profile_id, created_at DESC);
CREATE INDEX idx_product_orders_seller ON product_orders (seller_profile_id, created_at DESC);
CREATE INDEX idx_product_orders_product ON product_orders (product_id, created_at DESC);
-- The seller's "needs my attention" query, which runs on every dashboard load.
CREATE INDEX idx_product_orders_open ON product_orders (seller_profile_id, status)
  WHERE status IN ('pending_seller', 'paid');

CREATE TRIGGER trg_product_orders_updated_at
  BEFORE UPDATE ON product_orders
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── stock can now reach zero ──────────────────────────────────────────────
--
-- 0058 wrote `CHECK (quantity >= 1)`, which was right when nothing consumed
-- stock: a listing offering zero of something is a listing that should not be
-- up. Now that paying decrements it, the last unit selling has to be
-- representable, and `>= 1` makes the final `pay_product_order` fail on a
-- constraint instead of completing the sale.
--
-- Zero units and `status = 'sold'` are set in the same statement, so the state
-- the old constraint was protecting against — a live listing with nothing
-- behind it — still cannot occur.
ALTER TABLE product_listings DROP CONSTRAINT IF EXISTS product_listings_quantity_check;
ALTER TABLE product_listings ADD CONSTRAINT product_listings_quantity_check
  CHECK (quantity >= 0);

-- ── RLS ───────────────────────────────────────────────────────────────────
--
-- Both a SELECT policy and write policies, which this schema has got wrong
-- five times: a table given only a SELECT policy, with a write path added
-- later that the table then silently refuses.
--
-- An order has two owners. Either party may read it; the buyer creates it; and
-- both update it, because the transitions are split between them. *Which*
-- transition each may make is the API's job (`OrdersService.TRANSITIONS`) —
-- RLS decides whose row, not which verb, exactly as it does for listings.

ALTER TABLE product_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_orders_select ON product_orders FOR SELECT USING (
  buyer_profile_id = auth.uid() OR seller_profile_id = auth.uid() OR is_staff()
);

CREATE POLICY product_orders_insert ON product_orders FOR INSERT
  WITH CHECK (buyer_profile_id = auth.uid());

CREATE POLICY product_orders_update ON product_orders FOR UPDATE
  USING (buyer_profile_id = auth.uid() OR seller_profile_id = auth.uid() OR is_staff())
  WITH CHECK (buyer_profile_id = auth.uid() OR seller_profile_id = auth.uid() OR is_staff());

-- ── placing an order ──────────────────────────────────────────────────────
/**
 * Create an order from a live listing, at the listing's own price.
 *
 * SECURITY DEFINER, and the reason is the price rather than the insert: taking
 * the amount from the request would let a buyer name their own total, and
 * every check the API could add would be a check on client input. The price is
 * read here, from the row, in the same statement that writes the order.
 *
 * Availability is re-checked inside the function rather than before it. Two
 * buyers pressing the last unit at the same moment both pass a check made a
 * moment earlier; `FOR UPDATE` serialises them so the second one is told.
 */
CREATE OR REPLACE FUNCTION place_product_order(
  p_product_id  UUID,
  p_buyer_id    UUID,
  p_quantity    INTEGER,
  p_ship_name   TEXT,
  p_ship_phone  TEXT,
  p_ship_line1  TEXT,
  p_ship_city   TEXT,
  p_ship_region TEXT,
  p_ship_post   TEXT,
  p_note        TEXT
)
RETURNS TABLE (id UUID, reference TEXT, total NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product   RECORD;
  v_reference TEXT;
  v_total     NUMERIC(12,2);
  v_id        UUID;
BEGIN
  SELECT * INTO v_product
    FROM product_listings
   WHERE product_listings.id = p_product_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_product.status <> 'active' THEN
    RAISE EXCEPTION 'PRODUCT_NOT_AVAILABLE' USING ERRCODE = 'check_violation';
  END IF;

  IF v_product.seller_profile_id = p_buyer_id THEN
    RAISE EXCEPTION 'CANNOT_BUY_OWN_PRODUCT' USING ERRCODE = 'check_violation';
  END IF;

  IF p_quantity < 1 OR p_quantity > v_product.quantity THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE = 'check_violation';
  END IF;

  -- "Fiyat sorunuz" has no number to charge. Those listings keep the message
  -- button and nothing else, and the API refuses before it gets here; this is
  -- the second lock.
  IF v_product.price_amount IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_HAS_NO_PRICE' USING ERRCODE = 'check_violation';
  END IF;

  v_total := v_product.price_amount * p_quantity;

  -- Short, unambiguous, and not sequential — a running number tells every
  -- buyer how many orders the platform has ever taken.
  v_reference := 'OH-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  INSERT INTO product_orders (
    reference, product_id, seller_profile_id, buyer_profile_id, quantity,
    title_snapshot, unit_price_amount, price_unit, currency,
    shipping_fee, platform_fee, total_amount,
    delivery, ship_to_name, ship_to_phone, ship_to_line1, ship_to_city,
    ship_to_region, ship_to_postcode, buyer_note
  ) VALUES (
    v_reference, p_product_id, v_product.seller_profile_id, p_buyer_id, p_quantity,
    v_product.title, v_product.price_amount, v_product.price_unit, v_product.price_currency,
    0, 0, v_total,
    v_product.delivery, p_ship_name, p_ship_phone, p_ship_line1, p_ship_city,
    p_ship_region, p_ship_post, p_note
  )
  RETURNING product_orders.id INTO v_id;

  -- §22 counts enquiries; an order is the strongest one there is.
  UPDATE product_listings
     SET inquiry_count = inquiry_count + 1
   WHERE product_listings.id = p_product_id;

  RETURN QUERY SELECT v_id, v_reference, v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION place_product_order(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO only_horses_app;

-- ── paying for it ─────────────────────────────────────────────────────────
/**
 * Mark an order paid and take the stock with it.
 *
 * SECURITY DEFINER because of the stock: `products_write` is seller-only, so a
 * buyer cannot decrement `quantity` on the listing they just bought from. That
 * is the RLS behaving correctly, and it is exactly why this is a function
 * rather than two statements in the service.
 *
 * The listing closes when the last unit goes. A marketplace whose top result
 * is a sold-out saddle is a marketplace people stop trusting.
 */
CREATE OR REPLACE FUNCTION pay_product_order(
  p_order_id  UUID,
  p_buyer_id  UUID,
  p_provider  TEXT,
  p_reference TEXT
)
RETURNS TABLE (status order_status, remaining INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order     RECORD;
  v_remaining INTEGER;
BEGIN
  SELECT * INTO v_order
    FROM product_orders
   WHERE product_orders.id = p_order_id
     FOR UPDATE;

  IF NOT FOUND OR v_order.buyer_profile_id <> p_buyer_id THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  -- Idempotent on replay: a webhook redelivered three times must take the
  -- stock once (§24.10). Answering "already paid" is not an error.
  IF v_order.status = 'paid' OR v_order.payment_status = 'paid' THEN
    SELECT product_listings.quantity INTO v_remaining
      FROM product_listings WHERE product_listings.id = v_order.product_id;
    RETURN QUERY SELECT v_order.status, v_remaining;
    RETURN;
  END IF;

  IF v_order.status <> 'awaiting_payment' THEN
    RAISE EXCEPTION 'ORDER_NOT_PAYABLE' USING ERRCODE = 'check_violation';
  END IF;

  -- Every column qualified: `status` is also this function's OUT parameter,
  -- and an unqualified reference is ambiguous rather than merely unclear —
  -- Postgres refuses to run it.
  UPDATE product_listings
     SET quantity = GREATEST(product_listings.quantity - v_order.quantity, 0),
         status   = CASE WHEN product_listings.quantity - v_order.quantity <= 0
                         THEN 'sold'::listing_status
                         ELSE product_listings.status END
   WHERE product_listings.id = v_order.product_id
   RETURNING product_listings.quantity INTO v_remaining;

  UPDATE product_orders
     SET status            = 'paid',
         payment_status    = 'paid',
         payment_provider  = p_provider,
         payment_reference = p_reference,
         paid_at           = now()
   WHERE product_orders.id = p_order_id;

  RETURN QUERY SELECT 'paid'::order_status, v_remaining;
END;
$$;

GRANT EXECUTE ON FUNCTION pay_product_order(UUID, UUID, TEXT, TEXT) TO only_horses_app;

-- ── unwinding it ──────────────────────────────────────────────────────────
/**
 * Cancel or refund, putting the stock back.
 *
 * Same reason for SECURITY DEFINER as paying: the party cancelling is often
 * the buyer, and the stock lives on the seller's row. Restoring it reopens a
 * listing that had sold out, because a refunded unit is a unit for sale again.
 */
CREATE OR REPLACE FUNCTION unwind_product_order(
  p_order_id UUID,
  p_actor_id UUID,
  p_reason   TEXT
)
RETURNS TABLE (status order_status)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_next  order_status;
BEGIN
  SELECT * INTO v_order
    FROM product_orders
   WHERE product_orders.id = p_order_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_actor_id NOT IN (v_order.buyer_profile_id, v_order.seller_profile_id) THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_order.status IN ('cancelled', 'refunded', 'completed') THEN
    RAISE EXCEPTION 'ORDER_NOT_CANCELLABLE' USING ERRCODE = 'check_violation';
  END IF;

  -- The money decides the name. `refunded` is not a nicer word for cancelled:
  -- it means somebody is owed, and the two must be told apart in a report.
  v_next := CASE WHEN v_order.payment_status = 'paid' THEN 'refunded' ELSE 'cancelled' END;

  IF v_order.payment_status = 'paid' THEN
    UPDATE product_listings
       SET quantity = product_listings.quantity + v_order.quantity,
           status   = CASE WHEN product_listings.status = 'sold'
                           THEN 'active'::listing_status
                           ELSE product_listings.status END
     WHERE product_listings.id = v_order.product_id;
  END IF;

  UPDATE product_orders
     SET status         = v_next,
         payment_status = CASE WHEN v_order.payment_status = 'paid'
                               THEN 'refunded'::order_payment_status
                               ELSE product_orders.payment_status END,
         cancelled_at   = now(),
         cancel_reason  = p_reason
   WHERE product_orders.id = p_order_id;

  RETURN QUERY SELECT v_next;
END;
$$;

GRANT EXECUTE ON FUNCTION unwind_product_order(UUID, UUID, TEXT) TO only_horses_app;
