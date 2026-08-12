import { createHmac } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';

import type { PresignedUpload, StorageProvider } from './storage.provider.js';

/**
 * Development and test storage provider.
 *
 * Writes to a directory under the repo instead of a bucket, so the §10 upload
 * pipeline — intent, PUT, process, strip, hash — runs end to end with no cloud
 * credentials. Never selected when GCS_BUCKET is configured, and refused in
 * production.
 *
 * Upload URLs are signed with the same shape as a real presigned URL (key,
 * expiry, signature) so the client code path is identical in both providers.
 */
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly root: string;

  constructor(
    private readonly baseUrl: string,
    private readonly signingSecret: string,
    root = '.storage',
  ) {
    this.root = resolve(process.cwd(), root);
    this.logger.warn(
      `Using local storage at ${this.root}. Development and test only.`,
    );
  }

  /**
   * Storage keys come from the API, but a path is a path: a key containing
   * `..` would escape the root. Real object stores treat the key as opaque, so
   * this check exists only for the local provider.
   */
  private pathFor(storageKey: string): string {
    const path = resolve(this.root, storageKey);
    if (!path.startsWith(`${this.root}/`)) {
      throw new Error(`Refusing to write outside the storage root: ${storageKey}`);
    }
    return path;
  }

  private sign(storageKey: string, expiresAt: number): string {
    return createHmac('sha256', this.signingSecret)
      .update(`${storageKey}:${expiresAt}`)
      .digest('hex');
  }

  verifySignature(storageKey: string, expiresAt: number, signature: string): boolean {
    if (Date.now() > expiresAt) return false;
    return this.sign(storageKey, expiresAt) === signature;
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
    const expiresAt = Date.now() + ttlSeconds * 1000;
    const signature = this.sign(storageKey, expiresAt);

    const uploadUrl = new URL(`${this.baseUrl}/v1/media/local-upload`);
    uploadUrl.searchParams.set('key', storageKey);
    uploadUrl.searchParams.set('expires', String(expiresAt));
    uploadUrl.searchParams.set('signature', signature);

    return {
      uploadUrl: uploadUrl.toString(),
      storageKey,
      headers: { 'content-type': mimeType },
      expiresAt: new Date(expiresAt),
    };
  }

  async read(storageKey: string): Promise<Buffer> {
    return readFile(this.pathFor(storageKey));
  }

  async write({ storageKey, body }: { storageKey: string; body: Buffer; mimeType: string }): Promise<void> {
    const path = this.pathFor(storageKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async createDownloadUrl(storageKey: string, ttlSeconds: number): Promise<string> {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    const url = new URL(`${this.baseUrl}/v1/media/local-download`);
    url.searchParams.set('key', storageKey);
    url.searchParams.set('expires', String(expiresAt));
    url.searchParams.set('signature', this.sign(storageKey, expiresAt));
    return url.toString();
  }

  async delete(storageKey: string): Promise<void> {
    await rm(this.pathFor(storageKey), { force: true });
  }

  storagePath(storageKey: string): string {
    return join(this.root, storageKey);
  }
}
