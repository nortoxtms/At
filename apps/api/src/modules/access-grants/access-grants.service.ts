import { Injectable, Logger } from '@nestjs/common';

import { ApiException } from '../../common/filters/api-exception.filter.js';
import { DatabaseService } from '../../database/database.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

/**
 * Health file access grants — spec §2, §12, §18.2 S08.
 *
 * §2's field visibility contract: "`on_request` means a buyer can tap 'Request
 * health file', the owner approves, and a time-limited grant is written to
 * `horse_access_grants`."
 *
 * Time-limited is the part that matters. A grant with no expiry is a
 * permanent copy of someone's veterinary history handed to a buyer who walked
 * away, so requests default to a window rather than to forever.
 */

/** §2: long enough to complete a purchase, short enough to end. */
const DEFAULT_GRANT_DAYS = 30;
const MAX_GRANT_DAYS = 180;

export interface AccessRequest {
  id: string;
  horseId: string;
  horseName: string;
  granteeId: string;
  granteeName: string;
  scope: string[];
  status: string;
  message: string | null;
  requestedAt: string;
  decidedAt: string | null;
  expiresAt: string | null;
}

@Injectable()
export class AccessGrantsService {
  private readonly logger = new Logger(AccessGrantsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly notifications: NotificationsService,
  ) {}

  /** §12 POST /horses/:id/access-requests — the buyer asks. */
  async request(
    profileId: string,
    horseIdOrSlug: string,
    input: { scope?: string[]; message?: string },
  ): Promise<{ id: string; status: string }> {
    const horse = await this.loadPubliclyVisibleHorse(horseIdOrSlug);

    if (horse.owner_profile_id === profileId) {
      throw ApiException.validation('Kendi atının sağlık dosyasına zaten erişimin var.');
    }

    // §2: only `on_request` is requestable. `private` means the owner has
    // said no in advance, and offering the button anyway would be a lie.
    if (horse.visibility_health === 'private') {
      throw ApiException.forbidden('Bu atın sağlık dosyası paylaşıma kapalı.');
    }

    const rows = await this.db.withUser(profileId, async (client) => {
      const result = await client.query<{ id: string; status: string }>(
        `INSERT INTO horse_access_grants (horse_id, grantee_id, scope, status, message)
         VALUES ($1, $2, $3, 'requested', $4)
         ON CONFLICT (horse_id, grantee_id) DO UPDATE
           SET status = CASE
                 -- A revoked or denied grant can be asked for again; an active
                 -- one is left alone so a re-tap does not reset its expiry.
                 WHEN horse_access_grants.status IN ('denied','revoked','expired')
                 THEN 'requested'
                 ELSE horse_access_grants.status END,
               message = COALESCE(EXCLUDED.message, horse_access_grants.message),
               requested_at = CASE
                 WHEN horse_access_grants.status IN ('denied','revoked','expired')
                 THEN now() ELSE horse_access_grants.requested_at END,
               -- Re-asking clears the previous answer; grants_reopen
               -- (migration 0035) requires it, and carrying a stale decision
               -- forward would make a fresh request look already-handled.
               decided_at = CASE
                 WHEN horse_access_grants.status IN ('denied','revoked','expired')
                 THEN NULL ELSE horse_access_grants.decided_at END,
               expires_at = CASE
                 WHEN horse_access_grants.status IN ('denied','revoked','expired')
                 THEN NULL ELSE horse_access_grants.expires_at END
         RETURNING id, status`,
        [horse.id, profileId, input.scope ?? ['health'], input.message ?? null],
      );
      return result.rows;
    });

    const grant = rows[0]!;

    if (grant.status === 'requested' && horse.owner_profile_id) {
      // §17 `access_request.new`.
      await this.notifications.dispatch({
        profileId: horse.owner_profile_id,
        type: 'access_request.new',
        title: `${horse.name} · sağlık dosyası isteği`,
        body: input.message ?? 'Bir alıcı sağlık dosyasını görmek istiyor.',
        data: { horseId: horse.id, grantId: grant.id },
        channels: ['push', 'in_app'],
      });
    }

    return grant;
  }

