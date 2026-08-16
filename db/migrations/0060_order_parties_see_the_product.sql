-- ── A buyer may see what they bought ──────────────────────────────────────
--
-- `products_select` (0058) shows a product to the world while it is active,
-- and otherwise only to its seller. That was right when the only way to
-- interact with a product was to look at it.
--
-- Buying one breaks it, and breaks it precisely at success. `pay_product_order`
-- sets the listing to `sold` when the last unit goes — so the moment a purchase
-- completes, the buyer loses read access to the row their own order points at.
-- Every order query joins `product_listings` for the slug, so the join returns
-- nothing, the API answers 404, and the buyer's freshly paid order disappears
-- from both the list and the detail page.
--
-- Found by buying something in a browser: the payment succeeded, the redirect
-- landed, and the order page rendered "this page could not be found". Nothing
-- in the API logged an error, because nothing had gone wrong from its side —
-- it asked for a row and was correctly told there wasn't one.
--
-- The fix is a rule that should have been there from the start: being a party
-- to an order is a reason to see the product. It grants no more than that —
-- the order already carries the title, price and quantity, so this exposes
-- nothing the buyer was not already shown at checkout.

DROP POLICY IF EXISTS products_select ON product_listings;

CREATE POLICY products_select ON product_listings FOR SELECT USING (
  status = 'active'
  OR seller_profile_id = auth.uid()
  OR is_staff()
  -- Scoped to this row and this viewer: a party to an order on *this* product.
  -- `product_orders` has its own policy, so the subquery is bounded by the
  -- viewer's own orders either way; naming both sides keeps it true even if
  -- that policy is later widened.
  OR EXISTS (
    SELECT 1
      FROM product_orders o
     WHERE o.product_id = product_listings.id
       AND (o.buyer_profile_id = auth.uid() OR o.seller_profile_id = auth.uid())
  )
);
