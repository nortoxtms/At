import type {
  JobSearchHit,
  PlanFeature,
  PlanOption,
  ListingSearchHit,
  ProfessionalSearchHit,
  ServiceSearchHit,
} from '@only-horses/shared-types';

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
  try {
    const response = await fetch(`${API_URL}/v1${path}`, {
      // §19.2: ISR with revalidate 300 for listing pages, with on-demand
      // revalidation on publish/edit/close layered on top.
      next: { revalidate },
      headers: { accept: 'application/json' },
    });

    if (!response.ok) return null;

    const body = (await response.json()) as { data: T };
    return body.data;
  } catch {
    // An unreachable API is a null, not a crash. It happens in exactly two
    // situations that both want a rendered empty state rather than a 500: the
    // static preview build (docs/PREVIEW.md), and an API deploy that briefly
    // drops connections while the page cache is warm.
    return null;
  }
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

  try {
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
  } catch {
    return { hits: [], total: 0 };
  }
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

// ── M4: services, jobs and the professional directory (§19.1) ───────────

export interface JobDetail {
  id: string;
  slug: string;
  title: string;
  description: string;
  responsibilities: string | null;
  requirements: string | null;
  job_type: string;
  roles_needed: string[];
  disciplines: string[];
  country_code: string;
  region: string | null;
  city: string | null;
  salary_min: string | null;
  salary_max: string | null;
  salary_currency: string | null;
  salary_period: string | null;
  salary_public: boolean;
  accommodation: string | null;
  meals_included: boolean;
  visa_support: boolean;
  horse_count: number | null;
  experience_years_min: number | null;
  languages_required: string[];
  start_date: string | null;
  application_deadline: string | null;
  status: string;
  application_count: number;
  published_at: string | null;
  expires_at: string | null;
  poster_name: string | null;
  poster_handle: string | null;
  organization_name: string | null;
  organization_slug: string | null;
  /** §26's employment-terms notice, shipped by the API. */
  notice: { tr: string; en: string };
}

export interface ServiceDetail {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  category_name_tr: string;
  price_min: string | null;
  price_max: string | null;
  price_unit: string | null;
  currency: string;
  country_code: string;
  region: string | null;
  city: string | null;
  service_radius_km: number | null;
  is_mobile: boolean;
  availability_note: string | null;
  provider_id: string;
  provider_handle: string;
  provider_name: string;
  verification_level: string;
  trust_score: number;
  organization_name: string | null;
  rating_average: string | null;
  rating_count: string;
  /** §26: present on transport services, null everywhere else. */
  notice: { tr: string; en: string } | null;
}

export function getJob(slug: string): Promise<JobDetail | null> {
  return get<JobDetail>(`/jobs/${encodeURIComponent(slug)}`, 300);
}

export function getService(slug: string): Promise<ServiceDetail | null> {
  return get<ServiceDetail>(`/services/${encodeURIComponent(slug)}`, 300);
}

async function search<THit>(
  path: string,
  params: Record<string, string | number | undefined>,
): Promise<{ hits: THit[]; total: number }> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }

  try {
    const response = await fetch(`${API_URL}/v1${path}?${query}`, {
      next: { revalidate: 300 },
      headers: { accept: 'application/json' },
    });

    if (!response.ok) return { hits: [], total: 0 };

    const body = (await response.json()) as { data: THit[]; meta: { total: number } };
    return { hits: body.data, total: body.meta.total };
  } catch {
    // Same reasoning as `get`: the empty state is already written and says
    // something useful, which beats a build failure or a 500.
    return { hits: [], total: 0 };
  }
}

export function searchJobs(
  params: Record<string, string | number | undefined>,
): Promise<{ hits: JobSearchHit[]; total: number }> {
  return search<JobSearchHit>('/jobs/search', params);
}

export function searchServices(
  params: Record<string, string | number | undefined>,
): Promise<{ hits: ServiceSearchHit[]; total: number }> {
  return search<ServiceSearchHit>('/services/search', params);
}

export function searchProfessionals(
  params: Record<string, string | number | undefined>,
): Promise<{ hits: ProfessionalSearchHit[]; total: number }> {
  return search<ProfessionalSearchHit>('/professionals/search', params);
}

export const JOB_TYPE_LABEL_TR: Record<string, string> = {
  full_time: 'Tam zamanlı',
  part_time: 'Yarı zamanlı',
  seasonal: 'Sezonluk',
  contract: 'Sözleşmeli',
  internship: 'Staj',
  working_student: 'Çalışan öğrenci',
};

export const ACCOMMODATION_LABEL_TR: Record<string, string> = {
  none: 'Konaklama yok',
  shared: 'Paylaşımlı konaklama',
  private: 'Özel konaklama',
  negotiable: 'Konaklama görüşülür',
};

export const SALARY_PERIOD_LABEL_TR: Record<string, string> = {
  hour: 'saat',
  day: 'gün',
  week: 'hafta',
  month: 'ay',
  year: 'yıl',
};

/** §18.2 S17: a job with no published salary reads "Maaş görüşülür". */
export function formatSalary(job: {
  salary_min?: string | null;
  salary_max?: string | null;
  salary_currency?: string | null;
  salary_period?: string | null;
}): string {
  if (!job.salary_min && !job.salary_max) return 'Maaş görüşülür';

  const currency = job.salary_currency ?? 'EUR';
  const format = (value: string) =>
    new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(Number(value));

  const range =
    job.salary_min && job.salary_max && job.salary_min !== job.salary_max
      ? `${format(job.salary_min)} – ${format(job.salary_max)}`
      : format((job.salary_min ?? job.salary_max)!);

  const period = job.salary_period ? `/${SALARY_PERIOD_LABEL_TR[job.salary_period]}` : '';
  return `${range}${period}`;
}

// ── M5: the §16.1 plan catalogue ───────────────────────────────────────

export interface PlanCatalogue {
  plans: PlanOption[];
  features: PlanFeature[];
  products: Record<string, { key: string; amountEur: number; interval?: string; durationDays?: number }>;
}

/**
 * §16.1: "Prices are configurable; do not hardcode in UI." So the pricing page
 * asks the API rather than restating the numbers — one place to change, and no
 * page that can disagree with what Stripe charges.
 */
export function getPlans(): Promise<PlanCatalogue | null> {
  return get<PlanCatalogue>('/billing/plans', 3600);
}
