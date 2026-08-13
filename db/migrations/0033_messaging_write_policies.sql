-- ONLY HORSES · 0033 · write policies for the messaging path
--
-- §8 gives `conversations`, `conversation_participants` and `inquiries` read
-- policies and nothing else, so with RLS on, no one could start a
-- conversation at all — and §15 is the product's entire buyer-seller channel.

CREATE POLICY conversations_insert ON conversations FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY conversations_update ON conversations FOR UPDATE
  USING (is_conversation_participant(id));

-- The initiator adds both rows: their own and the counterpart's. A policy of
-- `profile_id = auth.uid()` would let someone into a thread but not let them
-- invite the person they are writing to.
CREATE POLICY participants_insert ON conversation_participants FOR INSERT
  WITH CHECK (
    profile_id = auth.uid()
    OR EXISTS (SELECT 1 FROM conversations c
               WHERE c.id = conversation_id AND c.created_by = auth.uid())
  );

-- §15.1: the buyer's first message creates the inquiry, so the buyer writes it.
CREATE POLICY inquiries_insert ON inquiries FOR INSERT
  WITH CHECK (buyer_id = auth.uid());

-- §13.5 stamps first_reply_at when the seller answers.
CREATE POLICY inquiries_update ON inquiries FOR UPDATE
  USING (buyer_id = auth.uid() OR seller_id = auth.uid());

/**
 * `listings.inquiry_count` is a derived counter bumped by the *buyer*, who has
 * no rights over the seller's listing. A trigger is the right owner for it:
 * the count cannot drift from the rows it counts, and no policy has to be
 * widened to let a buyer touch a listing row.
 */
CREATE OR REPLACE FUNCTION bump_listing_inquiry_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.listing_id IS NOT NULL THEN
    UPDATE listings SET inquiry_count = inquiry_count + 1 WHERE id = NEW.listing_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_inquiry_count
AFTER INSERT ON inquiries
FOR EACH ROW EXECUTE FUNCTION bump_listing_inquiry_count();
