-- ONLY HORSES · 0019 · write policies for ownership history
--
-- §8 gives `horse_ownership_history` a SELECT policy and nothing else, so
-- with RLS on, no one could record ownership at all — not when a horse is
-- first registered, and not when it changes hands. §24.3 ("a horse record
-- survives a sale … the ownership history shows both") was unreachable.
--
-- Writes are scoped to whoever can edit the horse. The trigger that runs on a
-- completed sale is unaffected either way: it is SECURITY DEFINER (migration
-- 0016), because a buyer must not need write access to the seller's horse for
-- the transfer to be recorded.

CREATE POLICY ownership_history_insert ON horse_ownership_history FOR INSERT
  WITH CHECK (can_edit_horse(horse_id));

-- Closing the outgoing owner's tenure on transfer sets `to_date`.
CREATE POLICY ownership_history_update ON horse_ownership_history FOR UPDATE
  USING (can_edit_horse(horse_id));

-- History is append-only: there is deliberately no DELETE policy. Provenance
-- that can be quietly rewritten is worth nothing to a buyer.
