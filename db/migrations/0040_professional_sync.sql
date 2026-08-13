-- ONLY HORSES · 0040 · keep the professional directory in sync
--
-- `enqueue_search_sync` fires on `profiles`, but what makes someone a
-- professional is a *public role profile* (§7, §11.1). Adding, hiding or
-- removing one changes whether the person belongs in the directory at all —
-- and none of that touches the `profiles` row, so without this trigger the
-- directory only ever reflected the state at the last full reindex.
--
-- The document id is the profile, not the role profile: §11.1's collection is
-- one document per person with their roles aggregated into it.

CREATE OR REPLACE FUNCTION enqueue_professional_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO search_outbox (collection, document_id, operation)
  VALUES ('professionals', COALESCE(NEW.profile_id, OLD.profile_id), 'upsert');
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_search_sync_role_profiles
AFTER INSERT OR DELETE OR UPDATE ON role_profiles
FOR EACH ROW EXECUTE FUNCTION enqueue_professional_sync();

-- A provider's own service listings are counted on their directory card, so a
-- published service changes the card as well as the services collection.
CREATE OR REPLACE FUNCTION enqueue_provider_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO search_outbox (collection, document_id, operation)
  VALUES ('professionals', COALESCE(NEW.provider_profile_id, OLD.provider_profile_id), 'upsert');
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_search_sync_service_provider
AFTER INSERT OR DELETE OR UPDATE OF status ON service_listings
FOR EACH ROW EXECUTE FUNCTION enqueue_provider_sync();
