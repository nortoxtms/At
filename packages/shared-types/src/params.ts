import { z } from 'zod';

/**
 * Boolean query parameter.
 *
 * NOT z.coerce.boolean(): that applies JavaScript truthiness, so the string
 * "false" coerces to `true` and `?includeOnRequest=false` silently does
 * nothing. Every filter in §18.2 S07, S15 and S17 that can be switched off
 * depends on this parsing the way a reader would expect.
 *
 * Shared by the listing, service, job and professional search schemas so the
 * bug can only be fixed — or reintroduced — in one place.
 */
export const booleanParam = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0', 'yes', 'no'])])
  .transform((value) =>
    typeof value === 'boolean' ? value : ['true', '1', 'yes'].includes(value),
  );

/** Shared paging shape for every search endpoint. */
export const pagingParams = {
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
};

/** Every search endpoint answers in this envelope. */
export interface SearchResult<THit> {
  hits: THit[];
  found: number;
  page: number;
  limit: number;
  facets: Record<string, { value: string; count: number }[]>;
  tookMs: number;
}

/** Shared location filters — §18.2 S15/S17 both offer "yakınımda". */
export const locationParams = {
  countryCode: z.string().length(2).optional(),
  region: z.string().max(120).optional(),
  city: z.string().max(120).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(10).max(500).optional(),
};
