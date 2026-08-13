import { Inject, Injectable, Logger } from '@nestjs/common';

import { ApiException } from '../../common/filters/api-exception.filter.js';
import { DatabaseService } from '../../database/database.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { STORAGE_PROVIDER, type StorageProvider } from '../media/storage.provider.js';

/**
 * GDPR / KVKK data rights — spec §24.14, §24.27, §26.
 *
 * §26 requires a DSAR flow with both halves, and §24 puts a clock on each:
 * an export within 24 hours, an erasure within 30 days. The clocks are the
 * reason both are *requests* with rows rather than endpoints that do the work
 * inline — an export of a busy account is not a request-response operation,
 * and a deletion that happened instantly would give a user who mis-tapped no
 * way back.
 *
 * The 30-day window is also the grace period: §24.14 says "within 30 days",
 * and a user who signs in during those 30 days can cancel.
 */

/** §24.27's deadline. */
const EXPORT_DUE_HOURS = 24;
/** §24.14's deadline, and the grace period a user can cancel inside. */
const ERASURE_DUE_DAYS = 30;
/**
 * The export's download links live for an hour rather than §10.3's five
 * minutes: an archive of hundreds of photos is downloaded over minutes, not
 * seconds, and a link that expires mid-download makes the export useless.
 */
const EXPORT_URL_TTL_SECONDS = 3600;

