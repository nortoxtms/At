import { z } from 'zod';

import { REVIEW_WINDOW_DAYS } from './listing-lifecycle.js';

/**
 * Reviews — spec §13.4, §12 "Reviews", §24.12.
 *
 * §13.4 in full: "Only writable if a `conversation` exists between the parties
 * with ≥2 messages from **each** side, or a completed transfer. 14-day window
 * after the conversation goes quiet or the listing closes. Subject may post one
 * response; no threading. Reviews are never deletable by the subject; only
 * hidden by moderators with a logged reason."
 *
 * Every one of those clauses is a defence against the failure mode of every
 * classifieds review system: reviews written by people who never talked to the
 * seller. §24.12 makes it an acceptance criterion.
 */

export const reviewSubjectType = z.enum(['user', 'organization', 'listing_transaction']);
export type ReviewSubjectType = z.infer<typeof reviewSubjectType>;

export const createReviewSchema = z
  .object({
    subjectType: reviewSubjectType,
    subjectProfileId: z.string().uuid().optional(),
    subjectOrgId: z.string().uuid().optional(),
    /** The evidence of contact. Optional only when a transfer qualifies instead. */
    conversationId: z.string().uuid().optional(),

    rating: z.number().int().min(1).max(5),
    ratingCommunication: z.number().int().min(1).max(5).optional(),
    ratingAccuracy: z.number().int().min(1).max(5).optional(),
    ratingProfessionalism: z.number().int().min(1).max(5).optional(),
    body: z.string().trim().max(4000).optional(),
  })
  .refine((v) => Boolean(v.subjectProfileId) !== Boolean(v.subjectOrgId), {
    message: 'Değerlendirme bir kişiye ya da bir işletmeye yazılır.',
    path: ['subjectProfileId'],
  });
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

/** §13.4: one response, no threading — so this is a PATCH, not a POST. */
export const reviewResponseSchema = z.object({
  body: z.string().trim().min(2).max(2000),
});
export type ReviewResponseInput = z.infer<typeof reviewResponseSchema>;

export const hideReviewSchema = z.object({
  reason: z.string().trim().min(4, 'Gizleme gerekçesi zorunlu.').max(500),
});
export type HideReviewInput = z.infer<typeof hideReviewSchema>;

/**
 * §13.4's message threshold. The window itself (`REVIEW_WINDOW_DAYS`) and the
 * prompt delay (`REVIEW_PROMPT_DELAY_HOURS`) already live in
 * listing-lifecycle.ts, where the rest of §13.1's timings are — two copies of
 * "14" that could drift apart is exactly the bug this package exists to stop.
 */
export const MIN_MESSAGES_PER_SIDE = 2;

export type ReviewIneligibilityCode =
  | 'not_verified'
  | 'self_review'
  | 'no_qualifying_contact'
  | 'too_few_messages'
  | 'window_closed'
  | 'already_reviewed';

export interface ReviewEligibilityInput {
  /** §3.3: writing a review requires identity verification. */
  authorCanWriteReview: boolean;
  authorId: string;
  subjectId: string;
  messagesFromAuthor: number;
  messagesFromSubject: number;
  /** Last message in the conversation — when it went quiet. */
  lastMessageAt: string | null;
  /** Set when the listing the conversation was about has closed. */
  listingClosedAt?: string | null;
  /** §13.4's alternative qualifier: a completed ownership transfer. */
  transferCompletedAt?: string | null;
  alreadyReviewed: boolean;
  now?: Date;
}

export interface ReviewEligibility {
  eligible: boolean;
  code?: ReviewIneligibilityCode;
  messageTr?: string;
  /** When the right to review lapses — surfaced so the UI can say "3 gün kaldı". */
  windowClosesAt?: string;
}

/**
 * §13.4's window, read as a deadline rather than a delay.
 *
 * "14-day window after the conversation goes quiet or the listing closes" has
 * two readings: the window *opens* 14 days after, or it *closes* 14 days after.
 * The second is the one implemented — see ADR-0006. A review is about a
 * conversation both parties still remember, and forcing a fortnight of silence
 * before anyone may write one would collect fewer, staler reviews while giving
 * a bad actor two weeks of unrated trading.
 */
export function reviewWindowClosesAt(input: ReviewEligibilityInput): Date | null {
  const candidates = [input.lastMessageAt, input.listingClosedAt, input.transferCompletedAt]
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime());

  if (candidates.length === 0) return null;

  return new Date(Math.max(...candidates) + REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

export function checkReviewEligibility(input: ReviewEligibilityInput): ReviewEligibility {
  const now = input.now ?? new Date();

  if (input.authorId === input.subjectId) {
    return { eligible: false, code: 'self_review', messageTr: 'Kendini değerlendiremezsin.' };
  }

  if (!input.authorCanWriteReview) {
    return {
      eligible: false,
      code: 'not_verified',
      messageTr: 'Değerlendirme yazmak için kimliğini doğrulaman gerekiyor.',
    };
  }

  if (input.alreadyReviewed) {
    return {
      eligible: false,
      code: 'already_reviewed',
      messageTr: 'Bu görüşme için zaten bir değerlendirme yazdın.',
    };
  }

  const transferQualifies = Boolean(input.transferCompletedAt);
  const conversationQualifies =
    input.messagesFromAuthor >= MIN_MESSAGES_PER_SIDE &&
    input.messagesFromSubject >= MIN_MESSAGES_PER_SIDE;

  if (!transferQualifies && input.messagesFromAuthor + input.messagesFromSubject === 0) {
    return {
      eligible: false,
      code: 'no_qualifying_contact',
      messageTr: 'Değerlendirme yazmak için önce bu kişiyle yazışmış olman gerekiyor.',
    };
  }

  if (!transferQualifies && !conversationQualifies) {
    return {
      eligible: false,
      code: 'too_few_messages',
      messageTr: `Değerlendirme için iki tarafın da en az ${MIN_MESSAGES_PER_SIDE} mesaj yazmış olması gerekiyor.`,
    };
  }

  const closesAt = reviewWindowClosesAt(input);
  if (closesAt && closesAt.getTime() < now.getTime()) {
    return {
      eligible: false,
      code: 'window_closed',
      messageTr: `Değerlendirme süresi doldu (görüşmeden sonra ${REVIEW_WINDOW_DAYS} gün).`,
      windowClosesAt: closesAt.toISOString(),
    };
  }

  return { eligible: true, windowClosesAt: closesAt?.toISOString() };
}

export interface ReviewSummary {
  average: number | null;
  count: number;
  /** 1–5 star histogram, index 0 = one star. */
  histogram: [number, number, number, number, number];
  breakdown: {
    communication: number | null;
    accuracy: number | null;
    professionalism: number | null;
  };
}
