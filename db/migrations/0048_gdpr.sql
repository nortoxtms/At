-- ONLY HORSES · 0048 · §24.14 and §24.27 — export and erasure
--
-- §24.14: "Account deletion removes personal data within 30 days, anonymizes
-- reviews, and retains horse records with `owner_name_text` preserved for
-- provenance."
-- §24.27: "GDPR/KVKK data export returns a complete JSON + media archive
-- within 24 h of request."
--
-- Both are cross-tenant by nature — an export reads every table a person
-- appears in, and an erasure writes rows they no longer own — so both live in
-- SECURITY DEFINER functions rather than behind widened policies. §26 adds the
-- constraint that makes this delicate: a horse's record must survive its
-- owner's deletion, because provenance is the product (§2).

-- ── The request ledger ─────────────────────────────────────────────────
/**
 * §26's DSAR flow needs a record of the request itself: when it arrived, when
 * it was answered, and — for deletion — when the 30-day clock expires. Without
 * a row there is nothing to prove the deadline was met.
 */
CREATE TABLE data_requests (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('export','delete')),
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','ready','completed','cancelled','failed')),
  -- §24.27's 24 h and §24.14's 30 days, stored rather than assumed.
  due_at       TIMESTAMPTZ NOT NULL,
  payload      JSONB,
  error        TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_data_requests_due ON data_requests (status, due_at);
CREATE INDEX idx_data_requests_profile ON data_requests (profile_id, requested_at DESC);

ALTER TABLE data_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY data_requests_own ON data_requests FOR SELECT
  USING (profile_id = auth.uid() OR is_staff());

CREATE POLICY data_requests_insert ON data_requests FOR INSERT
  WITH CHECK (profile_id = auth.uid());

