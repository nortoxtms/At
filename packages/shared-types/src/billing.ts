import { z } from 'zod';

import type { SubscriptionTier } from './enums.js';
import { PRODUCTS, UNLIMITED } from './limits.js';

/**
 * Billing — spec §16, §18.2 S27/S28, §24.10, §24.11.
 *
 * §16.1 ends with "Prices are configurable in `products.config.ts`; do not
 * hardcode in UI", which is why `PRODUCTS` lives in limits.ts and this file
 * builds the plan table from it rather than restating any number. A price
 * shown on a paywall that disagrees with the price Stripe charges is the kind
 * of bug nobody notices until a customer does.
 */

export const purchasableProduct = z.enum([
  'pro_monthly',
  'pro_yearly',
  'business_monthly',
  'business_yearly',
  'boost_7d',
  'boost_30d',
  'job_post',
  'featured_profile_30d',
]);
export type PurchasableProduct = z.infer<typeof purchasableProduct>;

/** §12 POST /billing/checkout {product, targetId?}. */
export const checkoutSchema = z
  .object({
    product: purchasableProduct,
    /** The listing to boost, the job to publish, the profile to feature. */
    targetId: z.string().uuid().optional(),
  })
  .refine((value) => !TARGETED_PRODUCTS.includes(value.product) || Boolean(value.targetId), {
    message: 'Bu ürün için hedef seçilmeli.',
    path: ['targetId'],
  });
export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** Products that only mean something applied to a specific row. */
export const TARGETED_PRODUCTS: PurchasableProduct[] = ['boost_7d', 'boost_30d'];

export const SUBSCRIPTION_PRODUCTS: PurchasableProduct[] = [
  'pro_monthly',
  'pro_yearly',
  'business_monthly',
  'business_yearly',
];

export function tierForProduct(product: PurchasableProduct): SubscriptionTier | null {
  if (product.startsWith('pro_')) return 'pro';
  if (product.startsWith('business_')) return 'business';
  return null;
}

/**
 * §18.2 S27's three plan columns and their comparison table.
 *
 * The feature lines are the §3.3 matrix in prose. `UNLIMITED` renders as "∞"
 * rather than a number, and the identity note is repeated on every paid plan
 * because the single most common support question about a paywall is "I paid,
 * why can I still not publish" — §3.3's hard rule is not purchasable.
 */
export interface PlanFeature {
  labelTr: string;
  labelEn: string;
  free: string;
  pro: string;
  business: string;
}

export const PLAN_FEATURES: PlanFeature[] = [
  { labelTr: 'At kaydı', labelEn: 'Horses', free: '3', pro: '50', business: '∞' },
  { labelTr: 'Aktif satılık ilan', labelEn: 'Active sale listings', free: '3', pro: '10', business: '∞' },
  { labelTr: 'Aktif hizmet ilanı', labelEn: 'Active service listings', free: '1', pro: '5', business: '∞' },
  { labelTr: 'Günlük mesaj', labelEn: 'Messages per day', free: '20', pro: '∞', business: '∞' },
  { labelTr: 'İlan istatistikleri', labelEn: 'Listing analytics', free: '—', pro: '✓', business: '✓' },
  { labelTr: 'Öne çıkarma satın alma', labelEn: 'Boosts', free: '✓', pro: '✓', business: '✓' },
  { labelTr: 'İşletme sayfası', labelEn: 'Organization page', free: '—', pro: '—', business: '✓' },
  { labelTr: 'Ücretsiz iş ilanı', labelEn: 'Free job posts', free: '—', pro: '—', business: '5 / ay' },
  { labelTr: 'Personel hesapları', labelEn: 'Staff accounts', free: '—', pro: '—', business: '✓' },
];

export interface PlanOption {
  product: PurchasableProduct;
  tier: SubscriptionTier;
  interval: 'month' | 'year';
  amountEur: number;
  /** Monthly equivalent, so the yearly saving is visible without arithmetic. */
  perMonthEur: number;
  savingPercent: number | null;
}

