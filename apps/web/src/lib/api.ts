import type { ListingSearchHit } from '@only-horses/shared-types';

/**
 * Server-side API access for the Next.js app (spec §19).
 *
 * Every read here happens on the server, which is the point: §19.2 requires
 * indexable, server-rendered listing pages, and §1.3 P6 makes the web the
 * acquisition channel. A client-side fetch would render an empty shell to
 * Googlebot.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface ListingDetail {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  type: string;
  status: string;
  price_amount: string | null;
  price_currency: string;
  price_type: string;
  country_code: string;
  region: string | null;
  city: string | null;
  trial_allowed: boolean;
  ppe_welcome: boolean;
  published_at: string | null;
  view_count: number;

  horse_name: string;
  horse_slug: string;
  sex: string;
  color: string | null;
  height_cm: string | null;
  date_of_birth: string | null;
  birth_year_estimated: boolean;
  disciplines: string[];
  training_level: string | null;
  rider_level_min: string | null;
  horse_about: string | null;
  breed_id: string | null;
  breed_name_tr: string | null;
  breed_name_en: string | null;
  visibility_health: string;
  visibility_pedigree: string;

  seller_handle: string;
  seller_name: string;
  seller_trust_score: number;
  seller_verification: string;
  seller_response_rate: string | null;
}

export interface TimelineEntry {
  kind: 'registered' | 'health' | 'competition' | 'ownership' | 'listing';
  date: string;
  title: string;
  detail: string | null;
  referenceId: string | null;
}

async function get<T>(path: string, revalidate: number): Promise<T | null> {
  const response = await fetch(`${API_URL}/v1${path}`, {
    // §19.2: ISR with revalidate 300 for listing pages, with on-demand
    // revalidation on publish/edit/close layered on top.
    next: { revalidate },
    headers: { accept: 'application/json' },
  });

  if (!response.ok) return null;

  const body = (await response.json()) as { data: T };
  return body.data;
}

export function getListing(slug: string): Promise<ListingDetail | null> {
  return get<ListingDetail>(`/listings/${encodeURIComponent(slug)}`, 300);
}

export function getTimeline(listingId: string): Promise<TimelineEntry[] | null> {
  return get<TimelineEntry[]>(`/horses/${listingId}/timeline`, 300);
}

export async function searchListings(
  params: Record<string, string | number | undefined>,
): Promise<{ hits: ListingSearchHit[]; total: number }> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }

  const response = await fetch(`${API_URL}/v1/listings/search?${search}`, {
    next: { revalidate: 300 },
    headers: { accept: 'application/json' },
  });

  if (!response.ok) return { hits: [], total: 0 };

  const body = (await response.json()) as {
    data: ListingSearchHit[];
    meta: { total: number };
  };

  return { hits: body.data, total: body.meta.total };
}

/** §9.4: cm is stored; hands are a display choice. */
export function formatHeight(cm: string | null): string | null {
  if (!cm) return null;
  return `${Math.round(Number(cm))} cm`;
}

export function ageYears(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;

  const dob = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDelta = now.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) age -= 1;

  return age;
}

export function formatPrice(
  amount: string | null,
  currency: string,
  priceType: string,
): string {
  if (priceType === 'on_request' || amount === null) return 'Fiyat sorunuz';

  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

export const SEX_LABEL_TR: Record<string, string> = {
  mare: 'Kısrak',
  stallion: 'Aygır',
  gelding: 'İğdiş',
  filly: 'Dişi tay',
  colt: 'Erkek tay',
};

export const LISTING_TYPE_LABEL_TR: Record<string, string> = {
  sale: 'Satılık',
  lease: 'Kiralık',
  half_lease: 'Yarı kiralık',
  share: 'Hisse',
  stud: 'Aygır hizmeti',
  loan: 'Ödünç',
};
