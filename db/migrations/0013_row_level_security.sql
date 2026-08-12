-- ONLY HORSES · 0013 · Row Level Security (spec §8)
--
-- RLS is the second line of defense (§4): all writes go through the NestJS
-- API on the service role, which bypasses RLS. These policies exist so that a
-- leaked anon key cannot read another tenant's data. §24.23 tests them.

-- ── helpers ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND (p.is_moderator OR p.is_admin)
  )
$$;

CREATE OR REPLACE FUNCTION is_org_member(p_org_id UUID, p_roles org_member_role[] DEFAULT ARRAY['owner','admin','staff']::org_member_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_org_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members m
    WHERE m.organization_id = p_org_id
      AND m.profile_id = auth.uid()
      AND m.role = ANY(p_roles)
  )
$$;

CREATE OR REPLACE FUNCTION can_edit_horse(p_horse_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM horses h
    WHERE h.id = p_horse_id
      AND (h.owner_profile_id = auth.uid()
           OR is_org_member(h.owner_org_id, ARRAY['owner','admin']::org_member_role[]))
  )
$$;

CREATE OR REPLACE FUNCTION has_horse_grant(p_horse_id UUID, p_scope TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM horse_access_grants g
    WHERE g.horse_id = p_horse_id
      AND g.grantee_id = auth.uid()
      AND g.status = 'granted'
      AND (g.expires_at IS NULL OR g.expires_at > now())
      AND p_scope = ANY(g.scope)
  )
$$;

-- ── enable RLS everywhere ──────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      -- spatial_ref_sys is PostGIS-owned; schema_migrations is runner bookkeeping.
      AND table_name NOT IN ('spatial_ref_sys', 'schema_migrations')
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END;
$$;

-- ── reference data: world-readable, API-only writes ────────────────────
CREATE POLICY breeds_select ON breeds FOR SELECT USING (TRUE);
CREATE POLICY disciplines_select ON disciplines FOR SELECT USING (TRUE);
CREATE POLICY service_categories_select ON service_categories FOR SELECT USING (TRUE);
CREATE POLICY fx_rates_select ON fx_rates FOR SELECT USING (TRUE);

-- ── profiles ───────────────────────────────────────────────────────────
CREATE POLICY profiles_select ON profiles FOR SELECT USING (
  deleted_at IS NULL AND (is_suspended = FALSE OR id = auth.uid() OR is_staff())
);
CREATE POLICY profiles_update ON profiles FOR UPDATE USING (id = auth.uid() OR is_staff());

CREATE POLICY role_profiles_select ON role_profiles FOR SELECT USING (
  is_public OR profile_id = auth.uid() OR is_staff()
);
CREATE POLICY role_profiles_write ON role_profiles FOR ALL USING (profile_id = auth.uid());

CREATE POLICY credentials_select ON credentials FOR SELECT USING (
  EXISTS (SELECT 1 FROM role_profiles rp
          WHERE rp.id = credentials.role_profile_id AND rp.profile_id = auth.uid())
  OR is_staff()
);

-- ── organizations ──────────────────────────────────────────────────────
CREATE POLICY organizations_select ON organizations FOR SELECT USING (deleted_at IS NULL);
CREATE POLICY organizations_insert ON organizations FOR INSERT WITH CHECK (created_by = auth.uid());
CREATE POLICY organizations_update ON organizations FOR UPDATE USING (
  is_org_member(id, ARRAY['owner','admin']::org_member_role[]) OR is_staff()
);

CREATE POLICY org_members_select ON organization_members FOR SELECT USING (
  profile_id = auth.uid() OR is_org_member(organization_id) OR is_staff()
);
CREATE POLICY org_members_write ON organization_members FOR ALL USING (
  is_org_member(organization_id, ARRAY['owner','admin']::org_member_role[])
);

-- ── media ──────────────────────────────────────────────────────────────
-- Documents stay private (§10.3); images become visible through the entity
-- that references them, which the API resolves with signed URLs.
CREATE POLICY media_select ON media FOR SELECT USING (
  owner_profile_id = auth.uid()
  OR is_staff()
  OR (type <> 'document' AND EXISTS (
        SELECT 1 FROM horse_media hm
        JOIN listings l ON l.horse_id = hm.horse_id AND l.status = 'active'
        WHERE hm.media_id = media.id AND hm.visibility = 'public'))
);
CREATE POLICY media_insert ON media FOR INSERT WITH CHECK (owner_profile_id = auth.uid());
CREATE POLICY media_update ON media FOR UPDATE USING (owner_profile_id = auth.uid() OR is_staff());