/** §12 GET /billing/plans, derived from §16.1 rather than restated. */
export function planOptions(): PlanOption[] {
  const build = (
    product: PurchasableProduct,
    tier: SubscriptionTier,
    monthlyProduct: PurchasableProduct,
  ): PlanOption => {
    const definition = PRODUCTS[product]!;
    const monthly = PRODUCTS[monthlyProduct]!;
    const isYearly = definition.interval === 'year';
    const perMonth = isYearly ? definition.amountEur / 12 : definition.amountEur;

    return {
      product,
      tier,
      interval: definition.interval ?? 'month',
      amountEur: definition.amountEur,
      perMonthEur: Math.round(perMonth * 100) / 100,
      savingPercent: isYearly
        ? Math.round((1 - definition.amountEur / (monthly.amountEur * 12)) * 100)
        : null,
    };
  };

  return [
    build('pro_monthly', 'pro', 'pro_monthly'),
    build('pro_yearly', 'pro', 'pro_monthly'),
    build('business_monthly', 'business', 'business_monthly'),
    build('business_yearly', 'business', 'business_monthly'),
  ];
}

/**
 * §24.11: "Downgrading from Pro to Free with 8 active listings pauses the
 * newest 5 and notifies the user; it never silently deletes content."
 *
 * The arithmetic is §3.3's: Free allows 3 active sale listings, so 8 − 3 = 5.
 * Which 5 is the part worth being deliberate about — the newest are paused and
 * the oldest kept, because an older listing has accumulated the views, saves
 * and inquiries that make it worth more to its owner, and because the newest
 * are the ones the seller still remembers creating.
 *
 * Nothing is deleted and nothing is closed: `paused` is reversible the moment
 * they resubscribe.
 */
export interface PausableListing {
  id: string;
  publishedAt: string | null;
}

export function selectListingsToPause<T extends PausableListing>(
  active: T[],
  limit: number,
): T[] {
  if (limit === UNLIMITED || active.length <= limit) return [];

  const newestFirst = [...active].sort(
    (a, b) => publishedTime(b.publishedAt) - publishedTime(a.publishedAt),
  );

  return newestFirst.slice(0, active.length - limit);
}

function publishedTime(value: string | null): number {
  // A listing with no publish date is a draft that should not have counted;
  // treating it as newest keeps it first in line to be paused rather than
  // silently pausing a live listing in its place.
  return value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;
}

/**
 * §18.2 S28: "expected extra views (from historical median, labeled as an
 * estimate, never a guarantee)".
 *
 * The label is not decoration. A number presented as a promise is a claim the
 * platform cannot keep, and §26 forbids presenting anything as verified by
 * ONLY HORSES unless it is.
 */
export interface BoostEstimate {
  durationDays: number;
  medianExtraViews: number | null;
  sampleSize: number;
  isEstimate: true;
  noticeTr: string;
}

/** Below this many past boosts, no median is honest enough to show. */
export const BOOST_ESTIMATE_MIN_SAMPLE = 20;

export function boostEstimate(
  durationDays: number,
  medianExtraViews: number | null,
  sampleSize: number,
): BoostEstimate {
  const usable = sampleSize >= BOOST_ESTIMATE_MIN_SAMPLE ? medianExtraViews : null;

  return {
    durationDays,
    medianExtraViews: usable,
    sampleSize,
    isEstimate: true,
    noticeTr:
      usable === null
        ? 'Henüz güvenilir bir tahmin için yeterli veri yok.'
        : 'Geçmiş ilanların ortancasına dayalı bir tahmindir, garanti değildir.',
  };
}

export interface SubscriptionView {
  tier: SubscriptionTier;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** Present once Stripe has a customer for this profile. */
  stripeCustomerId: string | null;
}
