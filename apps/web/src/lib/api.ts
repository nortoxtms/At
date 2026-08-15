import { SALARY_PERIOD_LABEL_TR } from '@only-horses/shared-types';
import type {
  JobSearchHit,
  ListingDetail,
  ProductDetail,
  ProductSearchHit,
  PlanFeature,
  PlanOption,
  ListingSearchHit,
  ProfessionalSearchHit,
  ServiceSearchHit,
  TimelineEntry,
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

/**
 * Only the GitHub Pages build sets this (docs/PREVIEW.md), and it is the only
 * context where an unreachable API is expected rather than an incident.
 */
const IS_STATIC_PREVIEW = process.env.NEXT_PUBLIC_STATIC_PREVIEW === '1';

/**
 * The static preview's data source.
 *
 * Loaded dynamically so it is code-split: `NEXT_PUBLIC_STATIC_PREVIEW` is
 * inlined at build time, so in an ordinary build the branch below is
 * `if (false)` and the dataset never enters the bundle.
 */
async function demo() {
  return import('@only-horses/demo-content');
}

/**
 * What to do when the API cannot be reached.
 *
 * In the static preview: return the empty value, so a page that has an empty
 * state renders it. Everywhere else: rethrow.
 *
 * The rethrow matters more than it looks. Swallowing the error here meant the
 * sitemap — which enumerates listings from the live index — was generated
 * empty and then cached for an hour, telling crawlers the site had no listings
 * at all. A thrown error instead leaves ISR serving the last good copy, which
 * is the right answer for a brief API blip and a visible one for a real
 * outage.
 */
function onUnreachable<T>(error: unknown, fallback: T): T {
  if (IS_STATIC_PREVIEW) return fallback;
  throw error;
}

/**
 * `ListingDetail` and `TimelineEntry` moved to `@only-horses/shared-types`
 * when the mobile app started rendering the same listing (§18.2 S08). They are
 * re-exported here so existing imports keep working and there is still one
 * obvious place to look for the shape of a listing page.
 */
export type { ListingDetail, TimelineEntry };

/**
 * The §7 enum labels moved to `@only-horses/shared-types` when mobile started
 * rendering the same enums (§18.2). Re-exported so the components that already
 * import them from here keep working.
 */
export {
  ACCOMMODATION_LABEL_TR,
  JOB_TYPE_LABEL_TR,
  LISTING_TYPE_LABEL_TR,
  SALARY_PERIOD_LABEL_TR,
  SEX_LABEL_TR,
} from '@only-horses/shared-types';

async function get<T>(path: string, revalidate: number): Promise<T | null> {
  try {
    const response = await fetch(`${API_URL}/v1${path}`, {
      // §19.2: ISR with revalidate 300 for listing pages, with on-demand
      // revalidation on publish/edit/close layered on top.
      next: { revalidate },
      headers: { accept: 'application/json' },
    });

    // A 404 is an answer: the thing is not there. That is a null in every
    // build, preview or not.
    if (!response.ok) return null;

    const body = (await response.json()) as { data: T };
    return body.data;
  } catch (error) {
    return onUnreachable(error, null);
  }
}

export async function getListing(slug: string): Promise<ListingDetail | null> {
  if (IS_STATIC_PREVIEW) return (await demo()).DEMO_LISTING_DETAIL[slug] ?? null;
  return get<ListingDetail>(`/listings/${encodeURIComponent(slug)}`, 300);
}

export async function getTimeline(listingId: string): Promise<TimelineEntry[] | null> {
  // The demo carries no timelines: they belong to a horse record, and the
  // preview exports listings rather than the registry behind them. The page
  // already handles an absent timeline, so it renders without one.
  if (IS_STATIC_PREVIEW) return null;
  return get<TimelineEntry[]>(`/horses/${listingId}/timeline`, 300);
}

/**
 * The product marketplace (§13, extended).
 *
 * Server-rendered like the horse listings and for the same §19.2 reason: a
 * person searching "wintec eyer" is searching Google, not this site, and a
 * client-rendered grid is a page Googlebot sees as empty.
 */
export async function searchProducts(
  params: Record<string, string | number | undefined>,
): Promise<{ hits: ProductSearchHit[]; total: number }> {
  if (IS_STATIC_PREVIEW) {
    const { DEMO_PRODUCTS } = await demo();
    const needle = String(params.q ?? '').trim().toLocaleLowerCase('tr');
    const category = params.category ? String(params.category) : null;

    const hits = DEMO_PRODUCTS.filter((product) => {
      if (category && product.category !== category && product.parentCategory !== category) {
        return false;
      }
      if (!needle) return true;
      return [product.title, product.brand, product.model, product.categoryName, product.city]
        .filter(Boolean)
        .some((field) => String(field).toLocaleLowerCase('tr').includes(needle));
    });

    return { hits, total: hits.length };
  }

  return search<ProductSearchHit>('/products/search', params);
}

export async function getProduct(slug: string): Promise<ProductDetail | null> {
  if (IS_STATIC_PREVIEW) {
    const { DEMO_PRODUCTS } = await demo();
    const hit = DEMO_PRODUCTS.find((product) => product.slug === slug);
    if (!hit) return null;

    return {
      ...hit,
      description:
        'Bu ürün, önizlemenin örnek verisinden geliyor. Canlı sürümde satıcıya buradan yazılır.',
      shippingNote: null,
      color: null,
      status: 'active',
      viewCount: 0,
      sellerProfileId: '',
      images: [],
    };
  }

  return get<ProductDetail>(`/products/${encodeURIComponent(slug)}`, 300);
}

export async function getProductCategories(): Promise<ProductCategoryRow[]> {
  if (IS_STATIC_PREVIEW) {
    const { DEMO_PRODUCT_CATEGORIES } = await demo();
    return DEMO_PRODUCT_CATEGORIES.map((entry) => ({
      code: entry.code,
      parent_code: entry.parentCode,
      name_tr: entry.name,
      icon: null,
      active_count: entry.activeCount,
    }));
  }

  return (await get<ProductCategoryRow[]>('/products/categories', 3600)) ?? [];
}

export interface ProductCategoryRow {
  code: string;
  parent_code: string | null;
  name_tr: string;
  icon: string | null;
  active_count: string | number;
}

export async function searchListings(
  params: Record<string, string | number | undefined>,
): Promise<{ hits: ListingSearchHit[]; total: number }> {
  if (IS_STATIC_PREVIEW) {
    const { DEMO_LISTINGS } = await demo();
    return { hits: DEMO_LISTINGS, total: DEMO_LISTINGS.length };
  }

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
  } catch (error) {
    return onUnreachable(error, { hits: [], total: 0 });
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
  if (IS_STATIC_PREVIEW) {
    const dataset = await demo();
    const hits = (path.startsWith('/services')
      ? dataset.DEMO_SERVICES
      : path.startsWith('/jobs')
        ? dataset.DEMO_JOBS
        : []) as unknown as THit[];

    return { hits, total: hits.length };
  }

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
  } catch (error) {
    return onUnreachable(error, { hits: [], total: 0 });
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

/**
 * §7's reference tables — breeds and disciplines.
 *
 * Cached for an hour because these change with a migration, not with a
 * session, and served from the bundled copies whenever the API does not
 * answer: a horse wizard whose breed picker is empty is a wizard nobody can
 * finish, and "unreachable" is a worse answer there than "slightly stale".
 *
 * The same fallback the mobile app uses, from the same package, so the two
 * platforms cannot end up offering different breed lists.
 */
export interface ReferenceRow {
  code: string;
  name: string;
}

export async function getBreeds(): Promise<ReferenceRow[]> {
  const live = IS_STATIC_PREVIEW ? null : await get<ReferenceRow[]>('/reference/breeds', 3600);
  if (live && live.length > 0) return live;

  return (await demo()).DEMO_BREEDS.map((entry) => ({ code: entry.code, name: entry.name }));
}

export async function getDisciplines(): Promise<ReferenceRow[]> {
  const live = IS_STATIC_PREVIEW
    ? null
    : await get<ReferenceRow[]>('/reference/disciplines', 3600);
  if (live && live.length > 0) return live;

  return (await demo()).DEMO_DISCIPLINES.map((entry) => ({ code: entry.code, name: entry.name }));
}

/**
 * §18.2 S23 — a public profile by handle.
 *
 * Public and cacheable: this is one of the few signed-out pages a buyer
 * reaches by searching a name, so it goes through the ISR `get` rather than
 * the signed-in `apiAs`.
 */
export interface PublicProfile {
  id: string;
  handle: string;
  displayName: string;
  bio: string | null;
  city: string | null;
  region: string | null;
  verificationLevel: string;
  trustScore: number;
  responseRate: number | null;
  responseTimeMins: number | null;
  reviewCount: number | string;
  reviewAverage: number | string | null;
  roles: { role: string }[];
  trustChips: string[];
  createdAt: string;
}

export async function getProfile(handle: string): Promise<PublicProfile | null> {
  if (IS_STATIC_PREVIEW) return (await demo()).DEMO_PROFILES[handle] ?? null;
  return get<PublicProfile>(`/profiles/${encodeURIComponent(handle)}`, 300);
}
