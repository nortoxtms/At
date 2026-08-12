/**
 * Object storage abstraction — spec §10.
 *
 * Cloud Storage is the provider in every deployed environment (ADR-0001).
 * The interface exists for the same reason §15.2 requires one around Stream
 * Chat, and it earns its keep immediately: the upload pipeline is testable
 * end to end against a local directory, with no bucket and no credentials.
 */
export interface PresignedUpload {
  uploadUrl: string;
  storageKey: string;
  /** Headers the client must send with the PUT, if the provider requires any. */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface StorageProvider {
  readonly name: string;

  /** §10.1 step 2: a presigned PUT the client uploads to directly. */
  createUploadUrl(input: {
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
    ttlSeconds: number;
  }): Promise<PresignedUpload>;

  /** §10.1 step 4: the worker reads the object back to process it. */
  read(storageKey: string): Promise<Buffer>;

  /** Writes the cleaned bytes back over the original (§10.3). */
  write(input: { storageKey: string; body: Buffer; mimeType: string }): Promise<void>;

  /**
   * §10.3: documents are served only via short-lived signed URLs, 5 minute
   * TTL, and only to users holding an active grant.
   */
  createDownloadUrl(storageKey: string, ttlSeconds: number): Promise<string>;

  delete(storageKey: string): Promise<void>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

/** §10.1: max 20 MB image, 500 MB video. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/**
 * §10.3 permits no best-effort on metadata stripping, so the allowed image
 * types are exactly those `stripImageMetadata` can actually clean. WebP and
 * HEIC are deliberately absent until that parser exists — accepting them would
 * mean storing images whose GPS we never removed.
 */
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png'] as const;
export const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime'] as const;
export const ALLOWED_DOCUMENT_MIME_TYPES = ['application/pdf'] as const;
