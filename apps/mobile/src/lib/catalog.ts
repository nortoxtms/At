import {
  DEMO_JOBS,
  DEMO_LISTINGS,
  DEMO_LISTING_DETAIL,
  DEMO_SERVICES,
} from '@only-horses/demo-content';
import type {
  JobSearchHit,
  ListingDetail,
  ListingSearchHit,
  ServiceSearchHit,
} from '@only-horses/shared-types';

import { api } from '@/lib/api';

/**
 * Reads for the browse screens, with a demo fallback.
 *
 * §18.2's screens are useless without content, and the app has to be openable
 * — by a reviewer, by a designer, in the web export — with no API within
 * reach. So every read here asks the API first and falls back to the shared
 * demo dataset when the network answers with nothing.
 *
 * §12's envelope puts the rows in `data` and the paging and facets in `meta`
 * — there is no `data.hits`. Reading a field that is never there means every
 * call looks like a failure and silently serves the demo dataset, which is
 * exactly what happened: twelve sample listings on screen with fifty thousand
 * in the database and no error anywhere.
 *
 * The fallback is deliberately not silent: `source` comes back with the data,
 * and the screens put a line on the page saying the content is a sample. A
 * fallback the user cannot see is a fallback that will eventually be mistaken
 * for production data.
 */
export type Source = 'live' | 'demo';

export interface Result<T> {
  data: T;
  source: Source;
}

export interface ListingFilters {
  q?: string;
  type?: string;
  region?: string;
  maxPriceEur?: number;
  discipline?: string;
  sex?: string;
}

/** The same in-memory filtering the web preview does (§11 lives in the API). */
function filterDemo(hits: ListingSearchHit[], filters: ListingFilters): ListingSearchHit[] {
  const needle = filters.q?.trim().toLocaleLowerCase('tr') ?? '';

  return hits.filter((hit) => {
    if (filters.type && hit.listingType !== filters.type) return false;
    if (filters.region && hit.region !== filters.region) return false;
    if (filters.sex && hit.sex !== filters.sex) return false;
    if (filters.discipline && !hit.disciplines.includes(filters.discipline)) return false;
    if (filters.maxPriceEur && (hit.priceEur ?? Infinity) > filters.maxPriceEur) return false;
    if (!needle) return true;

    return [hit.title, hit.horseName, hit.breed, hit.city, hit.region]
      .filter(Boolean)
      .some((field) => String(field).toLocaleLowerCase('tr').includes(needle));
  });
}

function query(filters: ListingFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.type) params.set('type', filters.type);
  if (filters.region) params.set('region', filters.region);
  if (filters.sex) params.set('sex', filters.sex);
  if (filters.discipline) params.set('discipline', filters.discipline);
  if (filters.maxPriceEur) params.set('maxPriceEur', String(filters.maxPriceEur));
  const string = params.toString();
  return string ? `?${string}` : '';
}

export async function searchListings(
  filters: ListingFilters = {},
): Promise<Result<ListingSearchHit[]>> {
  const result = await api<ListingSearchHit[]>(`/listings/search${query(filters)}`, {
    auth: false,
  });

  if (result.ok && Array.isArray(result.data)) return { data: result.data, source: 'live' };
  return { data: filterDemo(DEMO_LISTINGS, filters), source: 'demo' };
}

export async function getListing(slug: string): Promise<Result<ListingDetail | null>> {
  const result = await api<ListingDetail>(`/listings/${encodeURIComponent(slug)}`, { auth: false });
  if (result.ok && result.data) return { data: result.data, source: 'live' };
  return { data: DEMO_LISTING_DETAIL[slug] ?? null, source: 'demo' };
}

export async function searchServices(): Promise<Result<ServiceSearchHit[]>> {
  const result = await api<ServiceSearchHit[]>('/services/search', { auth: false });
  if (result.ok && Array.isArray(result.data)) return { data: result.data, source: 'live' };
  return { data: DEMO_SERVICES, source: 'demo' };
}

export async function searchJobs(): Promise<Result<JobSearchHit[]>> {
  const result = await api<JobSearchHit[]>('/jobs/search', { auth: false });
  if (result.ok && Array.isArray(result.data)) return { data: result.data, source: 'live' };
  return { data: DEMO_JOBS, source: 'demo' };
}

/** The regions present in the dataset, for the filter sheet (S07). */
export const REGIONS = Array.from(
  new Set(DEMO_LISTINGS.map((hit) => hit.region).filter((region): region is string => !!region)),
).sort((a, b) => a.localeCompare(b, 'tr'));

export const LISTING_TYPES = Array.from(new Set(DEMO_LISTINGS.map((hit) => hit.listingType)));

export const DISCIPLINES = Array.from(
  new Set(DEMO_LISTINGS.flatMap((hit) => hit.disciplines)),
).sort((a, b) => a.localeCompare(b, 'tr'));