  /** §12 PATCH /access-requests/:id — the owner decides. */
  async decide(
    profileId: string,
    grantId: string,
    input: { status: 'granted' | 'denied' | 'revoked'; expiresInDays?: number },
  ): Promise<{ status: string; expiresAt: string | null }> {
    const rows = await this.db.queryAs<{
      id: string;
      horse_id: string;
      grantee_id: string;
      owner_profile_id: string | null;
      horse_name: string;
    }>(
      profileId,
      `SELECT g.id, g.horse_id, g.grantee_id, h.owner_profile_id, h.name AS horse_name
       FROM horse_access_grants g
       JOIN horses h ON h.id = g.horse_id
       WHERE g.id = $1`,
      [grantId],
    );

    const grant = rows[0];
    // NOT_FOUND rather than FORBIDDEN — see §24.25 on IDOR oracles.
    if (!grant || grant.owner_profile_id !== profileId) throw ApiException.notFound('Erişim isteği');

    const days = Math.min(input.expiresInDays ?? DEFAULT_GRANT_DAYS, MAX_GRANT_DAYS);

    const updated = await this.db.withUser(profileId, async (client) => {
      const result = await client.query<{ status: string; expires_at: string | null }>(
        // $2 is cast explicitly: it is read once as a grant_status and once as
        // text, and Postgres cannot deduce a single type for a parameter used
        // both ways.
        `UPDATE horse_access_grants
         SET status = $2::grant_status,
             decided_at = now(),
             expires_at = CASE WHEN $2::text = 'granted'
                               THEN now() + ($3 || ' days')::interval END
         WHERE id = $1
         RETURNING status, expires_at`,
        [grantId, input.status, days],
      );
      return result.rows;
    });

    const result = updated[0]!;

    // §17 `access_request.decided`. Sent on a denial too: silence reads as
    // being ignored, and the buyer needs to know to stop waiting.
    await this.notifications.dispatch({
      profileId: grant.grantee_id,
      type: 'access_request.decided',
      title:
        input.status === 'granted'
          ? `${grant.horse_name} · sağlık dosyası paylaşıldı`
          : `${grant.horse_name} · sağlık dosyası isteği yanıtlandı`,
      body:
        input.status === 'granted'
          ? `${days} gün boyunca görüntüleyebilirsin.`
          : 'Satıcı bu isteği onaylamadı.',
      data: { horseId: grant.horse_id, grantId, status: input.status },
      channels: ['push', 'in_app'],
    });

    this.logger.log(`Access grant ${grantId} ${input.status} by owner`);

    return { status: result.status, expiresAt: result.expires_at };
  }

  /** §12 GET /me/access-requests — incoming and outgoing. */
  async mine(profileId: string): Promise<{ incoming: AccessRequest[]; outgoing: AccessRequest[] }> {
    const rows = await this.db.queryAs<{
      id: string;
      horse_id: string;
      horse_name: string;
      grantee_id: string;
      grantee_name: string;
      owner_profile_id: string | null;
      scope: string[];
      status: string;
      message: string | null;
      requested_at: string;
      decided_at: string | null;
      expires_at: string | null;
    }>(
      profileId,
      `SELECT g.id, g.horse_id, h.name AS horse_name, g.grantee_id,
              gp.display_name AS grantee_name, h.owner_profile_id,
              g.scope, g.status, g.message, g.requested_at, g.decided_at, g.expires_at
       FROM horse_access_grants g
       JOIN horses h ON h.id = g.horse_id
       JOIN profiles gp ON gp.id = g.grantee_id
       WHERE h.owner_profile_id = $1 OR g.grantee_id = $1
       ORDER BY g.requested_at DESC`,
      [profileId],
    );

    const map = (row: (typeof rows)[number]): AccessRequest => ({
      id: row.id,
      horseId: row.horse_id,
      horseName: row.horse_name,
      granteeId: row.grantee_id,
      granteeName: row.grantee_name,
      scope: row.scope,
      // An expired grant reads as expired even before the sweep runs, so the
      // UI never shows access the API would refuse.
      status:
        row.status === 'granted' && row.expires_at && new Date(row.expires_at) <= new Date()
          ? 'expired'
          : row.status,
      message: row.message,
      requestedAt: row.requested_at,
      decidedAt: row.decided_at,
      expiresAt: row.expires_at,
    });

    return {
      incoming: rows.filter((row) => row.owner_profile_id === profileId).map(map),
      outgoing: rows.filter((row) => row.grantee_id === profileId).map(map),
    };
  }

  /**
   * Hourly sweep: marks lapsed grants so the queue reflects reality.
   *
   * Routed through a SECURITY DEFINER function (migration 0030): the sweep has
   * no user behind it, and `grants_update` requires horse edit rights, so a
   * direct update would silently affect nothing and leave §2's time limit
   * decorative.
   */
  async expireLapsed(): Promise<number> {
    const rows = await this.db.query<{ expire_lapsed_access_grants: number }>(
      `SELECT expire_lapsed_access_grants()`,
    );

    const expired = Number(rows[0]?.expire_lapsed_access_grants ?? 0);
    if (expired > 0) this.logger.log(`Expired ${expired} access grant(s)`);
    return expired;
  }

  private async loadPubliclyVisibleHorse(idOrSlug: string): Promise<{
    id: string;
    name: string;
    owner_profile_id: string | null;
    visibility_health: string;
  }> {
    // Unscoped through a narrow query: the requester is by definition not the
    // owner, so `horses_select` would hide the row unless a listing is active.
    // Only the four fields the request flow needs are read.
    const rows = await this.db.query<{
      id: string;
      name: string;
      owner_profile_id: string | null;
      visibility_health: string;
      has_active_listing: boolean;
    }>(
      `SELECT h.id, h.name, h.owner_profile_id, h.visibility_health,
              EXISTS (SELECT 1 FROM listings l
                      WHERE l.horse_id = h.id AND l.status IN ('active','under_offer')) AS has_active_listing
       FROM horses h
       WHERE (h.id::text = $1 OR h.slug = $1) AND h.deleted_at IS NULL`,
      [idOrSlug],
    );

    const horse = rows[0];
    // A horse nobody has listed is not open to requests from strangers.
    if (!horse || !horse.has_active_listing) throw ApiException.notFound('At');

    return horse;
  }
}
