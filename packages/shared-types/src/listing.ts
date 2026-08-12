import { z } from 'zod';

import { fieldVisibility, listingType, priceType } from './enums.js';

/**
 * Boolean query parameter.
 *
 * NOT z.coerce.boolean(): that applies JavaScript truthiness, so the string
 * "false" coerces to `true` and `?includeOnRequest=false` silently does
 * nothing. Every filter in §18.2 S07 that can be switched off depends on this
 * parsing the way a reader would expect.
 */
const booleanParam = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0', 'yes', 'no'])])
  .transform((value) =>
    typeof value === 'boolean' ? value : ['true', '1', 'yes'].includes(value),
  );

/**
 * Listing schemas — spec §7, §13.1, §18.2 S13 (the eight-step wizard).
 *
 * A listing is temporary and points at exactly one horse (§2). Nothing here
 * duplicates horse data: breed, height and age live on the horse and are
 * denormalized into the search document at index time, so editing the horse
 * updates every listing that references it.
 */

export const createListingSchema = z.object({
  horseId: z.string().uuid(),
  type: listingType,

  title: z.string().trim().min(4, 'Başlık en az 4 karakter olmalı.').max(140),
  summary: z.string().trim().max(280).optional(),
  description: z.string().trim().max(8000).optional(),

  priceAmount: z.number().nonnegative().max(99_999_999).optional(),
  priceCurrency: z.string().length(3).default('EUR'),
  priceType: priceType.default('fixed'),
  // Leases are quoted per period; a sale price with a period is a mistake the
  // wizard should not be able to produce.
  pricePeriod: z.enum(['month', 'season', 'year']).optional(),
  vatIncluded: z.boolean().optional(),

  trialAllowed: z.boolean().default(true),
  ppeWelcome: z.boolean().default(true),
  transportHelp: z.boolean().default(false),
  suitableFor: z.array(z.string().max(60)).max(10).default([]),

  countryCode: z.string().length(2),
  region: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),

  // §18.2 S13 step 5 — per-section visibility, applied to the horse record.
  visibilityHealth: fieldVisibility.optional(),
  visibilityPedigree: fieldVisibility.optional(),
  visibilityDocuments: fieldVisibility.optional(),
  visibilityLocation: fieldVisibility.optional(),
});
export type CreateListingInput = z.infer<typeof createListingSchema>;

export const updateListingSchema = createListingSchema.partial().omit({ horseId: true });
export type UpdateListingInput = z.infer<typeof updateListingSchema>;

/** §12 POST /listings/:id/close. */
export const closeListingSchema = z
  .object({
    reason: z.enum(['sold_on_platform', 'sold_elsewhere', 'not_selling', 'other']),
    soldToProfileId: z.string().uuid().optional(),
    price: z.number().nonnegative().optional(),
    /** §18.2 S14: "fiyatı gizli tut". */
    pricePublic: z.boolean().default(false),
  })
  .refine(
    (value) => value.reason !== 'sold_on_platform' || Boolean(value.soldToProfileId),
    {
      message: 'Alıcıyı seç.',
      path: ['soldToProfileId'],
    },
  );
export type CloseListingInput = z.infer<typeof closeListingSchema>;

/**
 * Search query — spec §18.2 S07 (the filter sheet) and §11.
 *
 * Shared so the filter sheet, the saved search stored in `saved_searches.query`
 * and the API all agree on one shape. A saved search is literally this object
 * persisted, so any field added here becomes alertable without a migration.
 */
export const listingSearchSchema = z.object({
  q: z.string().trim().max(200).optional(),

  // Konum
  countryCode: z.string().length(2).optional(),
  region: z.string().max(120).optional(),
  city: z.string().max(120).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(10).max(500).optional(),
  transportHelp: booleanParam.optional(),

  // Tür
  types: z.array(listingType).optional(),

  // Fiyat — filtering is always in EUR (§11.3); display keeps the original.
  priceMinEur: z.coerce.number().nonnegative().optional(),
  priceMaxEur: z.coerce.number().nonnegative().optional(),
  includeOnRequest: booleanParam.default(true),

  // At özellikleri
  ageMin: z.coerce.number().min(0).max(40).optional(),
  ageMax: z.coerce.number().min(0).max(40).optional(),
  heightMinCm: z.coerce.number().min(50).max(220).optional(),
  heightMaxCm: z.coerce.number().min(50).max(220).optional(),
  sexes: z.array(z.enum(['mare', 'stallion', 'gelding', 'filly', 'colt'])).optional(),
  breeds: z.array(z.string().max(60)).optional(),
  disciplines: z.array(z.string().max(60)).optional(),
  trainingLevels: z.array(z.string().max(60)).optional(),
  riderLevels: z.array(z.string().max(60)).optional(),
  colors: z.array(z.string().max(60)).optional(),

  // Medya
  hasVideo: booleanParam.optional(),
  hasXray: booleanParam.optional(),

  // Satıcı
  verifiedSellersOnly: booleanParam.optional(),
  sellerType: z.enum(['any', 'business', 'individual']).default('any'),

  // Diğer
  trialAllowed: booleanParam.optional(),
  ppeWelcome: booleanParam.optional(),

  sort: z
    .enum(['recommended', 'newest', 'price_asc', 'price_desc', 'distance', 'most_viewed'])
    .default('recommended'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});
export type ListingSearchQuery = z.infer<typeof listingSearchSchema>;

/**
 * §11.2 ranking: `_text_match:desc, boost_rank:desc, quality_score:desc,
 * published_at:desc`, with boosted results capped at 2 per 20-result page and
 * labelled. The cap lives here because it is a promise to buyers, not a
 * Typesense setting — a page that is half advertising stops being a search
 * result.
 */
export const BOOSTED_PER_PAGE = 2;
export const BOOSTED_RANK = 2;

export interface ListingSearchHit {
  id: string;
  slug: string;
  title: string;
  horseName: string;
  listingType: string;
  breed: string | null;
  sex: string;
  ageYears: number | null;
  heightCm: number | null;
  color: string | null;
  disciplines: string[];
  priceAmount: number | null;
  priceCurrency: string;
  priceEur: number | null;
  priceType: string;
  countryCode: string;
  region: string | null;
  city: string | null;
  distanceKm: number | null;
  sellerVerification: string;
  sellerTrustScore: number;
  hasVideo: boolean;
  hasXray: boolean;
  qualityScore: number;
  isBoosted: boolean;
  coverImage: string | null;
  coverBlurhash: string | null;
  publishedAt: string | null;
}

export interface ListingSearchResult {
  hits: ListingSearchHit[];
  found: number;
  page: number;
  limit: number;
  facets: Record<string, { value: string; count: number }[]>;
  tookMs: number;
}