-- ── horses (§8 verbatim pattern) ───────────────────────────────────────
CREATE POLICY horses_select ON horses FOR SELECT USING (
  deleted_at IS NULL AND (
    owner_profile_id = auth.uid()
    OR EXISTS (SELECT 1 FROM organization_members m
               WHERE m.organization_id = horses.owner_org_id AND m.profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM listings l
               WHERE l.horse_id = horses.id AND l.status = 'active')
    OR is_staff()
  )
);
CREATE POLICY horses_insert ON horses FOR INSERT WITH CHECK (created_by = auth.uid());
CREATE POLICY horses_update ON horses FOR UPDATE USING (
  owner_profile_id = auth.uid()
  OR is_org_member(owner_org_id, ARRAY['owner','admin']::org_member_role[])
);

CREATE POLICY horse_media_select ON horse_media FOR SELECT USING (
  can_edit_horse(horse_id)
  OR is_staff()
  OR (visibility = 'public' AND EXISTS (
        SELECT 1 FROM listings l WHERE l.horse_id = horse_media.horse_id AND l.status = 'active'))
  OR (visibility = 'on_request' AND has_horse_grant(horse_id, 'documents'))
);
CREATE POLICY horse_media_write ON horse_media FOR ALL USING (can_edit_horse(horse_id));

-- §24.4: health records are invisible to non-granted users on every surface.
CREATE POLICY health_select ON horse_health_records FOR SELECT USING (
  EXISTS (SELECT 1 FROM horses h WHERE h.id = horse_id AND h.owner_profile_id = auth.uid())
  OR EXISTS (SELECT 1 FROM horse_access_grants g
             WHERE g.horse_id = horse_health_records.horse_id
               AND g.grantee_id = auth.uid()
               AND g.status = 'granted'
               AND (g.expires_at IS NULL OR g.expires_at > now())
               AND 'health' = ANY(g.scope))
);
CREATE POLICY health_write ON horse_health_records FOR ALL USING (can_edit_horse(horse_id));

CREATE POLICY ownership_history_select ON horse_ownership_history FOR SELECT USING (
  can_edit_horse(horse_id)
  OR owner_profile_id = auth.uid()
  OR is_staff()
  OR EXISTS (SELECT 1 FROM listings l WHERE l.horse_id = horse_ownership_history.horse_id AND l.status = 'active')
);

CREATE POLICY competitions_select ON horse_competition_results FOR SELECT USING (
  can_edit_horse(horse_id)
  OR is_staff()
  OR EXISTS (SELECT 1 FROM listings l WHERE l.horse_id = horse_competition_results.horse_id AND l.status = 'active')
);
CREATE POLICY competitions_write ON horse_competition_results FOR ALL USING (can_edit_horse(horse_id));

CREATE POLICY grants_select ON horse_access_grants FOR SELECT USING (
  grantee_id = auth.uid() OR can_edit_horse(horse_id) OR is_staff()
);
CREATE POLICY grants_insert ON horse_access_grants FOR INSERT WITH CHECK (grantee_id = auth.uid());
CREATE POLICY grants_update ON horse_access_grants FOR UPDATE USING (can_edit_horse(horse_id));

-- ── listings ───────────────────────────────────────────────────────────
CREATE POLICY listings_select ON listings FOR SELECT USING (
  status IN ('active','under_offer','sold','expired')
  OR seller_profile_id = auth.uid()
  OR is_org_member(seller_org_id)
  OR is_staff()
);
CREATE POLICY listings_insert ON listings FOR INSERT WITH CHECK (seller_profile_id = auth.uid());
CREATE POLICY listings_update ON listings FOR UPDATE USING (
  seller_profile_id = auth.uid()
  OR is_org_member(seller_org_id, ARRAY['owner','admin']::org_member_role[])
  OR is_staff()
);

CREATE POLICY price_history_select ON listing_price_history FOR SELECT USING (
  EXISTS (SELECT 1 FROM listings l WHERE l.id = listing_id
          AND (l.seller_profile_id = auth.uid() OR l.status = 'active'))
  OR is_staff()
);

-- ── services & jobs ────────────────────────────────────────────────────
CREATE POLICY services_select ON service_listings FOR SELECT USING (
  status = 'active' OR provider_profile_id = auth.uid() OR is_staff()
);
CREATE POLICY services_write ON service_listings FOR ALL USING (provider_profile_id = auth.uid());

