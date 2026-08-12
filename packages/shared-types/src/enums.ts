import { z } from 'zod';

/**
 * Mirrors of the PostgreSQL enums in db/migrations/0002_enums.sql (spec §7).
 *
 * These are the single source of truth for api, web and mobile. When an enum
 * changes, add the value in the migration and here in the same commit —
 * `pnpm typecheck` then fails on every switch that no longer covers it.
 */

export const roleType = z.enum([
  'horse_owner',
  'trainer',
  'rider',
  'groom',
  'farrier',
  'veterinarian',
  'equine_therapist',
  'breeder',
  'transporter',
  'instructor',
  'photographer',
  'saddler',
  'ranch_manager',
  'agent',
]);
export type RoleType = z.infer<typeof roleType>;

/**
 * The verification ladder (§14.1) is ordered: each rung implies the ones below
 * it. `verificationRank` exists so comparisons like "publishing requires
 * >= identity_verified" (§3.3) are written once.
 */
export const verificationLevel = z.enum([
  'none',
  'email_verified',
  'phone_verified',
  'identity_verified',
  'professional_verified',
  'business_verified',
]);
export type VerificationLevel = z.infer<typeof verificationLevel>;

export const verificationRank: Record<VerificationLevel, number> = {
  none: 0,
  email_verified: 1,
  phone_verified: 2,
  identity_verified: 3,
  professional_verified: 4,
  business_verified: 5,
};

export function meetsVerification(
  actual: VerificationLevel,
  required: VerificationLevel,
): boolean {
  return verificationRank[actual] >= verificationRank[required];
}

export const horseSex = z.enum(['mare', 'stallion', 'gelding', 'filly', 'colt']);
export type HorseSex = z.infer<typeof horseSex>;

export const horseStatus = z.enum(['active', 'sold', 'retired', 'deceased', 'archived']);
export type HorseStatus = z.infer<typeof horseStatus>;

export const listingType = z.enum(['sale', 'lease', 'half_lease', 'share', 'stud', 'loan']);
export type ListingType = z.infer<typeof listingType>;

export const listingStatus = z.enum([
  'draft',
  'pending_review',
  'active',
  'paused',
  'under_offer',
  'sold',
  'expired',
  'rejected',
  'withdrawn',
]);
export type ListingStatus = z.infer<typeof listingStatus>;

export const fieldVisibility = z.enum(['public', 'on_request', 'private']);
export type FieldVisibility = z.infer<typeof fieldVisibility>;

export const healthRecordType = z.enum([
  'vaccination',
  'deworming',
  'dental',
  'farrier',
  'vet_exam',
  'ppe',
  'surgery',
  'injury',
  'lameness',
  'xray',
  'lab_result',
  'medication',
  'other',
]);
export type HealthRecordType = z.infer<typeof healthRecordType>;

export const jobType = z.enum([
  'full_time',
  'part_time',
  'seasonal',
  'contract',
  'internship',
  'working_student',
]);
export type JobType = z.infer<typeof jobType>;

export const applicationStatus = z.enum([
  'submitted',
  'viewed',
  'shortlisted',
  'interview',
  'offered',
  'rejected',
  'withdrawn',
]);
export type ApplicationStatus = z.infer<typeof applicationStatus>;

export const orgType = z.enum([
  'ranch',
  'stable',
  'riding_school',
  'breeding_farm',
  'clinic',
  'transport_company',
  'retailer',
  'other',
]);
export type OrgType = z.infer<typeof orgType>;

export const orgMemberRole = z.enum(['owner', 'admin', 'staff']);
export type OrgMemberRole = z.infer<typeof orgMemberRole>;

export const subscriptionTier = z.enum(['free', 'pro', 'business']);
export type SubscriptionTier = z.infer<typeof subscriptionTier>;

export const subscriptionStatus = z.enum([
  'active',
  'trialing',
  'past_due',
  'canceled',
  'incomplete',
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatus>;

export const moderationStatus = z.enum(['open', 'in_review', 'actioned', 'dismissed']);
export type ModerationStatus = z.infer<typeof moderationStatus>;

export const mediaType = z.enum(['image', 'video', 'document']);
export type MediaType = z.infer<typeof mediaType>;

export const mediaStatus = z.enum(['uploading', 'processing', 'ready', 'failed', 'removed']);
export type MediaStatus = z.infer<typeof mediaStatus>;

export const grantStatus = z.enum(['requested', 'granted', 'denied', 'revoked', 'expired']);
export type GrantStatus = z.infer<typeof grantStatus>;

export const notificationChannel = z.enum(['push', 'email', 'in_app']);
export type NotificationChannel = z.infer<typeof notificationChannel>;

/** §18.2 S10 step 5 / §13.2: video categories feed the quality score. */
export const mediaCategory = z.enum([
  'general',
  'conformation',
  'under_saddle',
  'walk',
  'trot',
  'canter',
  'jumping',
  'free_movement',
  'xray',
  'document',
]);
export type MediaCategory = z.infer<typeof mediaCategory>;

export const priceType = z.enum([
  'fixed',
  'negotiable',
  'on_request',
  'auction_reserve',
  'free',
]);
export type PriceType = z.infer<typeof priceType>;
