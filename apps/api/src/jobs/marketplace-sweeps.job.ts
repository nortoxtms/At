import { Injectable, Logger } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';
import { AccessGrantsService } from '../modules/access-grants/access-grants.service.js';
import { JobsService } from '../modules/jobs/jobs.service.js';
import { NotificationsService } from '../modules/notifications/notifications.service.js';
import { PrivacyService } from '../modules/privacy/privacy.service.js';

/**
 * The hourly marketplace sweep.
 *
 * Three time-based rules that nothing else triggers, gathered behind one cron
 * call because Cloud Run scales to zero and an in-process timer would only
 * fire while some unrelated request kept an instance warm:
 *
 *   · §13.6 — applications auto-close when their job expires;
 *   · §2    — health file grants are time-limited, so they must actually end;
 *   · §17   — `review.prompt`, 48 h after a listing closed;
 *   · §16.1 — boosts are sold by the day, so they have to stop;
 *   · §24.14 — a deletion request erases when its 30 days are up.
 *
 * The grant sweep existed since M3 with no caller, which meant "time-limited"
 * was true in the database and decorative in practice. It has one now.
 */
@Injectable()
export class MarketplaceSweepsJob {
  private readonly logger = new Logger(MarketplaceSweepsJob.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly jobs: JobsService,
    private readonly grants: AccessGrantsService,
    private readonly notifications: NotificationsService,
    private readonly privacy: PrivacyService,
  ) {}

  async run(): Promise<{
    expiredJobs: number;
    closedApplications: number;
    expiredGrants: number;
    reviewPrompts: number;
    expiredBoosts: number;
    erasures: number;
  }> {
    const jobs = await this.jobs.closeExpiredJobs();
    const expiredGrants = await this.grants.expireLapsed();
    const reviewPrompts = await this.promptForReviews();
    const expiredBoosts = await this.expireBoosts();
    // §24.14: deletion requests whose 30 days have run out.
    const erasures = await this.privacy.runDueErasures();

    this.logger.log(
      `Sweep: ${jobs.applications} application(s), ${expiredGrants} grant(s), ` +
        `${reviewPrompts} review prompt(s), ${expiredBoosts} boost(s)`,
    );

    return {
      expiredJobs: jobs.jobs,
      closedApplications: jobs.applications,
      expiredGrants,
      reviewPrompts,
      expiredBoosts,
      erasures: erasures.erased,
    };
  }

  /**
   * §16.1's boosts are sold by duration, so they have to end.
   *
   * §11.2 already refuses to rank an expired boost — `boost_rank` is computed
   * from `boost_expires_at` at index time — so this is about the flag the
   * seller sees on their own listing and about the document staying truthful.
   * Clearing it re-enqueues the listing through the §11.4 outbox by itself.
   */
  private async expireBoosts(): Promise<number> {
    const rows = await this.db.query<{ expire_boosts: number }>(`SELECT expire_boosts()`);
    return Number(rows[0]?.expire_boosts ?? 0);
  }

  /** §17 `review.prompt`, push only — the spec lists no other channel. */
  private async promptForReviews(): Promise<number> {
    const prompts = await this.db.query<{
      profile_id: string;
      subject_id: string;
      listing_id: string;
      listing_title: string;
      conversation_id: string;
    }>(`SELECT * FROM list_review_prompts()`);

    let sent = 0;

    for (const prompt of prompts) {
      const dispatched = await this.notifications.dispatch({
        profileId: prompt.profile_id,
        type: 'review.prompt',
        title: `${prompt.listing_title} · nasıl geçti?`,
        body: 'Karşı tarafı değerlendirerek diğer alıcı ve satıcılara yardımcı ol.',
        data: {
          listingId: prompt.listing_id,
          conversationId: prompt.conversation_id,
          subjectProfileId: prompt.subject_id,
        },
        channels: ['push'],
        // Once per conversation, ever. The sweep runs hourly and the row stays
        // eligible for as long as the review window is open.
        dedupeKey: `review_prompt:${prompt.conversation_id}`,
      });

      if (dispatched) sent += 1;
    }

    return sent;
  }
}
