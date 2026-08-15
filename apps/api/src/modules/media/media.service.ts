import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { encode as encodeBlurhash } from 'blurhash';
import sharp from 'sharp';
import type { MediaType } from '@only-horses/shared-types';

import { ApiException } from '../../common/filters/api-exception.filter.js';
import type { Env } from '../../config/env.js';
import { DatabaseService } from '../../database/database.service.js';
import { stripImageMetadata } from './image-processing.js';
import { computePerceptualHash, hammingDistance } from './perceptual-hash.js';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_DOCUMENT_BYTES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  STORAGE_PROVIDER,
  type StorageProvider,
} from './storage.provider.js';

export interface UploadIntent {
  mediaId: string;
  uploadUrl: string;
  storageKey: string;
  headers: Record<string, string>;
  expiresAt: Date;
}

interface MediaRow {
  id: string;
  owner_profile_id: string;
  type: MediaType;
  status: string;
  storage_key: string | null;
  mime_type: string | null;
  phash: string | null;
}

/**
 * Media pipeline — spec §10.
 *
 * The order in `complete()` is the order §10.1 specifies, and it matters: the
 * file is cleaned of metadata *before* anything else touches it and before it
 * is reachable, because §10.3 makes GPS removal non-negotiable and a
 * half-processed image that is already readable has already leaked.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<Env, true>,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /** §12 POST /v1/media/upload-intent. */
  async createUploadIntent(
    profileId: string,
    input: { type: MediaType; mimeType: string; sizeBytes: number; filename?: string },
  ): Promise<UploadIntent> {
    this.assertAcceptable(input.type, input.mimeType, input.sizeBytes);

    const mediaId = randomUUID();
    const extension = extensionFor(input.mimeType, input.filename);
    const storageKey = `${input.type}/${profileId}/${mediaId}${extension}`;

    await this.db.queryAs(
      profileId,
      `INSERT INTO media (id, owner_profile_id, type, status, storage_key, filename,
                          mime_type, size_bytes)
       VALUES ($1, $2, $3, 'uploading', $4, $5, $6, $7)`,
      [
        mediaId,
        profileId,
        input.type,
        storageKey,
        input.filename ?? null,
        input.mimeType,
        input.sizeBytes,
      ],
    );

    const presigned = await this.storage.createUploadUrl({
      storageKey,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      ttlSeconds: this.config.get('GCS_UPLOAD_URL_TTL_SECONDS', { infer: true }) ?? 900,
    });

    return { mediaId, ...presigned };
  }

  /**
   * §10.1 steps 4–5. Runs inline for images: the pipeline is fast enough, and
   * a listing whose photos are still "processing" cannot be reviewed. Video
   * goes to Mux asynchronously and lands in M2.
   */
  async complete(profileId: string, mediaId: string): Promise<{ status: string }> {
    const media = await this.loadOwned(profileId, mediaId);

    if (media.status === 'ready') return { status: 'ready' };
    if (!media.storage_key) throw ApiException.validation('Bu medya için yükleme başlatılmamış.');

    if (media.type !== 'image') {
      // Documents are stored as uploaded and served only through short-lived
      // signed URLs (§10.3); video transcoding is Mux's job.
      await this.db.queryAs(profileId, `UPDATE media SET status = 'ready' WHERE id = $1`, [
        mediaId,
      ]);
      return { status: 'ready' };
    }

    const original = await this.storage.read(media.storage_key);

    // 1. Strip metadata first, and write the cleaned bytes back over the
    //    original. Nothing downstream ever sees the version with GPS in it.
    const stripped = stripImageMetadata(original, media.mime_type ?? 'image/jpeg');
    await this.storage.write({
      storageKey: media.storage_key,
      body: stripped.output,
      mimeType: media.mime_type ?? 'image/jpeg',
    });

    if (stripped.hadGps) {
      this.logger.log(`Removed GPS metadata from media ${mediaId}`);
    }

    // 2. Derive what the clients need from the cleaned file.
    const metadata = await sharp(stripped.output).metadata();
    const blurhash = await computeBlurhash(stripped.output);
    const phash = await computePerceptualHash(stripped.output);

    await this.db.queryAs(
      profileId,
      `UPDATE media
       SET status = 'ready',
           width = $2, height = $3, size_bytes = $4,
           blurhash = $5, phash = $6,
           exif_stripped_at = now()
       WHERE id = $1`,
      [
        mediaId,
        metadata.width ?? null,
        metadata.height ?? null,
        stripped.output.byteLength,
        blurhash,
        phash,
      ],
    );

    // 3. §10.1 step 5 / §24.7: a near-duplicate owned by someone else is the
    //    stolen-photo signal.
    await this.flagDuplicateIfStolen(profileId, mediaId, phash);

    return { status: 'ready' };
  }

  /**
   * §14.2 `phash_duplicate_other_owner`, severity 4.
   *
   * Only a match on a *different* owner counts. The same owner reusing a photo
   * across their own horses is ordinary behaviour, and flagging it would train
   * moderators to dismiss the signal.
   */
  private async flagDuplicateIfStolen(
    profileId: string,
    mediaId: string,
    phash: string,
  ): Promise<void> {
    const threshold = this.config.get('IMAGE_HASH_THRESHOLD', { infer: true }) ?? 10;

    // Deliberately cross-tenant: the whole point is to compare against other
    // accounts' photos. Routed through a SECURITY DEFINER function that
    // returns only the three fields the comparison needs (migration 0021).
    const candidates = await this.db.query<{
      id: string;
      phash: string;
      owner_profile_id: string;
    }>('SELECT * FROM list_phash_candidates($1, $2, 5000)', [profileId, mediaId]);

    const match = candidates.find((row) => hammingDistance(phash, row.phash) <= threshold);
    if (!match) return;

    this.logger.warn(
      `Media ${mediaId} matches ${match.id} owned by another account — opening a moderation case`,
    );

    await this.db.query(
      `SELECT open_moderation_case('media', $1, 4::smallint, $2::jsonb, $3)`,
      [
        mediaId,
        JSON.stringify({
          phash_duplicate_other_owner: true,
          matched_media_id: match.id,
          matched_owner_profile_id: match.owner_profile_id,
          distance: hammingDistance(phash, match.phash),
        }),
        profileId,
      ],
    );

    await this.db.queryAs(
      profileId,
      `UPDATE media SET moderation_flag = 'phash_duplicate' WHERE id = $1`,
      [mediaId],
    );
  }

  /**
   * §14.2: any listing carrying flagged media is held for review rather than
   * auto-approved. Called by the listings module at publish time (M2).
   */
  async hasFlaggedMedia(horseId: string): Promise<boolean> {
    const rows = await this.db.query<{ flagged: string }>(
      `SELECT count(*) AS flagged
       FROM horse_media hm
       JOIN media m ON m.id = hm.media_id
       WHERE hm.horse_id = $1 AND m.moderation_flag IS NOT NULL`,
      [horseId],
    );
    return Number(rows[0]?.flagged ?? 0) > 0;
  }

  /**
   * Signed URLs for a set of media, keyed by id.
   *
   * §10 stores every asset behind the storage provider and hands out
   * short-lived signed URLs; nothing in the API was returning one for a
   * *photograph*, only for a document. The result was that `GET
   * /horses/:id/media` answered with a list of ids and no way to fetch any of
   * them — every client could list a horse's photos and render none.
   *
   * Batched because a gallery is N assets and one presign per row is N round
   * trips to the signer on a screen that is already the slowest one.
   */
  async createViewUrls(
    mediaIds: string[],
    viewerId: string | null,
  ): Promise<Map<string, string>> {
    if (mediaIds.length === 0) return new Map();

    // `queryAs`, not `query`. §8's `media_select` makes a horse's photograph
    // readable by its owner, or by anyone once the horse has an active
    // listing — and an unidentified connection is neither. Reading without the
    // viewer's identity returned no rows for the owner's own gallery, so every
    // photo came back with a null URL and the grid rendered empty tiles.
    const rows = await this.db.queryAs<{ id: string; storage_key: string | null }>(
      viewerId,
      `SELECT id, storage_key FROM media WHERE id = ANY($1::uuid[]) AND status = 'ready'`,
      [mediaIds],
    );

    const ttl = this.config.get('GCS_DOWNLOAD_URL_TTL_SECONDS', { infer: true }) ?? 3600;

    const entries = await Promise.all(
      rows
        .filter((row) => row.storage_key)
        .map(async (row) => [row.id, await this.storage.createDownloadUrl(row.storage_key!, ttl)] as const),
    );

    return new Map(entries);
  }

  async createDocumentUrl(mediaId: string): Promise<string> {
    const rows = await this.db.query<{ storage_key: string | null }>(
      `SELECT storage_key FROM media WHERE id = $1 AND status = 'ready'`,
      [mediaId],
    );

    const storageKey = rows[0]?.storage_key;
    if (!storageKey) throw ApiException.notFound('Belge');

    // §10.3: 5-minute TTL, and only reachable through a caller that has
    // already checked the grant.
    return this.storage.createDownloadUrl(
      storageKey,
      this.config.get('GCS_DOCUMENT_URL_TTL_SECONDS', { infer: true }) ?? 300,
    );
  }

  private async loadOwned(profileId: string, mediaId: string): Promise<MediaRow> {
    const rows = await this.db.queryAs<MediaRow>(
      profileId,
      `SELECT id, owner_profile_id, type, status, storage_key, mime_type, phash
       FROM media WHERE id = $1`,
      [mediaId],
    );

    const media = rows[0];
    if (!media) throw ApiException.notFound('Medya');
    if (media.owner_profile_id !== profileId) throw ApiException.forbidden();

    return media;
  }

  private assertAcceptable(type: MediaType, mimeType: string, sizeBytes: number): void {
    const rules = {
      image: { allowed: ALLOWED_IMAGE_MIME_TYPES, max: MAX_IMAGE_BYTES, label: 'Fotoğraf' },
      video: { allowed: ALLOWED_VIDEO_MIME_TYPES, max: MAX_VIDEO_BYTES, label: 'Video' },
      document: { allowed: ALLOWED_DOCUMENT_MIME_TYPES, max: MAX_DOCUMENT_BYTES, label: 'Belge' },
    }[type];

    if (!(rules.allowed as readonly string[]).includes(mimeType)) {
      throw ApiException.validation(
        `${rules.label} formatı desteklenmiyor. Kabul edilenler: ${rules.allowed.join(', ')}.`,
        { allowed: rules.allowed },
      );
    }

    if (sizeBytes <= 0 || sizeBytes > rules.max) {
      throw ApiException.validation(
        `${rules.label} en fazla ${Math.round(rules.max / 1024 / 1024)} MB olabilir.`,
        { maxBytes: rules.max },
      );
    }
  }
}

/** §18.3: blurhash is the placeholder every image renders behind. */
async function computeBlurhash(image: Buffer): Promise<string> {
  const { data, info } = await sharp(image)
    .raw()
    .ensureAlpha()
    .resize(32, 32, { fit: 'inside' })
    .toBuffer({ resolveWithObject: true });

  return encodeBlurhash(new Uint8ClampedArray(data), info.width, info.height, 4, 3);
}

function extensionFor(mimeType: string, filename?: string): string {
  const fromName = filename ? extname(filename).toLowerCase() : '';
  if (/^\.[a-z0-9]{1,5}$/.test(fromName)) return fromName;

  return (
    {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'video/mp4': '.mp4',
      'video/quicktime': '.mov',
      'application/pdf': '.pdf',
    }[mimeType] ?? ''
  );
}
