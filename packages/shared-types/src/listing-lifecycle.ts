import type { ListingStatus, PriceType, VerificationLevel } from './enums.js';
import { meetsVerification } from './enums.js';

/**
 * Listing state machine and publish preconditions — spec §13.1.
 *
 * §24.21 requires 100% unit coverage on the listing lifecycle, so the
 * transitions are data rather than control flow: a table can be enumerated by
 * a test, a chain of if-statements cannot.
 */

export type ListingAction =
  | 'publish'
  | 'approve'
  | 'reject'
  | 'pause'
  | 'resume'
  | 'mark_under_offer'
  | 'revert_offer'
  | 'close_sold'
  | 'withdraw'
  | 'expire'
  | 'renew';

interface Transition {
  from: ListingStatus;
  action: ListingAction;
  to: ListingStatus;
  /** Only staff may fire it — approve/reject are moderation decisions. */
  staffOnly?: boolean;
}

export const TRANSITIONS: Transition[] = [
  { from: 'draft', action: 'publish', to: 'pending_review' },
  { from: 'pending_review', action: 'approve', to: 'active', staffOnly: true },
  { from: 'pending_review', action: 'reject', to: 'rejected', staffOnly: true },
  { from: 'rejected', action: 'publish', to: 'pending_review' },

  { from: 'active', action: 'pause', to: 'paused' },
  { from: 'paused', action: 'resume', to: 'active' },

  { from: 'active', action: 'mark_under_offer', to: 'under_offer' },
  { from: 'under_offer', action: 'revert_offer', to: 'active' },
  { from: 'under_offer', action: 'close_sold', to: 'sold' },
  { from: 'active', action: 'close_sold', to: 'sold' },

  { from: 'active', action: 'withdraw', to: 'withdrawn' },
  { from: 'paused', action: 'withdraw', to: 'withdrawn' },
  { from: 'under_offer', action: 'withdraw', to: 'withdrawn' },

  { from: 'active', action: 'expire', to: 'expired' },
  { from: 'paused', action: 'expire', to: 'expired' },
  { from: 'expired', action: 'renew', to: 'active' },
];

export function canTransition(from: ListingStatus, action: ListingAction): boolean {
  return TRANSITIONS.some((t) => t.from === from && t.action === action);
}

export function nextStatus(
  from: ListingStatus,
  action: ListingAction,
): ListingStatus | null {
  return TRANSITIONS.find((t) => t.from === from && t.action === action)?.to ?? null;
}

export function isStaffOnly(from: ListingStatus, action: ListingAction): boolean {
  return TRANSITIONS.find((t) => t.from === from && t.action === action)?.staffOnly ?? false;
}

/** Statuses a listing can be in while occupying its horse's active slot. */
export const OCCUPYING_STATUSES: ListingStatus[] = ['active', 'pending_review', 'under_offer'];

/** §13.1: expires_at = published_at + 60 days; reminder at day 53. */
export const LISTING_TTL_DAYS = 60;
export const LISTING_EXPIRY_REMINDER_DAY = 53;
/** §13.1: under_offer auto-reverts to active after 14 days of no change. */
export const UNDER_OFFER_TTL_DAYS = 14;
/** §13.4: review window after a conversation goes quiet or a listing closes. */
export const REVIEW_WINDOW_DAYS = 14;
/** §13.1: both parties are prompted to review 48h after a sale closes. */
export const REVIEW_PROMPT_DELAY_HOURS = 48;

export interface PublishPreconditionInput {
  sellerVerification: VerificationLevel;
  imageCount: number;
  priceAmount: number | null;
  priceType: PriceType;
  descriptionLength: number;
  horse: {
    breedId: string | null;
    sex: string | null;
    dateOfBirth: string | null;
    birthYearEstimated: boolean;
    heightCm: number | null;
  };
}

export interface PreconditionFailure {
  key: string;
  messageTr: string;
}

/**
 * §13.1 publish requirements. Returns every failure at once rather than the
 * first — the wizard (§18.2 S13) shows a checklist, and making the seller
 * discover blockers one round-trip at a time is the wrong shape.
 */
export function checkPublishPreconditions(
  input: PublishPreconditionInput,
): PreconditionFailure[] {
  const failures: PreconditionFailure[] = [];
  const { horse } = input;

  // §3.3 hard rule, and the single most important anti-fraud control.
  if (!meetsVerification(input.sellerVerification, 'identity_verified')) {
    failures.push({
      key: 'identity_required',
      messageTr: 'İlan yayınlamak için kimliğini doğrulaman gerekiyor.',
    });
  }

  if (input.imageCount < 3) {
    failures.push({
      key: 'min_images',
      messageTr: 'En az 3 fotoğraf ekle.',
    });
  }

  if (input.priceAmount === null && input.priceType !== 'on_request') {
    failures.push({
      key: 'price_required',
      messageTr: 'Fiyat gir veya “Fiyat sorunuz” seç.',
    });
  }

  if (!horse.breedId) {
    failures.push({ key: 'horse_breed', messageTr: 'Atın ırkını seç.' });
  }

  if (!horse.sex) {
    failures.push({ key: 'horse_sex', messageTr: 'Atın cinsiyetini seç.' });
  }

  // A birth year flagged as an estimate satisfies the requirement — §18.2 S10
  // step 1 offers exactly that toggle for horses with no papers.
  if (!horse.dateOfBirth) {
    failures.push({
      key: 'horse_dob',
      messageTr: 'Doğum tarihini gir veya yıl tahmini işaretle.',
    });
  }

  if (horse.heightCm === null) {
    failures.push({ key: 'horse_height', messageTr: 'Atın boyunu gir.' });
  }

  if (input.descriptionLength < 120) {
    failures.push({
      key: 'description_length',
      messageTr: 'Açıklama en az 120 karakter olmalı.',
    });
  }

  return failures;
}
