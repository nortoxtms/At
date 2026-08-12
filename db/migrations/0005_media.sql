-- ONLY HORSES · 0005 · media (§7, §10)

CREATE TABLE media (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type             media_type NOT NULL,
  status           media_status NOT NULL DEFAULT 'uploading',
  storage_key      TEXT,
  cf_image_id      TEXT,
  mux_asset_id     TEXT,
  mux_playback_id  TEXT,
  filename         TEXT,
  mime_type        TEXT,
  size_bytes       BIGINT,
  width            INTEGER,
  height           INTEGER,
  duration_secs    NUMERIC(8,2),
  blurhash         TEXT,
  phash            TEXT,
  alt_text         TEXT,
  is_nsfw          BOOLEAN NOT NULL DEFAULT FALSE,
  moderation_flag  TEXT,
  -- §10.1 step 4: proof that EXIF GPS stripping ran before the file was
  -- promoted to `ready`. §24.8 is audited against this column.
  exif_stripped_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_media_phash ON media(phash) WHERE phash IS NOT NULL;
CREATE INDEX idx_media_owner ON media(owner_profile_id);

-- FKs deferred from 0004 because `media` is created after `profiles`.
ALTER TABLE profiles
  ADD CONSTRAINT profiles_avatar_media_fk
  FOREIGN KEY (avatar_media_id) REFERENCES media(id) ON DELETE SET NULL;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_logo_media_fk
  FOREIGN KEY (logo_media_id) REFERENCES media(id) ON DELETE SET NULL;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_cover_media_fk
  FOREIGN KEY (cover_media_id) REFERENCES media(id) ON DELETE SET NULL;

ALTER TABLE credentials
  ADD CONSTRAINT credentials_document_media_fk
  FOREIGN KEY (document_media_id) REFERENCES media(id) ON DELETE SET NULL;
