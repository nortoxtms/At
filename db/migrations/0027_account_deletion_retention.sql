-- ONLY HORSES · 0027 · make account deletion possible
--
-- §24.14: "Account deletion removes personal data within 30 days, anonymizes
-- reviews, and retains horse records with `owner_name_text` preserved for
-- provenance."
--
-- Eighteen foreign keys pointed at `profiles` with no ON DELETE action, which
-- in Postgres means RESTRICT. Between them they made deleting an account
-- impossible for anyone who had ever registered a horse, published a listing,
-- opened a conversation or bought a boost — that is, any real user. The right
-- to erasure was unimplementable, not merely unimplemented.
--
-- Each column below moves to ON DELETE SET NULL because the row it lives on
-- must outlive the person, for one of three reasons:
--
--   provenance  — the horse record and its history are the product (§2, P1);
--                 `horse_ownership_history.owner_name_text` is retained by
--                 design so a departed owner still appears in the chain
--   shared      — a conversation or an inquiry has two parties, and one
--                 leaving must not erase the other's history
--   compliance  — audit entries, moderation cases, verifications and purchases
--                 are records we are obliged to keep
--
-- Rows that are purely personal (role profiles, credentials, saved items,
-- notifications, device tokens, media) already cascade and are meant to go.
--
-- This migration makes deletion *possible*. The job that performs it, the
-- 30-day grace period and the review anonymization land in M6.

-- ── provenance: the horse record survives its owner (§24.14) ───────────
ALTER TABLE horses ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE horses DROP CONSTRAINT horses_created_by_fkey;
ALTER TABLE horses ADD CONSTRAINT horses_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE horse_health_records ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE horse_health_records DROP CONSTRAINT horse_health_records_created_by_fkey;
ALTER TABLE horse_health_records ADD CONSTRAINT horse_health_records_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE horse_health_records DROP CONSTRAINT horse_health_records_performed_by_profile_id_fkey;
ALTER TABLE horse_health_records ADD CONSTRAINT horse_health_records_performed_by_profile_id_fkey
  FOREIGN KEY (performed_by_profile_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- owner_name_text is already populated on write, so nulling the id keeps the
-- chain readable — which is exactly what §24.14 asks for.
ALTER TABLE horse_ownership_history DROP CONSTRAINT horse_ownership_history_owner_profile_id_fkey;
ALTER TABLE horse_ownership_history ADD CONSTRAINT horse_ownership_history_owner_profile_id_fkey
  FOREIGN KEY (owner_profile_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE horse_competition_results DROP CONSTRAINT horse_competition_results_rider_profile_id_fkey;
ALTER TABLE horse_competition_results ADD CONSTRAINT horse_competition_results_rider_profile_id_fkey
  FOREIGN KEY (rider_profile_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- A closed listing is part of the horse's timeline (§20.4) and its price
-- history; it is retained with the seller anonymized.
ALTER TABLE listings ALTER COLUMN seller_profile_id DROP NOT NULL;
ALTER TABLE listings DROP CONSTRAINT listings_seller_profile_id_fkey;
ALTER TABLE listings ADD CONSTRAINT listings_seller_profile_id_fkey
  FOREIGN KEY (seller_profile_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE listings DROP CONSTRAINT listings_sold_to_profile_id_fkey;
ALTER TABLE listings ADD CONSTRAINT listings_sold_to_profile_id_fkey
  FOREIGN KEY (sold_to_profile_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- ── shared: one party leaving must not erase the other's history ───────
ALTER TABLE conversations ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE conversations DROP CONSTRAINT conversations_created_by_fkey;
ALTER TABLE conversations ADD CONSTRAINT conversations_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE inquiries ALTER COLUMN buyer_id DROP NOT NULL;
ALTER TABLE inquiries DROP CONSTRAINT inquiries_buyer_id_fkey;
ALTER TABLE inquiries ADD CONSTRAINT inquiries_buyer_id_fkey
  FOREIGN KEY (buyer_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE inquiries ALTER COLUMN seller_id DROP NOT NULL;
ALTER TABLE inquiries DROP CONSTRAINT inquiries_seller_id_fkey;
ALTER TABLE inquiries ADD CONSTRAINT inquiries_seller_id_fkey
  FOREIGN KEY (seller_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE job_listings ALTER COLUMN poster_profile_id DROP NOT NULL;
ALTER TABLE job_listings DROP CONSTRAINT job_listings_poster_profile_id_fkey;
ALTER TABLE job_listings ADD CONSTRAINT job_listings_poster_profile_id_fkey
  FOREIGN KEY (poster_profile_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- An organization outlives the individual who registered it; its members are
-- tracked separately in organization_members.
ALTER TABLE organizations ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE organizations DROP CONSTRAINT organizations_created_by_fkey;
ALTER TABLE organizations ADD CONSTRAINT organizations_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- ── compliance: records we are obliged to keep ─────────────────────────
ALTER TABLE audit_log DROP CONSTRAINT audit_log_actor_id_fkey;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE moderation_cases DROP CONSTRAINT moderation_cases_assigned_to_fkey;
ALTER TABLE moderation_cases ADD CONSTRAINT moderation_cases_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE verifications DROP CONSTRAINT verifications_reviewer_id_fkey;
ALTER TABLE verifications ADD CONSTRAINT verifications_reviewer_id_fkey
  FOREIGN KEY (reviewer_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE credentials DROP CONSTRAINT credentials_verified_by_fkey;
ALTER TABLE credentials ADD CONSTRAINT credentials_verified_by_fkey
  FOREIGN KEY (verified_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE reviews DROP CONSTRAINT reviews_hidden_by_fkey;
ALTER TABLE reviews ADD CONSTRAINT reviews_hidden_by_fkey
  FOREIGN KEY (hidden_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- Financial records are retained for tax and dispute purposes.
ALTER TABLE purchases ALTER COLUMN profile_id DROP NOT NULL;
ALTER TABLE purchases DROP CONSTRAINT purchases_profile_id_fkey;
ALTER TABLE purchases ADD CONSTRAINT purchases_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL;
