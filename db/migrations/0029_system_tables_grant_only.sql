-- ONLY HORSES · 0029 · system tables are governed by GRANT, not RLS
--
-- Migration 0013 enabled RLS on every table in `public` and deliberately gave
-- `search_outbox` and `stripe_events` no policy, reasoning that "no policy
-- means no anon access". The reasoning was right and the mechanism was wrong:
-- RLS applies to the application role too, so the only client these tables
-- have could not read or write them either. The §11.4 outbox drain claimed
-- zero rows against a backlog of 625 and reported success.
--
-- Neither table is row-owned. `search_outbox` holds a collection name, a
-- document id and an operation; `stripe_events` holds webhook payloads keyed
-- by Stripe's event id. There is no per-user subject to scope a policy to, so
-- the control that fits is the one that governs table access rather than row
-- access: only the API's role holds a GRANT, and no other role does.

ALTER TABLE search_outbox DISABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_events DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE search_outbox IS
  'System plumbing for the §11.4 indexing pipeline. Not under RLS: it is not '
  'row-owned, and access is controlled by GRANT (see migration 0029).';
COMMENT ON TABLE stripe_events IS
  'Webhook idempotency ledger (§16.2). Not under RLS: not row-owned, access '
  'controlled by GRANT (see migration 0029).';

GRANT SELECT, INSERT, UPDATE, DELETE ON search_outbox TO only_horses_app;
GRANT USAGE, SELECT ON SEQUENCE search_outbox_id_seq TO only_horses_app;
GRANT SELECT, INSERT, UPDATE ON stripe_events TO only_horses_app;