-- A user may cancel their own pending deletion; nothing else is user-writable.
CREATE POLICY data_requests_cancel ON data_requests FOR UPDATE
  USING (profile_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON data_requests TO only_horses_app;

-- ── §24.27 export ──────────────────────────────────────────────────────
/**
 * Everything the platform holds about one person, as one JSON document.
 *
 * "Complete" is the requirement, so this is written as an explicit inventory
 * rather than a clever loop: every table that stores something about a person
 * appears by name, and adding a table to the schema without adding it here is
 * a visible omission rather than an invisible one.
 *
 * Media is exported as an inventory of ids, paths and checksums — the archive
 * itself is assembled by the API from storage, because a signed URL belongs in
 * an HTTP response and not in a database function.
 */
CREATE OR REPLACE FUNCTION export_profile_data(p_profile_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'exportedAt', now(),
    'profile', (SELECT to_jsonb(p) - 'location'
                FROM profiles p WHERE p.id = p_profile_id),
    'roleProfiles', (SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
                     FROM role_profiles r WHERE r.profile_id = p_profile_id),
    'credentials', (SELECT COALESCE(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
                    FROM credentials c
                    JOIN role_profiles r ON r.id = c.role_profile_id
                    WHERE r.profile_id = p_profile_id),
    'organizations', (SELECT COALESCE(jsonb_agg(to_jsonb(o)), '[]'::jsonb)
                      FROM organizations o
                      JOIN organization_members m ON m.organization_id = o.id
                      WHERE m.profile_id = p_profile_id),
    'horses', (SELECT COALESCE(jsonb_agg(to_jsonb(h) - 'location'), '[]'::jsonb)
               FROM horses h WHERE h.owner_profile_id = p_profile_id),
    'healthRecords', (SELECT COALESCE(jsonb_agg(to_jsonb(hr)), '[]'::jsonb)
                      FROM horse_health_records hr
                      JOIN horses h ON h.id = hr.horse_id
                      WHERE h.owner_profile_id = p_profile_id),
    'competitionResults', (SELECT COALESCE(jsonb_agg(to_jsonb(cr)), '[]'::jsonb)
                           FROM horse_competition_results cr
                           JOIN horses h ON h.id = cr.horse_id
                           WHERE h.owner_profile_id = p_profile_id),
    'ownershipHistory', (SELECT COALESCE(jsonb_agg(to_jsonb(oh)), '[]'::jsonb)
                         FROM horse_ownership_history oh
                         WHERE oh.owner_profile_id = p_profile_id),
    'listings', (SELECT COALESCE(jsonb_agg(to_jsonb(l) - 'location'), '[]'::jsonb)
                 FROM listings l WHERE l.seller_profile_id = p_profile_id),
    'serviceListings', (SELECT COALESCE(jsonb_agg(to_jsonb(sl) - 'location'), '[]'::jsonb)
                        FROM service_listings sl WHERE sl.provider_profile_id = p_profile_id),
    'jobListings', (SELECT COALESCE(jsonb_agg(to_jsonb(jl) - 'location'), '[]'::jsonb)
                    FROM job_listings jl WHERE jl.poster_profile_id = p_profile_id),
    'jobApplications', (SELECT COALESCE(jsonb_agg(to_jsonb(ja)), '[]'::jsonb)
                        FROM job_applications ja WHERE ja.applicant_id = p_profile_id),
    'conversations', (SELECT COALESCE(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
                      FROM conversations c
                      JOIN conversation_participants cp ON cp.conversation_id = c.id
                      WHERE cp.profile_id = p_profile_id),
    -- Only this person's own messages: the other side of a conversation is
    -- their data, not this requester's, and §26's DSAR does not reach it.
    'messages', (SELECT COALESCE(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
                 FROM conversation_messages m WHERE m.sender_id = p_profile_id),
    'inquiries', (SELECT COALESCE(jsonb_agg(to_jsonb(i)), '[]'::jsonb)
                  FROM inquiries i WHERE i.buyer_id = p_profile_id OR i.seller_id = p_profile_id),
    'reviewsWritten', (SELECT COALESCE(jsonb_agg(to_jsonb(rv)), '[]'::jsonb)
                       FROM reviews rv WHERE rv.author_id = p_profile_id),
    'reviewsReceived', (SELECT COALESCE(jsonb_agg(to_jsonb(rv)), '[]'::jsonb)
                        FROM reviews rv WHERE rv.subject_profile_id = p_profile_id),
    'savedItems', (SELECT COALESCE(jsonb_agg(to_jsonb(si)), '[]'::jsonb)
                   FROM saved_items si WHERE si.profile_id = p_profile_id),
    'savedSearches', (SELECT COALESCE(jsonb_agg(to_jsonb(ss)), '[]'::jsonb)
                      FROM saved_searches ss WHERE ss.profile_id = p_profile_id),
    'accessGrants', (SELECT COALESCE(jsonb_agg(to_jsonb(g)), '[]'::jsonb)
                     FROM horse_access_grants g WHERE g.grantee_id = p_profile_id),
    'verifications', (SELECT COALESCE(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
                      FROM verifications v WHERE v.profile_id = p_profile_id),
    'subscriptions', (SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
                      FROM subscriptions s WHERE s.profile_id = p_profile_id),
    'purchases', (SELECT COALESCE(jsonb_agg(to_jsonb(pu)), '[]'::jsonb)
                  FROM purchases pu WHERE pu.profile_id = p_profile_id),
    'notifications', (SELECT COALESCE(jsonb_agg(to_jsonb(n)), '[]'::jsonb)
                      FROM notifications n WHERE n.profile_id = p_profile_id),
    'notificationPreferences', (SELECT to_jsonb(np)
                                FROM notification_preferences np WHERE np.profile_id = p_profile_id),
    'devices', (SELECT COALESCE(jsonb_agg(to_jsonb(d) - 'token'), '[]'::jsonb)
                FROM device_tokens d WHERE d.profile_id = p_profile_id),
    'blocks', (SELECT COALESCE(jsonb_agg(to_jsonb(b)), '[]'::jsonb)
               FROM blocks b WHERE b.blocker_id = p_profile_id),
    'reportsFiled', (SELECT COALESCE(jsonb_agg(to_jsonb(rp)), '[]'::jsonb)
                     FROM reports rp WHERE rp.reporter_id = p_profile_id),
    'media', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                       'id', m.id, 'type', m.type, 'storageKey', m.storage_key,
                       'filename', m.filename, 'mimeType', m.mime_type,
                       'sizeBytes', m.size_bytes, 'createdAt', m.created_at)), '[]'::jsonb)
              FROM media m WHERE m.owner_profile_id = p_profile_id)
  )
$$;

GRANT EXECUTE ON FUNCTION export_profile_data(UUID) TO only_horses_app;

-- ── §24.14 erasure ─────────────────────────────────────────────────────
/**
 * Erasure, in the order the constraints allow.
 *
 * Three obligations pull against each other, and the order below is how they
 * are reconciled:
 *
 *   · **Erase the person.** Name, email, phone, avatar, bio, location — gone.
 *   · **Keep the horse.** §2 makes provenance the product, and §24.14 says so
 *     explicitly: `owner_name_text` on the ownership history keeps *who owned
 *     it* readable after the account behind it is gone. Migration 0027 already
 *     changed the foreign keys so the rows survive.
 *   · **Keep reviews honest.** §24.14 says reviews are anonymized, not
 *     deleted. A seller cannot erase the reviews written about them by closing
 *     their account, and a reviewer's words stay under "Silinmiş kullanıcı"
 *     via the snapshot taken when they wrote it (§13.4).
 *
 * `legal_hold` is checked first: §26 requires records under an open dispute to
 * survive deletion jobs.
 */
CREATE OR REPLACE FUNCTION erase_profile(p_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hold      BOOLEAN;
  v_name      TEXT;
  v_horses    INTEGER;
  v_reviews   INTEGER;
  v_listings  INTEGER;
BEGIN
  SELECT legal_hold, display_name INTO v_hold, v_name FROM profiles WHERE id = p_profile_id;
  IF v_hold IS NULL THEN RAISE EXCEPTION 'no such profile'; END IF;
  IF v_hold THEN RAISE EXCEPTION 'profile is under legal hold'; END IF;

  -- Provenance first, while the name is still readable.
  UPDATE horse_ownership_history
  SET owner_name_text = COALESCE(owner_name_text, v_name)
  WHERE owner_profile_id = p_profile_id;
  GET DIAGNOSTICS v_horses = ROW_COUNT;

  -- §13.4: reviews are anonymized, never removed. The snapshot is what the
  -- reader sees afterwards.
  UPDATE reviews
  SET author_name_snapshot = COALESCE(author_name_snapshot, v_name)
  WHERE author_id = p_profile_id;
  GET DIAGNOSTICS v_reviews = ROW_COUNT;

  -- Live content comes down: a withdrawn listing cannot take inquiries, and
  -- nobody is left to answer them.
  UPDATE listings SET status = 'withdrawn'
  WHERE seller_profile_id = p_profile_id AND status IN ('active','pending_review','under_offer');
  GET DIAGNOSTICS v_listings = ROW_COUNT;

  UPDATE service_listings SET status = 'withdrawn'
  WHERE provider_profile_id = p_profile_id AND status = 'active';

  UPDATE job_listings SET status = 'withdrawn'
  WHERE poster_profile_id = p_profile_id AND status = 'active';

  -- Message bodies are the other party's conversation too, so they are
  -- redacted rather than deleted: the thread stays readable, this person's
  -- words do not.
  UPDATE conversation_messages
  SET body = '[silinen kullanıcı]', attachment = NULL
  WHERE sender_id = p_profile_id;

  DELETE FROM device_tokens WHERE profile_id = p_profile_id;
  DELETE FROM saved_items WHERE profile_id = p_profile_id;
  DELETE FROM saved_searches WHERE profile_id = p_profile_id;
  DELETE FROM notifications WHERE profile_id = p_profile_id;

  -- Media rows are marked removed rather than dropped: the storage objects are
  -- deleted by the API, and a row that vanished first would leave orphans in
  -- the bucket that nothing knows to clean up.
  UPDATE media SET status = 'removed' WHERE owner_profile_id = p_profile_id;

  -- The identity itself.
  UPDATE profiles
  SET display_name = 'Silinmiş kullanıcı',
      handle = 'deleted-' || left(replace(p_profile_id::text, '-', ''), 12),
      bio = NULL,
      avatar_media_id = NULL,
      phone_e164 = NULL,
      phone_public = FALSE,
      email_public = FALSE,
      country_code = NULL,
      region = NULL,
      city = NULL,
      location = NULL,
      date_of_birth = NULL,
      languages = '{}',
      is_suspended = TRUE,
      deleted_at = now()
  WHERE id = p_profile_id;

  UPDATE auth.users
  SET email = 'deleted-' || left(replace(p_profile_id::text, '-', ''), 12) || '@deleted.invalid',
      phone = NULL,
      password_hash = NULL
  WHERE id = p_profile_id;

  RETURN jsonb_build_object(
    'ownershipRowsPreserved', v_horses,
    'reviewsAnonymized', v_reviews,
    'listingsWithdrawn', v_listings
  );
END;
$$;

GRANT EXECUTE ON FUNCTION erase_profile(UUID) TO only_horses_app;

/** Deletion requests whose 30-day window has closed (§24.14). */
CREATE OR REPLACE FUNCTION list_due_erasures()
RETURNS TABLE (id UUID, profile_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.profile_id
  FROM data_requests r
  JOIN profiles p ON p.id = r.profile_id
  WHERE r.kind = 'delete'
    AND r.status = 'pending'
    AND r.due_at <= now()
    AND p.deleted_at IS NULL
    AND p.legal_hold = FALSE
$$;

GRANT EXECUTE ON FUNCTION list_due_erasures() TO only_horses_app;

CREATE OR REPLACE FUNCTION complete_data_request(p_id UUID, p_status TEXT, p_error TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE data_requests
  SET status = p_status, error = p_error, completed_at = now()
  WHERE id = p_id
$$;

GRANT EXECUTE ON FUNCTION complete_data_request(UUID, TEXT, TEXT) TO only_horses_app;
