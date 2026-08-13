import { Injectable, Logger } from '@nestjs/common';
import {
  checkReviewEligibility,
  type CreateReviewInput,
  findContactInfo,
  type ReviewEligibility,
  type ReviewSummary,
} from '@only-horses/shared-types';

import { ApiException } from '../../common/filters/api-exception.filter.js';
import { DatabaseService } from '../../database/database.service.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

/**
 * Reviews — spec §13.4, §12, §24.12.
 *
 * The eligibility rule is the whole feature. Any classifieds site can collect
 * five-star ratings; what makes them worth reading is that they can only be
 * written by someone who actually dealt with the subject — §13.4's "≥2 messages
 * from each side, or a completed transfer" — and only inside a window while
 * both parties still remember it.
 *
 * `checkReviewEligibility` in shared-types decides. This service's job is to
 * gather the facts it needs honestly.
 */
@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly entitlements: EntitlementsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** §12 POST /reviews. */
  async create(profileId: string, input: CreateReviewInput): Promise<{ id: string }> {
    const subjectId = input.subjectProfileId ?? (await this.orgOwner(input.subjectOrgId!));

    const eligibility = await this.eligibility(profileId, {
      conversationId: input.conversationId,
      subjectProfileId: subjectId,
      subjectOrgId: input.subjectOrgId,
    });

    if (!eligibility.eligible) {
      // §24.12 is an acceptance criterion; this is the line that satisfies it.
      // The code travels with it so the client can say *why* — "önce yazış",
      // "süre doldu" — instead of a flat refusal.
      throw new ApiException('FORBIDDEN', eligibility.messageTr!, 403, {
        reason: eligibility.code,
      });
    }

    if (input.body) this.assertNoContactInfo(input.body);

    const rows = await this.db.withUser(profileId, async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO reviews (
           author_id, subject_type, subject_profile_id, subject_org_id, conversation_id,
           rating, rating_communication, rating_accuracy, rating_professionalism,
           body, is_verified_contact, author_name_snapshot)
         SELECT $1, $2::review_subject_type, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, p.display_name
         FROM profiles p WHERE p.id = $1
         RETURNING id`,
        [
          profileId,
          input.subjectType,
          input.subjectProfileId ?? null,
          input.subjectOrgId ?? null,
          input.conversationId ?? null,
          input.rating,
          input.ratingCommunication ?? null,
          input.ratingAccuracy ?? null,
          input.ratingProfessionalism ?? null,
          input.body ?? null,
        ],
      );
      return result.rows;
    });

    const review = rows[0]!;

    // §13.3 counts reviews in the trust score; the trigger from §7 recomputes
    // the subject's, so nothing is done here beyond telling them.
    await this.notifications.dispatch({
      profileId: subjectId,
      type: 'review.received',
      title: 'Yeni değerlendirme',
      body: `${input.rating}/5${input.body ? ` · ${input.body.slice(0, 100)}` : ''}`,
      data: { reviewId: review.id },
      channels: ['push', 'in_app'],
    });

    this.logger.log(`Review ${review.id} written by ${profileId}`);
    return review;
  }

  /**
   * §13.4's eligibility, answered before the user writes anything.
   *
   * §18.2 S23 shows a "Değerlendir" button; showing it and then refusing the
   * submission wastes the one moment someone was willing to write a review.
   */
  async eligibility(
    profileId: string,
    input: { conversationId?: string; subjectProfileId?: string; subjectOrgId?: string },
  ): Promise<ReviewEligibility> {
    const subjectId = input.subjectProfileId ?? (input.subjectOrgId ? await this.orgOwner(input.subjectOrgId) : null);
    if (!subjectId) throw ApiException.validation('Değerlendirilecek kişi belirtilmedi.');

    const entitlements = await this.entitlements.forProfile(profileId);

    const facts = await this.gatherFacts(profileId, subjectId, input.conversationId);

    return checkReviewEligibility({
      authorCanWriteReview: entitlements.limits.canWriteReview,
      authorId: profileId,
      subjectId,
      ...facts,
    });
  }

  /**
   * §13.4 PATCH /reviews/:id/response — "Subject may post one response; no
   * threading."
   */
  async respond(profileId: string, reviewId: string, body: string): Promise<void> {
    this.assertNoContactInfo(body);

    // Authorization before state, and the order is not cosmetic: `reviews` is
    // publicly readable, so checking `response_at` first told a passer-by
    // "you already answered this" about a review they had never seen.
    const existing = await this.db.queryAs<{
      id: string;
      response_at: string | null;
      subject_profile_id: string | null;
      org_admin: boolean;
    }>(
      profileId,
      `SELECT id, response_at, subject_profile_id,
              (subject_org_id IS NOT NULL
               AND is_org_member(subject_org_id, ARRAY['owner','admin']::org_member_role[])) AS org_admin
       FROM reviews WHERE id = $1`,
      [reviewId],
    );

    const review = existing[0];
    if (!review) throw ApiException.notFound('Değerlendirme');

    if (review.subject_profile_id !== profileId && !review.org_admin) {
      throw ApiException.forbidden('Yalnızca değerlendirilen kişi yanıt verebilir.');
    }

    if (review.response_at) {
      throw ApiException.validation('Bu değerlendirmeye zaten yanıt verdin. Tek yanıt hakkın var.');
    }

    // `reviews_update` (and 0037's org policy) is what restricts this to the
    // subject; a row updated by anyone else matches no policy and returns 0.
    const updated = await this.db.withUser(profileId, async (client) => {
      const result = await client.query<{ id: string }>(
        `UPDATE reviews SET response_body = $2, response_at = now()
         WHERE id = $1 AND response_at IS NULL
         RETURNING id`,
        [reviewId, body],
      );
      return result.rows;
    });

    if (!updated[0]) throw ApiException.forbidden('Yalnızca değerlendirilen kişi yanıt verebilir.');
  }

  /**
   * §13.4: "Reviews are never deletable by the subject; only hidden by
   * moderators with a logged reason." There is deliberately no delete method
   * on this service.
   */
  async hide(moderatorId: string, reviewId: string, reason: string): Promise<void> {
    const rows = await this.db.query<{ moderation_hide_review: boolean }>(
      // system: the function checks staff membership itself (migration 0037)
      // and refuses an empty reason.
      `SELECT moderation_hide_review($1, $2, $3)`,
      [reviewId, moderatorId, reason],
    );

    if (!rows[0]?.moderation_hide_review) throw ApiException.notFound('Değerlendirme');
    this.logger.log(`Review ${reviewId} hidden by ${moderatorId}: ${reason}`);
  }

  /** §18.2 S23's review list with its rating breakdown. */
  async listFor(subject: { profileId?: string; orgId?: string }, page = 1, limit = 20): Promise<{
    reviews: unknown[];
    summary: ReviewSummary;
  }> {
    const [reviews, summary] = await Promise.all([
      this.db.query(
        `SELECT r.id, r.rating, r.rating_communication, r.rating_accuracy,
                r.rating_professionalism, r.body, r.response_body, r.response_at,
                r.is_verified_contact, r.created_at,
                -- §24.14: a deleted author leaves the review standing under the
                -- name snapshot taken when it was written.
                COALESCE(p.display_name, r.author_name_snapshot, 'Silinmiş kullanıcı') AS author_name,
                p.handle AS author_handle,
                av.cf_image_id AS author_avatar
         FROM reviews r
         LEFT JOIN profiles p ON p.id = r.author_id AND p.deleted_at IS NULL
         LEFT JOIN media av ON av.id = p.avatar_media_id
         WHERE r.is_hidden = FALSE
           AND ($1::uuid IS NULL OR r.subject_profile_id = $1)
           AND ($2::uuid IS NULL OR r.subject_org_id = $2)
         ORDER BY r.created_at DESC
         LIMIT $3 OFFSET $4`,
        [subject.profileId ?? null, subject.orgId ?? null, limit, (page - 1) * limit],
      ),
      this.summaryFor(subject),
    ]);

    return { reviews, summary };
  }

  async summaryFor(subject: { profileId?: string; orgId?: string }): Promise<ReviewSummary> {
    const rows = await this.db.query<{
      average: string | null;
      total: string;
      stars_1: string;
      stars_2: string;
      stars_3: string;
      stars_4: string;
      stars_5: string;
      communication: string | null;
      accuracy: string | null;
      professionalism: string | null;
    }>(`SELECT * FROM review_summary($1, $2)`, [subject.profileId ?? null, subject.orgId ?? null]);

    const row = rows[0];

    return {
      average: row?.average === null || row?.average === undefined ? null : Number(row.average),
      count: Number(row?.total ?? 0),
      histogram: [
        Number(row?.stars_1 ?? 0),
        Number(row?.stars_2 ?? 0),
        Number(row?.stars_3 ?? 0),
        Number(row?.stars_4 ?? 0),
        Number(row?.stars_5 ?? 0),
      ],
      breakdown: {
        communication: row?.communication ? Number(row.communication) : null,
        accuracy: row?.accuracy ? Number(row.accuracy) : null,
        professionalism: row?.professionalism ? Number(row.professionalism) : null,
      },
    };
  }

  /**
   * The facts §13.4 needs: how many messages each side sent, when the thread
   * went quiet, whether the listing it was about has closed, and whether a
   * horse changed hands between these two people.
   */
  private async gatherFacts(
    authorId: string,
    subjectId: string,
    conversationId?: string,
  ): Promise<{
    messagesFromAuthor: number;
    messagesFromSubject: number;
    lastMessageAt: string | null;
    listingClosedAt: string | null;
    transferCompletedAt: string | null;
    alreadyReviewed: boolean;
  }> {
    // Scoped to the author: `conversation_participants` is readable by
    // participants only, which is exactly the check that must pass — an
    // outsider naming someone else's conversation id gets zeroes, not facts.
    const conversation = conversationId
      ? await this.db.queryAs<{
          author_messages: string;
          subject_messages: string;
          last_message_at: string | null;
          listing_closed_at: string | null;
        }>(
          authorId,
          `SELECT
             COALESCE(MAX(CASE WHEN p.profile_id = $2 THEN p.message_count END), 0) AS author_messages,
             COALESCE(MAX(CASE WHEN p.profile_id = $3 THEN p.message_count END), 0) AS subject_messages,
             MAX(c.last_message_at) AS last_message_at,
             MAX(l.closed_at) AS listing_closed_at
           FROM conversations c
           JOIN conversation_participants p ON p.conversation_id = c.id
           LEFT JOIN listings l ON c.context_type = 'listing' AND l.id = c.context_id
           WHERE c.id = $1`,
          [conversationId, authorId, subjectId],
        )
      : [];

    const [transfer, reviewed] = await Promise.all([
      this.db.query<{ transferred_at: string | null }>(
        // §13.4's alternative qualifier, through a SECURITY DEFINER function
        // (migration 0038): neither party to a completed sale can see the
        // other's ownership row, so asked directly this is always "no".
        // Either direction counts — buyer and seller both earn the right.
        `SELECT ownership_transfer_between($1, $2)::text AS transferred_at`,
        [authorId, subjectId],
      ),
      this.db.queryAs<{ id: string }>(
        authorId,
        `SELECT id FROM reviews
         WHERE author_id = $1
           AND (($2::uuid IS NOT NULL AND conversation_id = $2)
                OR ($2::uuid IS NULL AND subject_profile_id = $3))
         LIMIT 1`,
        [authorId, conversationId ?? null, subjectId],
      ),
    ]);

    return {
      messagesFromAuthor: Number(conversation[0]?.author_messages ?? 0),
      messagesFromSubject: Number(conversation[0]?.subject_messages ?? 0),
      lastMessageAt: conversation[0]?.last_message_at ?? null,
      listingClosedAt: conversation[0]?.listing_closed_at ?? null,
      transferCompletedAt: transfer[0]?.transferred_at ?? null,
      alreadyReviewed: Boolean(reviewed[0]),
    };
  }

  private assertNoContactInfo(body: string): void {
    const found = findContactInfo(body);
    if (found.length > 0) {
      throw ApiException.validation('Değerlendirmede iletişim bilgisi paylaşamazsın.', { found });
    }
  }

  private async orgOwner(organizationId: string): Promise<string> {
    // system: `org_members_select` shows the roster to members only, and the
    // reviewer is by definition not one. A SECURITY DEFINER function
    // (migration 0042) answers with the one id the notification needs.
    const rows = await this.db.query<{ organization_owner: string | null }>(
      `SELECT organization_owner($1)`,
      [organizationId],
    );

    const owner = rows[0]?.organization_owner;
    if (!owner) throw ApiException.notFound('İşletme');
    return owner;
  }
}
