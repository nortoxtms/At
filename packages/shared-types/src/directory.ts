import { z } from 'zod';

import { roleType } from './enums.js';
import { booleanParam, locationParams, pagingParams, type SearchResult } from './params.js';

/**
 * Professional directory — spec §11.1 (`professionals` collection), §23 M4,
 * §18.2 S23.
 *
 * The directory indexes people, not listings, and that changes what may be in
 * the document. A profile is indexed only if it carries at least one public
 * role profile: §7 makes `role_profiles.is_public` the switch, and a buyer
 * browsing "nalbant" should never surface someone who registered to buy a
 * horse. Nothing private travels into the index — no phone, no email, no exact
 * coordinates.
 */

export const professionalSearchSchema = z.object({
  q: z.string().trim().max(200).optional(),
  roles: z.array(roleType).optional(),
  disciplines: z.array(z.string().max(60)).optional(),
  specialties: z.array(z.string().max(60)).optional(),
  languages: z.array(z.string().max(10)).optional(),
  ...locationParams,
  /** Includes professionals whose travel radius reaches the search point. */
  includeTravelling: booleanParam.default(true),
  verifiedOnly: booleanParam.optional(),
  minRating: z.coerce.number().min(1).max(5).optional(),
  minYearsExperience: z.coerce.number().int().min(0).max(60).optional(),
  sort: z.enum(['recommended', 'rating', 'distance', 'newest']).default('recommended'),
  ...pagingParams,
});
export type ProfessionalSearchQuery = z.infer<typeof professionalSearchSchema>;

export interface ProfessionalSearchHit {
  id: string;
  handle: string;
  displayName: string;
  avatar: string | null;
  roles: string[];
  headline: string | null;
  specialties: string[];
  disciplines: string[];
  languages: string[];
  yearsExperience: number | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  distanceKm: number | null;
  travels: boolean;
  serviceRadiusKm: number | null;
  verificationLevel: string;
  trustScore: number;
  ratingAverage: number | null;
  ratingCount: number;
  responseRate: number | null;
  serviceCount: number;
}

export type ProfessionalSearchResult = SearchResult<ProfessionalSearchHit>;