CREATE POLICY service_media_select ON service_media FOR SELECT USING (
  EXISTS (SELECT 1 FROM service_listings s WHERE s.id = service_id
          AND (s.status = 'active' OR s.provider_profile_id = auth.uid()))
);

CREATE POLICY jobs_select ON job_listings FOR SELECT USING (
  status = 'active' OR poster_profile_id = auth.uid() OR is_org_member(organization_id) OR is_staff()
);
CREATE POLICY jobs_write ON job_listings FOR ALL USING (
  poster_profile_id = auth.uid() OR is_org_member(organization_id, ARRAY['owner','admin']::org_member_role[])
);

CREATE POLICY applications_select ON job_applications FOR SELECT USING (
  applicant_id = auth.uid()
  OR EXISTS (SELECT 1 FROM job_listings j WHERE j.id = job_id
             AND (j.poster_profile_id = auth.uid() OR is_org_member(j.organization_id)))
  OR is_staff()
);
CREATE POLICY applications_insert ON job_applications FOR INSERT WITH CHECK (applicant_id = auth.uid());
CREATE POLICY applications_update ON job_applications FOR UPDATE USING (
  applicant_id = auth.uid()
  OR EXISTS (SELECT 1 FROM job_listings j WHERE j.id = job_id AND j.poster_profile_id = auth.uid())
);

-- ── messaging ──────────────────────────────────────────────────────────
CREATE POLICY conversations_select ON conversations FOR SELECT USING (
  EXISTS (SELECT 1 FROM conversation_participants p
          WHERE p.conversation_id = conversations.id AND p.profile_id = auth.uid())
  OR is_staff()
);
CREATE POLICY participants_select ON conversation_participants FOR SELECT USING (
  profile_id = auth.uid()
  OR EXISTS (SELECT 1 FROM conversation_participants p2
             WHERE p2.conversation_id = conversation_participants.conversation_id
               AND p2.profile_id = auth.uid())
  OR is_staff()
);
CREATE POLICY participants_update ON conversation_participants FOR UPDATE USING (profile_id = auth.uid());

CREATE POLICY inquiries_select ON inquiries FOR SELECT USING (
  buyer_id = auth.uid() OR seller_id = auth.uid() OR is_staff()
);

-- ── reviews ────────────────────────────────────────────────────────────
CREATE POLICY reviews_select ON reviews FOR SELECT USING (
  is_hidden = FALSE OR author_id = auth.uid() OR is_staff()
);
CREATE POLICY reviews_insert ON reviews FOR INSERT WITH CHECK (author_id = auth.uid());
-- The subject may post a response; only moderators may hide (§13.4).
CREATE POLICY reviews_update ON reviews FOR UPDATE USING (
  subject_profile_id = auth.uid() OR is_staff()
);

CREATE POLICY blocks_select ON blocks FOR SELECT USING (blocker_id = auth.uid() OR is_staff());
CREATE POLICY blocks_write ON blocks FOR ALL USING (blocker_id = auth.uid());

-- ── per-user private tables ────────────────────────────────────────────
CREATE POLICY saved_items_own ON saved_items FOR ALL USING (profile_id = auth.uid());
CREATE POLICY saved_searches_own ON saved_searches FOR ALL USING (profile_id = auth.uid());
CREATE POLICY notifications_own ON notifications FOR ALL USING (profile_id = auth.uid());
CREATE POLICY notification_prefs_own ON notification_preferences FOR ALL USING (profile_id = auth.uid());
CREATE POLICY device_tokens_own ON device_tokens FOR ALL USING (profile_id = auth.uid());
CREATE POLICY verifications_own ON verifications FOR SELECT USING (profile_id = auth.uid() OR is_staff());
CREATE POLICY subscriptions_own ON subscriptions FOR SELECT USING (
  profile_id = auth.uid() OR is_org_member(organization_id) OR is_staff()
);
CREATE POLICY purchases_own ON purchases FOR SELECT USING (profile_id = auth.uid() OR is_staff());

-- ── moderation: reporters see their own reports, staff see everything ──
CREATE POLICY reports_insert ON reports FOR INSERT WITH CHECK (reporter_id = auth.uid());
CREATE POLICY reports_select ON reports FOR SELECT USING (reporter_id = auth.uid() OR is_staff());
CREATE POLICY moderation_staff_only ON moderation_cases FOR ALL USING (is_staff());
CREATE POLICY audit_staff_only ON audit_log FOR SELECT USING (is_staff());

-- ── API-only tables: no policy at all means no anon access ─────────────
-- search_outbox, stripe_events. Deliberately left with RLS on and zero
-- policies; only the service role touches them.