@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly notifications: NotificationsService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /** §12 / §18.2 S31 "veri indirme". */
  async requestExport(profileId: string): Promise<{ id: string; dueAt: string }> {
    const open = await this.db.queryAs<{ id: string; due_at: string }>(
      profileId,
      `SELECT id, due_at FROM data_requests
       WHERE profile_id = $1 AND kind = 'export' AND status = 'pending'`,
      [profileId],
    );

    // A second request would not arrive sooner; returning the first one is the
    // honest answer.
    if (open[0]) return { id: open[0].id, dueAt: open[0].due_at };

    const rows = await this.db.withUser(profileId, async (client) => {
      const result = await client.query<{ id: string; due_at: string }>(
        `INSERT INTO data_requests (profile_id, kind, due_at)
         VALUES ($1, 'export', now() + ($2 || ' hours')::interval)
         RETURNING id, due_at`,
        [profileId, EXPORT_DUE_HOURS],
      );
      return result.rows;
    });

    this.logger.log(`Export requested by ${profileId}`);
    return { id: rows[0]!.id, dueAt: rows[0]!.due_at };
  }

  /**
   * Builds the export.
   *
   * Run by the sweep rather than by the request, and separately callable so a
   * small account can be served immediately. The media half is an inventory
   * with signed download URLs rather than an inlined archive: the objects are
   * in object storage, and streaming them through the database would be the
   * slowest possible way to move them.
   */
  async buildExport(requestId: string, profileId: string): Promise<Record<string, unknown>> {
    // system: an export reads every table this person appears in, across
    // policies written for their counterparties (migration 0048).
    const rows = await this.db.query<{ export_profile_data: Record<string, unknown> }>(
      `SELECT export_profile_data($1)`,
      [profileId],
    );

    const payload = rows[0]?.export_profile_data ?? {};
    const media = (payload.media as { id: string; storageKey?: string }[] | undefined) ?? [];

    const withUrls = await Promise.all(
      media.map(async (item) => ({
        ...item,
        // §10.3's TTL applies: the archive is a set of short-lived links, not
        // a permanent public mirror of someone's private documents.
        downloadUrl: item.storageKey
          ? await this.storage.createDownloadUrl(item.storageKey, EXPORT_URL_TTL_SECONDS)
          : null,
      })),
    );

    const complete = { ...payload, media: withUrls };

    await this.db.query(
      `UPDATE data_requests SET status = 'ready', payload = $2::jsonb, completed_at = now()
       WHERE id = $1`,
      [requestId, JSON.stringify({ mediaCount: withUrls.length })],
    );

    await this.notifications.dispatch({
      profileId,
      type: 'data_export.ready',
      title: 'Veri dosyan hazır',
      body: 'Verilerini indirebilirsin; medya bağlantıları bir saat geçerlidir.',
      data: { requestId },
      channels: ['email', 'in_app'],
      dedupeKey: `export_ready:${requestId}`,
    });

    return complete;
  }

  /** The export itself, downloaded by its owner. */
  async downloadExport(profileId: string, requestId: string): Promise<Record<string, unknown>> {
    const rows = await this.db.queryAs<{ id: string; status: string }>(
      profileId,
      `SELECT id, status FROM data_requests
       WHERE id = $1 AND profile_id = $2 AND kind = 'export'`,
      [requestId, profileId],
    );

    if (!rows[0]) throw ApiException.notFound('Veri talebi');

    // Built on demand: the row proves the request, and §24.27's 24 hours is a
    // ceiling rather than a delay to enforce.
    return this.buildExport(requestId, profileId);
  }

  /** §12 / §18.2 S31 "hesabı sil" — §24.14. */
  async requestErasure(profileId: string): Promise<{ id: string; dueAt: string }> {
    const hold = await this.db.queryAs<{ legal_hold: boolean }>(
      profileId,
      `SELECT legal_hold FROM profiles WHERE id = $1`,
      [profileId],
    );

    // §26: records under an open dispute survive deletion jobs, and the user
    // is told why rather than left with a request that silently never runs.
    if (hold[0]?.legal_hold) {
      throw ApiException.validation(
        'Hesabında açık bir uyuşmazlık kaydı olduğu için silme talebi şu anda işleme alınamıyor. ' +
          'Destek ekibiyle iletişime geç.',
      );
    }

    const open = await this.db.queryAs<{ id: string; due_at: string }>(
      profileId,
      `SELECT id, due_at FROM data_requests
       WHERE profile_id = $1 AND kind = 'delete' AND status = 'pending'`,
      [profileId],
    );

    if (open[0]) return { id: open[0].id, dueAt: open[0].due_at };

    const rows = await this.db.withUser(profileId, async (client) => {
      const result = await client.query<{ id: string; due_at: string }>(
        `INSERT INTO data_requests (profile_id, kind, due_at)
         VALUES ($1, 'delete', now() + ($2 || ' days')::interval)
         RETURNING id, due_at`,
        [profileId, ERASURE_DUE_DAYS],
      );
      return result.rows;
    });

    await this.notifications.dispatch({
      profileId,
      type: 'account.deletion_scheduled',
      title: 'Hesap silme talebin alındı',
      body: `Hesabın ${ERASURE_DUE_DAYS} gün içinde silinecek. Bu süre içinde giriş yaparak iptal edebilirsin.`,
      data: { requestId: rows[0]!.id, dueAt: rows[0]!.due_at },
      channels: ['email', 'in_app'],
    });

    this.logger.log(`Erasure scheduled for ${profileId} at ${rows[0]!.due_at}`);
    return { id: rows[0]!.id, dueAt: rows[0]!.due_at };
  }

  /** The way back out, inside the 30 days. */
  async cancelErasure(profileId: string): Promise<{ cancelled: boolean }> {
    const rows = await this.db.withUser(profileId, async (client) => {
      const result = await client.query<{ id: string }>(
        `UPDATE data_requests SET status = 'cancelled', completed_at = now()
         WHERE profile_id = $1 AND kind = 'delete' AND status = 'pending'
         RETURNING id`,
        [profileId],
      );
      return result.rows;
    });

    return { cancelled: rows.length > 0 };
  }

  async myRequests(profileId: string): Promise<unknown[]> {
    return this.db.queryAs(
      profileId,
      `SELECT id, kind, status, due_at, requested_at, completed_at
       FROM data_requests WHERE profile_id = $1
       ORDER BY requested_at DESC`,
      [profileId],
    );
  }

  /**
   * The erasure sweep — §24.14's "within 30 days".
   *
   * Deliberately runs *at* the deadline rather than before it: the 30 days are
   * the user's window to change their mind, and a job that erased early would
   * take that away.
   */
  async runDueErasures(): Promise<{ erased: number; horsesPreserved: number }> {
    const due = await this.db.query<{ id: string; profile_id: string }>(
      `SELECT * FROM list_due_erasures()`,
    );

    let erased = 0;
    let horsesPreserved = 0;

    for (const request of due) {
      try {
        const rows = await this.db.query<{ erase_profile: Record<string, number> }>(
          `SELECT erase_profile($1)`,
          [request.profile_id],
        );

        horsesPreserved += Number(rows[0]?.erase_profile?.ownershipRowsPreserved ?? 0);

        // Storage objects go after the rows are marked removed, so a failure
        // here leaves an orphan the next run can still find.
        await this.deleteStoredMedia(request.profile_id);

        await this.db.query(`SELECT complete_data_request($1, 'completed', NULL)`, [request.id]);
        erased += 1;

        this.logger.log(`Erased profile ${request.profile_id}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.db.query(`SELECT complete_data_request($1, 'failed', $2)`, [
          request.id,
          message,
        ]);
        this.logger.error(`Erasure ${request.id} failed: ${message}`);
      }
    }

    return { erased, horsesPreserved };
  }

  private async deleteStoredMedia(profileId: string): Promise<void> {
    const media = await this.db.query<{ storage_key: string | null }>(
      `SELECT storage_key FROM media WHERE owner_profile_id = $1 AND storage_key IS NOT NULL`,
      [profileId],
    );

    for (const item of media) {
      if (!item.storage_key) continue;
      try {
        await this.storage.delete(item.storage_key);
      } catch (error) {
        // Logged, not fatal: the row already says removed, and an object left
        // behind is a cleanup problem rather than a privacy failure.
        this.logger.warn(
          `Could not delete ${item.storage_key}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
