import { Storage, type Bucket } from '@google-cloud/storage';
import { Injectable } from '@nestjs/common';

import type { PresignedUpload, StorageProvider } from './storage.provider.js';

/**
 * Cloud Storage provider (ADR-0001, replacing the R2 bucket in spec §4).
 *
 * On Cloud Run the client picks up credentials from workload identity, so no
 * key material is needed — which is also what keeps §24.24 satisfied without
 * a service-account JSON living in the environment.
 */
@Injectable()
export class GcsStorageProvider implements StorageProvider {
  readonly name = 'gcs';
  private readonly bucket: Bucket;

  constructor(bucketName: string, projectId?: string) {
    const storage = new Storage(projectId ? { projectId } : {});
    this.bucket = storage.bucket(bucketName);
  }

  async createUploadUrl({
    storageKey,
    mimeType,
    ttlSeconds,
  }: {
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
    ttlSeconds: number;
  }): Promise<PresignedUpload> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const [uploadUrl] = await this.bucket.file(storageKey).getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: expiresAt,
      // Binding the content type into the signature stops a client from
      // presenting a JPEG intent and then uploading an executable.
      contentType: mimeType,
    });

    return {
      uploadUrl,
      storageKey,
      headers: { 'content-type': mimeType },
      expiresAt,
    };
  }

  async read(storageKey: string): Promise<Buffer> {
    const [contents] = await this.bucket.file(storageKey).download();
    return contents;
  }

  async write({
    storageKey,
    body,
    mimeType,
  }: {
    storageKey: string;
    body: Buffer;
    mimeType: string;
  }): Promise<void> {
    await this.bucket.file(storageKey).save(body, {
      contentType: mimeType,
      resumable: false,
      // The bucket is private; delivery goes through Cloudflare Images for
      // pictures and short-lived signed URLs for documents (§10.3).
      metadata: { cacheControl: 'private, max-age=0' },
    });
  }

  async createDownloadUrl(storageKey: string, ttlSeconds: number): Promise<string> {
    const [url] = await this.bucket.file(storageKey).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: new Date(Date.now() + ttlSeconds * 1000),
    });
    return url;
  }

  async delete(storageKey: string): Promise<void> {
    await this.bucket.file(storageKey).delete({ ignoreNotFound: true });
  }
}
