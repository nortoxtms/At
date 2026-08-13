import { Injectable, Logger } from '@nestjs/common';

import { ApiException } from '../../common/filters/api-exception.filter.js';
import { DatabaseService } from '../../database/database.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

/**
 * Reports and the moderation queue — spec §12, §14.2, §18.2 S32.
 *
 * §14.2's signals decide severity, and severity decides order. A queue sorted
 * by arrival buries the severity-5 case behind fifty spam reports, so the
 * ordering here is severity first and age second.
 */

export type ReportReason =
  | 'scam'
  | 'stolen_photos'
  | 'misrepresentation'
  | 'welfare'
  | 'prohibited_content'
  | 'spam'
  | 'harassment'
  | 'duplicate'
  | 'wrong_category'
  | 'other';

/** §14.2's table, for reports rather than automated signals. */
const SEVERITY_FOR_REASON: Record<ReportReason, number> = {
  scam: 5,
  stolen_photos: 4,
  welfare: 4,
  prohibited_content: 4,
  misrepresentation: 3,
  harassment: 3,
  spam: 2,
  duplicate: 1,
  wrong_category: 1,
  other: 2,
};

/** §14.2 `repeat_reports_same_target`: >=3 in 7 days auto-hides pending review. */
const REPEAT_REPORT_THRESHOLD = 3;
const REPEAT_REPORT_WINDOW_DAYS = 7;

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly notifications: NotificationsService,
  ) {}

  /** §12 POST /reports, §18.2 S32. */
  async report(
    reporterId: string,
    input: {
      targetType: string;
      targetId: string;
      reason: ReportReason;
      details?: string;
      evidenceMediaIds?: string[];
    },
  ): Promise<{ reportId: string; caseId: string }> {
    const reportRows = await this.db.withUser(reporterId, async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO reports (reporter_id, target_type, target_id, reason, details, evidence_media_ids)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id`,
        [
          reporterId,
          input.targetType,
          input.targetId,
          input.reason,
          input.details ?? null,
          input.evidenceMediaIds ?? [],
        ],
      );
      return result.rows;
    });

    const reportId = reportRows[0]!.id;

    const recent = await this.db.query<{ reports: string; reporters: string }>(
      `SELECT count(*) AS reports, count(DISTINCT reporter_id) AS reporters
       FROM reports
       WHERE target_type = $1 AND target_id = $2
         AND created_at > now() - ($3 || ' days')::interval`,
      [input.targetType, input.targetId, REPEAT_REPORT_WINDOW_DAYS],
    );

    // Distinct reporters, not raw reports: one person reporting the same
    // listing five times is a grudge, five people reporting it is a signal.
    const distinctReporters = Number(recent[0]?.reporters ?? 1);
    const repeated = distinctReporters >= REPEAT_REPORT_THRESHOLD;

    const severity = repeated ? 5 : SEVERITY_FOR_REASON[input.reason];

    const caseRows = await this.db.query<{ open_moderation_case: string }>(
      `SELECT open_moderation_case($1, $2, $3::smallint, $4::jsonb, $5) AS open_moderation_case`,
      [
        input.targetType,
        input.targetId,
        severity,
        JSON.stringify({
          reason: input.reason,
          reports_in_window: Number(recent[0]?.reports ?? 1),
          distinct_reporters: distinctReporters,
          ...(repeated ? { repeat_reports_same_target: true } : {}),
        }),
        await this.resolveSubject(input.targetType, input.targetId),
      ],
    );

    const caseId = caseRows[0]!.open_moderation_case;

    await this.db.query(
      `UPDATE moderation_cases SET report_ids = array_append(report_ids, $2::uuid) WHERE id = $1`,
      [caseId, reportId],
    );

    // §14.2: three distinct reporters in a week auto-hides the target pending
    // review. Acting before a human looks is deliberate — the cost of hiding a
    // good listing for a few hours is far below the cost of leaving a scam up.
    if (repeated) {
      await this.hideTarget(input.targetType, input.targetId, caseId);
    }

    return { reportId, caseId };
  }

  /**
   * §12 GET /admin/moderation/queue.
   *
   * Scoped as the moderator: `moderation_staff_only` evaluates `is_staff()`,
   * which reads auth.uid(). An unscoped read here returns an empty queue and
   * looks like "no open cases" rather than like an error — the worst possible
   * failure mode for a moderation tool.
   */
  async queue(
    moderatorId: string,
    filters: { status?: string; severity?: number; limit?: number },
  ): Promise<unknown[]> {
    return this.db.queryAs(
      moderatorId,
      `SELECT c.id, c.target_type, c.target_id, c.status, c.severity, c.signals,
              c.report_ids, c.created_at, c.assigned_to, c.subject_profile_id,
              p.handle AS subject_handle, p.display_name AS subject_name,
              p.trust_score AS subject_trust_score,
              cardinality(c.report_ids) AS report_count
       FROM moderation_cases c
       LEFT JOIN profiles p ON p.id = c.subject_profile_id
       WHERE ($1::moderation_status IS NULL OR c.status = $1)
         AND ($2::int IS NULL OR c.severity >= $2)
       -- Severity first: a queue ordered by arrival buries the scam report
       -- behind fifty wrong-category ones.
       ORDER BY c.severity DESC, c.created_at
       LIMIT $3`,
      [filters.status ?? 'open', filters.severity ?? null, filters.limit ?? 50],
    );
  }

  /**
   * §12 POST /admin/moderation/:caseId/action.
   *
   * `upheld` is what §13.3 costs 20 trust points for, so it is recorded
   * explicitly rather than inferred from the action taken.
   */
  async act(
    caseId: string,
    moderatorId: string,
    input: {
      action: 'approve' | 'remove' | 'suspend' | 'dismiss';
      note?: string;
    },
  ): Promise<{ status: string; upheld: boolean }> {
    const rows = await this.db.queryAs<{
      id: string;
      target_type: string;
      target_id: string;
      subject_profile_id: string | null;
      status: string;
    }>(
      moderatorId,
      `SELECT id, target_type, target_id, subject_profile_id, status
       FROM moderation_cases WHERE id = $1`,
      [caseId],
    );

    const moderationCase = rows[0];
    if (!moderationCase) throw ApiException.notFound('Moderasyon kaydı');

    const upheld = input.action === 'remove' || input.action === 'suspend';
    const status = input.action === 'dismiss' || input.action === 'approve' ? 'dismissed' : 'actioned';

    await this.db.queryAs(
      moderatorId,
      `UPDATE moderation_cases
       SET status = $2::moderation_status, action_taken = $3, is_upheld = $4,
           assigned_to = $5, resolved_at = now()
       WHERE id = $1`,
      [caseId, status, input.action, upheld, moderatorId],
    );

    if (input.action === 'approve') {
      await this.releaseTarget(moderationCase.target_type, moderationCase.target_id);
    }

    if (input.action === 'remove') {
      await this.hideTarget(moderationCase.target_type, moderationCase.target_id, caseId);
    }

    if (input.action === 'suspend' && moderationCase.subject_profile_id) {
      await this.db.query(`SELECT moderation_suspend_profile($1, $2)`, [
        moderationCase.subject_profile_id,
        input.note ?? 'Moderasyon kararı',
      ]);
    }

    if (moderationCase.subject_profile_id) {
      // §13.3: an upheld action costs 20 points and forfeits the clean-record
      // bonus, so the score is recomputed the moment the decision lands. A
      // moderator is neither the subject nor covered by `profiles_update`, so
      // this goes through the derived-value function (migration 0031).
      await this.db.query(`SELECT refresh_trust_score($1)`, [
        moderationCase.subject_profile_id,
      ]);

      if (upheld) {
        // §17 `moderation.action`.
        await this.notifications.dispatch({
          profileId: moderationCase.subject_profile_id,
          type: 'moderation.action',
          title: 'İçeriğin kaldırıldı',
          body: input.note ?? 'İçeriğin topluluk kurallarına aykırı bulundu.',
          data: { caseId, action: input.action },
          channels: ['email', 'in_app'],
        });
      }
    }

    this.logger.log(`Moderation case ${caseId}: ${input.action} (upheld=${upheld})`);

    return { status, upheld };
  }

  /** §24.13 — blocking removes the blocked user from the blocker's surfaces. */
  async block(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) {
      throw ApiException.validation('Kendini engelleyemezsin.');
    }

    await this.db.withUser(blockerId, async (client) => {
      await client.query(
        `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [blockerId, blockedId],
      );

      // Existing threads freeze rather than disappear: §24.13 says blocking
      // freezes them, and deleting the history would also erase the evidence
      // a report might rest on.
      await client.query(
        `UPDATE conversation_participants SET blocked = TRUE
         WHERE profile_id = $1
           AND conversation_id IN (
             SELECT conversation_id FROM conversation_participants WHERE profile_id = $2)`,
        [blockerId, blockedId],
      );
    });
  }

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    await this.db.withUser(blockerId, (client) =>
      client.query(`DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`, [
        blockerId,
        blockedId,
      ]),
    );
  }

  /**
   * Holds a target pending review without destroying it.
   *
   * Routed through a SECURITY DEFINER function (migration 0031). The caller on
   * the automated path is the *reporter* — an ordinary user with no rights
   * over the listing they reported — so a scoped update would touch nothing
   * and leave flagged content live.
   */
  private async hideTarget(targetType: string, targetId: string, caseId: string): Promise<void> {
    await this.db.query(`SELECT moderation_hide_target($1, $2, $3)`, [
      targetType,
      targetId,
      `Moderasyon incelemesi (${caseId})`,
    ]);
  }

  /** Puts a cleared target back where it was. */
  private async releaseTarget(targetType: string, targetId: string): Promise<void> {
    await this.db.query(`SELECT moderation_release_target($1, $2)`, [targetType, targetId]);
  }

  /** Who a case is against — what §13.3's penalty attaches to. */
  private async resolveSubject(targetType: string, targetId: string): Promise<string | null> {
    const query: Record<string, string> = {
      listing: 'SELECT seller_profile_id AS id FROM listings WHERE id = $1',
      service: 'SELECT provider_profile_id AS id FROM service_listings WHERE id = $1',
      job: 'SELECT poster_profile_id AS id FROM job_listings WHERE id = $1',
      horse: 'SELECT owner_profile_id AS id FROM horses WHERE id = $1',
      media: 'SELECT owner_profile_id AS id FROM media WHERE id = $1',
      review: 'SELECT author_id AS id FROM reviews WHERE id = $1',
      profile: 'SELECT id FROM profiles WHERE id = $1',
    };

    const sql = query[targetType];
    if (!sql) return null;

    const rows = await this.db.query<{ id: string | null }>(sql, [targetId]);
    return rows[0]?.id ?? null;
  }
}
