import { Injectable, Logger } from '@nestjs/common';
import type { SaveItemInput, SaveSearchInput, UpdateSavedSearchInput } from '@only-horses/shared-types';

import { ApiException } from '../../common/filters/api-exception.filter.js';
import { DatabaseService } from '../../database/database.service.js';

/**
 * Saved items and saved searches — spec §12, §18.2 S29.
 *
 * A saved search is stored as the query object itself rather than as parsed
 * columns, so §24.5's alert job re-runs the user's exact search instead of an
 * approximation of it. That only works because the filter grammar is one
 * shared zod schema (ADR-0002): the sheet that built the query, the API that
 * answers it and the job that replays it all read the same definition.
 */
@Injectable()
export class SavedService {
  private readonly logger = new Logger(SavedService.name);

  constructor(private readonly db: DatabaseService) {}

  /** §12 GET /saved — §18.2 S29's five tabs. */
  async items(profileId: string, type?: string): Promise<unknown[]> {
    // Routed through a SECURITY DEFINER function (migration 0047): resolving a
    // saved listing's title crosses into rows the saver does not own, and one
    // query per saved row would be a page load of round trips.
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM resolve_saved_items($1)`,
      [profileId],
    );

    return type ? rows.filter((row) => row.item_type === type) : rows;
  }

  /** §12 POST /saved. */
  async save(profileId: string, input: SaveItemInput): Promise<{ saved: true }> {
    await this.db.withUser(profileId, (client) =>
      client.query(
        `INSERT INTO saved_items (profile_id, item_type, item_id, note)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (profile_id, item_type, item_id) DO UPDATE SET note = EXCLUDED.note`,
        [profileId, input.itemType, input.itemId, input.note ?? null],
      ),
    );

    return { saved: true };
  }

  /** §12 DELETE /saved/:type/:id. */
  async unsave(profileId: string, itemType: string, itemId: string): Promise<void> {
    await this.db.withUser(profileId, (client) =>
      client.query(
        `DELETE FROM saved_items WHERE profile_id = $1 AND item_type = $2 AND item_id = $3`,
        [profileId, itemType, itemId],
      ),
    );
  }

  /** §12 GET /saved-searches — S29 shows each one's new-match count. */
  async searches(profileId: string): Promise<unknown[]> {
    return this.db.queryAs(
      profileId,
      `SELECT id, name, entity, query, alert_channel, alert_frequency,
              last_run_at, last_seen_max_created_at, created_at
       FROM saved_searches
       WHERE profile_id = $1
       ORDER BY created_at DESC`,
      [profileId],
    );
  }

  /** §12 POST /saved-searches. */
  async saveSearch(profileId: string, input: SaveSearchInput): Promise<{ id: string }> {
    const rows = await this.db.withUser(profileId, async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO saved_searches
           (profile_id, name, entity, query, alert_channel, alert_frequency,
            last_seen_max_created_at)
         VALUES ($1,$2,$3,$4::jsonb,$5::notification_channel[],$6, now())
         RETURNING id`,
        [
          profileId,
          input.name,
          input.entity,
          JSON.stringify(input.query),
          input.alertChannel,
          input.alertFrequency,
        ],
      );
      return result.rows;
    });

    // The watermark starts at "now" rather than at epoch on purpose: saving a
    // search must not immediately notify about the 400 listings that already
    // matched it. §24.5 is about *new* listings.
    this.logger.log(`Saved search ${rows[0]!.id} (${input.alertFrequency}) for ${profileId}`);
    return rows[0]!;
  }

  async updateSearch(
    profileId: string,
    id: string,
    input: UpdateSavedSearchInput,
  ): Promise<void> {
    const columns: Record<string, unknown> = {
      name: input.name,
      alert_channel: input.alertChannel,
      alert_frequency: input.alertFrequency,
    };

    const present = Object.entries(columns).filter(([, value]) => value !== undefined);
    if (present.length === 0) return;

    const updated = await this.db.withUser(profileId, async (client) => {
      const assignments = present.map(([column], index) => `${column} = $${index + 2}`);
      const result = await client.query(
        `UPDATE saved_searches SET ${assignments.join(', ')} WHERE id = $1 RETURNING id`,
        [id, ...present.map(([, value]) => value)],
      );
      return result.rows;
    });

    if (updated.length === 0) throw ApiException.notFound('Kayıtlı arama');
  }

  async deleteSearch(profileId: string, id: string): Promise<void> {
    await this.db.withUser(profileId, (client) =>
      client.query(`DELETE FROM saved_searches WHERE id = $1 AND profile_id = $2`, [id, profileId]),
    );
  }
}
