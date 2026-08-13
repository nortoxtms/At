import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  jobSearchSchema,
  listingSearchSchema,
  type NotificationChannel,
  SAVED_SEARCH_ALERT_BUDGET_MINUTES,
  serviceSearchSchema,
} from '@only-horses/shared-types';

import { DatabaseService } from '../database/database.service.js';
import { NotificationsService } from '../modules/notifications/notifications.service.js';
import { SEARCH_PROVIDER, type SearchProvider } from '../modules/search/search.provider.js';

/**
 * §24.5 — "A saved search produces a push notification within 5 minutes of a
 * matching listing being published."
 *
 * Five minutes is the whole design constraint. It rules out a nightly batch,
 * and it rules out doing the matching at publish time (which would mean
 * running every saved search in the system inside a user's publish request).
 * What is left is a sweep on a short cycle: Cloud Scheduler calls this every
 * two minutes, each run replays the searches that are due, and the budget
 * lives in shared-types so the schedule and the criterion cannot drift apart.
 *
 * The watermark, not the clock, decides what is "new" — see migration 0047.
 */
@Injectable()
export class SavedSearchAlertsJob {
  private readonly logger = new Logger(SavedSearchAlertsJob.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly notifications: NotificationsService,
    @Inject(SEARCH_PROVIDER) private readonly search: SearchProvider,
  ) {}

  async run(): Promise<{ searches: number; notified: number; matches: number }> {
    // system: the sweep reads every user's saved searches, and
    // `saved_searches_own` scopes the table to its owner (migration 0047).
    const due = await this.db.query<{
      id: string;
      profile_id: string;
      name: string;
      entity: 'listings' | 'services' | 'jobs';
      query: Record<string, unknown>;
      alert_channel: NotificationChannel[];
      alert_frequency: string;
      last_seen_max_created_at: string | null;
    }>(`SELECT * FROM list_due_saved_searches($1)`, [500]);

    let notified = 0;
    let matches = 0;

    for (const search of due) {
      try {
        const found = await this.matchesFor(search.entity, search.query, search.last_seen_max_created_at);

        // The watermark advances even when nothing matched: the run happened,
        // and leaving it behind would re-scan the same window forever.
        await this.db.query(`SELECT mark_saved_search_run($1, $2::timestamptz)`, [
          search.id,
          found.watermark,
        ]);

        if (found.count === 0) continue;

        matches += found.count;

        const dispatched = await this.notifications.dispatch({
          profileId: search.profile_id,
          type: 'saved_search.match',
          title: `${search.name} · ${found.count} yeni ilan`,
          body: found.sampleTitle ?? 'Kaydettiğin aramaya uyan yeni ilanlar var.',
          data: {
            savedSearchId: search.id,
            entity: search.entity,
            count: found.count,
            sampleId: found.sampleId,
          },
          channels: search.alert_channel.length > 0 ? search.alert_channel : ['push'],
          // One alert per search per batch of new matches. Without this a
          // retried sweep would page the same user twice for one listing.
          dedupeKey: `saved_search:${search.id}:${found.watermark}`,
        });

        if (dispatched) notified += 1;
      } catch (error) {
        // One malformed saved query must not stop everyone else's alerts. The
        // query was valid when it was saved; a filter removed since then is
        // the realistic cause, and it is the owner's search that breaks.
        this.logger.error(
          `Saved search ${search.id} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        await this.db.query(`SELECT mark_saved_search_run($1, NULL)`, [search.id]);
      }
    }

    if (due.length > 0) {
      this.logger.log(
        `Saved searches: ${due.length} due, ${matches} new match(es), ${notified} notified ` +
          `(budget ${SAVED_SEARCH_ALERT_BUDGET_MINUTES} min)`,
      );
    }

    return { searches: due.length, notified, matches };
  }

  /**
   * Replays one saved query and counts what is newer than the watermark.
   *
   * The query is re-parsed through the same schema the API uses, which is what
   * makes a stored search survive a filter being added — and what makes an
   * invalid stored query fail loudly here rather than silently return
   * everything.
   */
  private async matchesFor(
    entity: 'listings' | 'services' | 'jobs',
    query: Record<string, unknown>,
    watermark: string | null,
  ): Promise<{ count: number; watermark: string | null; sampleTitle: string | null; sampleId: string | null }> {
    const since = watermark ? new Date(watermark).getTime() : 0;
    const newest = (value: string | null): number => (value ? new Date(value).getTime() : 0);

    if (entity === 'services') {
      const result = await this.search.searchServices(
        serviceSearchSchema.parse({ ...query, sort: 'newest', page: 1, limit: 50 }),
      );
      const fresh = result.hits.filter((hit) => newest(hit.publishedAt) > since);
      return {
        count: fresh.length,
        watermark: fresh[0]?.publishedAt ?? watermark,
        sampleTitle: fresh[0]?.title ?? null,
        sampleId: fresh[0]?.id ?? null,
      };
    }

    if (entity === 'jobs') {
      const result = await this.search.searchJobs(
        jobSearchSchema.parse({ ...query, sort: 'newest', page: 1, limit: 50 }),
      );
      const fresh = result.hits.filter((hit) => newest(hit.publishedAt) > since);
      return {
        count: fresh.length,
        watermark: fresh[0]?.publishedAt ?? watermark,
        sampleTitle: fresh[0]?.title ?? null,
        sampleId: fresh[0]?.id ?? null,
      };
    }

    const result = await this.search.searchListings(
      listingSearchSchema.parse({ ...query, sort: 'newest', page: 1, limit: 50 }),
    );
    const fresh = result.hits.filter((hit) => newest(hit.publishedAt) > since);

    return {
      count: fresh.length,
      watermark: fresh[0]?.publishedAt ?? watermark,
      sampleTitle: fresh[0]?.title ?? null,
      sampleId: fresh[0]?.id ?? null,
    };
  }
}
