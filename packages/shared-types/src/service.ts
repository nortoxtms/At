import { z } from 'zod';

import { booleanParam, locationParams, pagingParams, type SearchResult } from './params.js';

/**
 * Service listings — spec §7, §9.3, §12 "Services", §18.2 S15/S16.
 *
 * A service is a provider's standing offer (nalbant, nakliye, pansiyon), not a
 * horse. It shares the listing lifecycle enum with horse listings but almost
 * nothing else: there is no quality score, no welfare policy and no per-horse
 * media, because none of those describe a farrier.
 */

/** §7's `price_unit` check constraint, mirrored so the client can label it. */
export const servicePriceUnit = z.enum(['hour', 'session', 'day', 'week', 'month', 'job', 'km']);
export type ServicePriceUnit = z.infer<typeof servicePriceUnit>;

export const createServiceSchema = z
  .object({
    category: z.string().trim().min(2).max(60),
    title: z.string().trim().min(4, 'Başlık en az 4 karakter olmalı.').max(140),
    description: z.string().trim().min(30, 'Açıklama en az 30 karakter olmalı.').max(8000),

    priceMin: z.number().nonnegative().max(9_999_999).optional(),
    priceMax: z.number().nonnegative().max(9_999_999).optional(),
    priceUnit: servicePriceUnit.optional(),
    currency: z.string().length(3).default('EUR'),

    countryCode: z.string().length(2),
    region: z.string().trim().max(120).optional(),
    city: z.string().trim().max(120).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),

    /** §18.2 S16 draws this as a coverage circle, so it needs a centre. */
    serviceRadiusKm: z.number().int().min(1).max(2000).optional(),
    isMobile: z.boolean().default(false),
    availabilityNote: z.string().trim().max(500).optional(),

    organizationId: z.string().uuid().optional(),
  })
  .refine((value) => value.priceMin === undefined || value.priceMax === undefined || value.priceMax >= value.priceMin, {
    message: 'Üst fiyat alt fiyattan küçük olamaz.',
    path: ['priceMax'],
  })
  // A radius without a centre cannot be drawn or filtered on; accepting it
  // would put the service in "yakınımda" results for nobody.
  .refine((value) => value.serviceRadiusKm === undefined || (value.lat !== undefined && value.lng !== undefined), {
    message: 'Hizmet yarıçapı için konum seçmelisin.',
    path: ['serviceRadiusKm'],
  });
export type CreateServiceInput = z.infer<typeof createServiceSchema>;

export const updateServiceSchema = z
  .object({
    category: z.string().trim().min(2).max(60).optional(),
    title: z.string().trim().min(4).max(140).optional(),
    description: z.string().trim().min(30).max(8000).optional(),
    priceMin: z.number().nonnegative().max(9_999_999).nullish(),
    priceMax: z.number().nonnegative().max(9_999_999).nullish(),
    priceUnit: servicePriceUnit.nullish(),
    currency: z.string().length(3).optional(),
    countryCode: z.string().length(2).optional(),
    region: z.string().trim().max(120).nullish(),
    city: z.string().trim().max(120).nullish(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    serviceRadiusKm: z.number().int().min(1).max(2000).nullish(),
    isMobile: z.boolean().optional(),
    availabilityNote: z.string().trim().max(500).nullish(),
  })
  .refine((value) => value.priceMin == null || value.priceMax == null || value.priceMax >= value.priceMin, {
    message: 'Üst fiyat alt fiyattan küçük olamaz.',
    path: ['priceMax'],
  });
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

/** §18.2 S15's filter bar. */
export const serviceSearchSchema = z.object({
  q: z.string().trim().max(200).optional(),
  categories: z.array(z.string().max(60)).optional(),
  ...locationParams,

  /** Includes providers whose coverage radius reaches the search point. */
  includeRadiusMatches: booleanParam.default(true),
  isMobile: booleanParam.optional(),
  priceMaxEur: z.coerce.number().nonnegative().optional(),
  verifiedOnly: booleanParam.optional(),
  minRating: z.coerce.number().min(1).max(5).optional(),


  /**
   * §24.13: "Blocking a user removes them from search results and hides their
   * listings from the blocker." Set by the API from the viewer's own block
   * list — never from client input, which is why it is not documented as a
   * filter. A client that sends it can only hide results from itself.
   */
  excludeProfileIds: z.array(z.string().uuid()).max(500).optional(),
  sort: z.enum(['recommended', 'newest', 'distance', 'rating', 'price_asc']).default('recommended'),
  ...pagingParams,
});
export type ServiceSearchQuery = z.infer<typeof serviceSearchSchema>;

export interface ServiceSearchHit {
  id: string;
  slug: string;
  title: string;
  category: string;
  providerId: string;
  providerName: string;
  providerVerification: string;
  providerTrustScore: number;
  providerAvatar: string | null;
  organizationName: string | null;
  priceMin: number | null;
  priceMax: number | null;
  priceUnit: string | null;
  currency: string;
  countryCode: string;
  region: string | null;
  city: string | null;
  distanceKm: number | null;
  isMobile: boolean;
  serviceRadiusKm: number | null;
  ratingAverage: number | null;
  ratingCount: number;
  publishedAt: string | null;
}

/**
 * §26: "show a regulatory notice on transport service listings (EU Reg.
 * 1/2005 and national equivalents)".
 *
 * Returned by the API with the listing rather than hardcoded in each client,
 * so a mobile release cannot lag a change to the notice.
 */
export const TRANSPORT_CATEGORY = 'transport';

export const TRANSPORT_NOTICE = {
  tr:
    'Canlı hayvan taşımacılığı yetki belgesi gerektirir (AB 1/2005 sayılı Tüzük ve ulusal ' +
    'karşılıkları). Taşıyıcıdan yetki belgesini ve araç onayını görmeden anlaşma yapma.',
  en:
    'Transporting live animals requires authorisation (EU Reg. 1/2005 and national ' +
    'equivalents). Ask the transporter for their authorisation and vehicle approval before booking.',
} as const;

export function serviceNoticeFor(category: string): typeof TRANSPORT_NOTICE | null {
  return category === TRANSPORT_CATEGORY ? TRANSPORT_NOTICE : null;
}

export type ServiceSearchResult = SearchResult<ServiceSearchHit>;
