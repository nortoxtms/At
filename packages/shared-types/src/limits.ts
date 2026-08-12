import type { SubscriptionTier, VerificationLevel } from './enums.js';
import { meetsVerification } from './enums.js';

/**
 * The §3.3 capability matrix, encoded.
 *
 * §24.2 requires that publishing without identity verification is impossible
 * "from every client (mobile, web, direct API call)", and §24.9 requires
 * limits enforced server-side. Both clients import this to *predict* the
 * answer (so the UI can explain the block before the user taps), while the API
 * imports it to *decide*. The API check is the one that counts.
 */

export const UNLIMITED = Number.POSITIVE_INFINITY;

export interface CapabilityLimits {
  maxHorses: number;
  maxActiveSaleListings: number;
  maxActiveServiceListings: number;
  messagesPerDay: number;
  freeJobPostsPerMonth: number;
  canSeeSellerContact: boolean;
  canPublish: boolean;
  canBoost: boolean;
  canWriteReview: boolean;
}

/**
 * Entitlements come from two independent axes: how far up the verification
 * ladder the user is (§14.1) and what they pay for (§16.1). A Pro subscriber
 * who has not verified their identity still cannot publish — §3.3's hard rule
 * is deliberately not purchasable.
 */
export function resolveLimits(
  tier: SubscriptionTier,
  verification: VerificationLevel,
): CapabilityLimits {
  const identityVerified = meetsVerification(verification, 'identity_verified');
  const phoneVerified = meetsVerification(verification, 'phone_verified');

  const base: CapabilityLimits = {
    maxHorses: 3,
    maxActiveSaleListings: 0,
    maxActiveServiceListings: 0,
    messagesPerDay: 3,
    freeJobPostsPerMonth: 0,
    canSeeSellerContact: false,
    canPublish: false,
    canBoost: false,
    canWriteReview: false,
  };

  if (phoneVerified) {
    base.messagesPerDay = 20;
  }

  if (identityVerified) {
    base.maxHorses = 10;
    base.maxActiveSaleListings = 3;
    base.maxActiveServiceListings = 1;
    base.canSeeSellerContact = true;
    base.canPublish = true;
    base.canBoost = true;
    base.canWriteReview = true;
  }

  if (tier === 'pro') {
    base.maxHorses = 50;
    base.maxActiveSaleListings = identityVerified ? 10 : 0;
    base.maxActiveServiceListings = identityVerified ? 5 : 0;
    base.messagesPerDay = UNLIMITED;
    base.canSeeSellerContact = true;
  }

  if (tier === 'business') {
    base.maxHorses = UNLIMITED;
    base.maxActiveSaleListings = identityVerified ? UNLIMITED : 0;
    base.maxActiveServiceListings = identityVerified ? UNLIMITED : 0;
    base.messagesPerDay = UNLIMITED;
    base.freeJobPostsPerMonth = 5;
    base.canSeeSellerContact = true;
  }

  return base;
}

/** §16.1 — prices are configuration, never hardcoded in UI. */
export interface Product {
  key: string;
  amountEur: number;
  interval?: 'month' | 'year';
  durationDays?: number;
  stripePriceEnvVar: string;
}

export const PRODUCTS: Record<string, Product> = {
  pro_monthly: {
    key: 'pro_monthly',
    amountEur: 19,
    interval: 'month',
    stripePriceEnvVar: 'STRIPE_PRICE_PRO_MONTHLY',
  },
  pro_yearly: {
    key: 'pro_yearly',
    amountEur: 190,
    interval: 'year',
    stripePriceEnvVar: 'STRIPE_PRICE_PRO_YEARLY',
  },
  business_monthly: {
    key: 'business_monthly',
    amountEur: 99,
    interval: 'month',
    stripePriceEnvVar: 'STRIPE_PRICE_BUSINESS_MONTHLY',
  },
  business_yearly: {
    key: 'business_yearly',
    amountEur: 990,
    interval: 'year',
    stripePriceEnvVar: 'STRIPE_PRICE_BUSINESS_YEARLY',
  },
  boost_7d: {
    key: 'boost_7d',
    amountEur: 19,
    durationDays: 7,
    stripePriceEnvVar: 'STRIPE_PRICE_BOOST_7D',
  },
  boost_30d: {
    key: 'boost_30d',
    amountEur: 49,
    durationDays: 30,
    stripePriceEnvVar: 'STRIPE_PRICE_BOOST_30D',
  },
  job_post: {
    key: 'job_post',
    amountEur: 79,
    stripePriceEnvVar: 'STRIPE_PRICE_JOB_POST',
  },
  featured_profile_30d: {
    key: 'featured_profile_30d',
    amountEur: 39,
    durationDays: 30,
    stripePriceEnvVar: 'STRIPE_PRICE_FEATURED_PROFILE_30D',
  },
};

/** §12 rate limits, per profile on a sliding window. */
export const RATE_LIMITS = {
  auth: { limit: 10, windowSeconds: 300, per: 'ip' },
  createConversation: { limit: null, windowSeconds: 86400, per: 'profile' }, // tier-based
  createReport: { limit: 20, windowSeconds: 86400, per: 'profile' },
  createListing: { limit: 20, windowSeconds: 86400, per: 'profile' },
  mediaUploadIntent: { limit: 100, windowSeconds: 3600, per: 'profile' },
  search: { limit: 120, windowSeconds: 60, per: 'profile' },
} as const;
