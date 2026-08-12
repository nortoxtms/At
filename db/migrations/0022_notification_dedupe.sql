-- ONLY HORSES · 0022 · notification idempotency
--
-- §17 fires `health.due` twice for the same record — once 7 days out and once
-- on the day. The reminder job runs hourly (§13.1's auto-expire job sets the
-- cadence), so without a dedupe key a user would get the same push every hour
-- for a day, twice. Reminder spam is how an owner turns notifications off, and
-- the reminders are the registry's retention mechanism (§1.2).
--
-- `dedupe_key` encodes what was sent, about what, and for which stage, so the
-- job can insert unconditionally and let the index decide.

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_dedupe
  ON notifications(profile_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

COMMENT ON COLUMN notifications.dedupe_key IS
  'Stable identity for a notification that must fire at most once, e.g. '
  '"health.due:<record_id>:lead". NULL for notifications that may repeat.';
