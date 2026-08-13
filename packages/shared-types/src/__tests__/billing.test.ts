import { describe, expect, it } from 'vitest';
import {
  boostEstimate,
  BOOST_ESTIMATE_MIN_SAMPLE,
  checkoutSchema,
  planOptions,
  PLAN_FEATURES,
  PRODUCTS,
  resolveLimits,
  selectListingsToPause,
  tierForProduct,
  UNLIMITED,
} from '../index.js';

// §24.21 requires 100% coverage on limit enforcement; §24.11 is the case that
// matters most, because getting it wrong deletes someone's listings.

const DAY = 24 * 60 * 60 * 1000;

function listing(id: string, daysAgo: number) {
  return { id, publishedAt: new Date(Date.now() - daysAgo * DAY).toISOString() };
}

describe('§24.11 downgrade', () => {
  it('pauses the newest 5 of 8 when Pro becomes Free', () => {
    // §3.3: Free with identity verification allows 3 active sale listings.
    const limit = resolveLimits('free', 'identity_verified').maxActiveSaleListings;
    expect(limit).toBe(3);

    const active = [8, 7, 6, 5, 4, 3, 2, 1].map((age, index) => listing(`l${index + 1}`, age));
    const paused = selectListingsToPause(active, limit);

    expect(paused).toHaveLength(5);
    // The oldest three survive: l1 (8 days), l2 (7), l3 (6).
    expect(paused.map((l) => l.id).sort()).toEqual(['l4', 'l5', 'l6', 'l7', 'l8']);
  });

  it('pauses nothing when the seller is inside the new limit', () => {
    expect(selectListingsToPause([listing('a', 3), listing('b', 2)], 3)).toEqual([]);
  });

  it('pauses nothing on an unlimited plan', () => {
    const many = Array.from({ length: 40 }, (_, index) => listing(`l${index}`, index));
    expect(selectListingsToPause(many, UNLIMITED)).toEqual([]);
  });

  it('pauses everything when the allowance is zero', () => {
    // An unverified free account: §3.3 gives it no active listings at all.
    const limit = resolveLimits('free', 'none').maxActiveSaleListings;
    expect(limit).toBe(0);
    expect(selectListingsToPause([listing('a', 1), listing('b', 2)], limit)).toHaveLength(2);
  });

  it('puts a listing with no publish date first in line', () => {
    const paused = selectListingsToPause(
      [listing('old', 30), { id: 'undated', publishedAt: null }, listing('recent', 1)],
      2,
    );

    expect(paused.map((l) => l.id)).toEqual(['undated']);
  });
});

describe('§16.1 plans', () => {
  it('derives the plan table from the product catalogue, not from literals', () => {
    const plans = planOptions();
    const proYearly = plans.find((plan) => plan.product === 'pro_yearly')!;

    expect(proYearly.amountEur).toBe(PRODUCTS.pro_yearly!.amountEur);
    // §16.1: "Pro yearly — 2 months free", so ~17% off twelve monthly payments.
    expect(proYearly.savingPercent).toBe(17);
    expect(proYearly.perMonthEur).toBeCloseTo(15.83, 2);
  });

  it('marks monthly plans with no saving rather than a zero', () => {
    const monthly = planOptions().find((plan) => plan.product === 'business_monthly')!;
    expect(monthly.savingPercent).toBeNull();
  });

  it('maps products to the tier they grant', () => {
    expect(tierForProduct('pro_monthly')).toBe('pro');
    expect(tierForProduct('business_yearly')).toBe('business');
    // A boost grants no tier — it is a one-off against a listing.
    expect(tierForProduct('boost_7d')).toBeNull();
  });

  it('keeps the comparison table aligned with §3.3', () => {
    const listings = PLAN_FEATURES.find((row) => row.labelEn === 'Active sale listings')!;
    expect(listings.free).toBe(String(resolveLimits('free', 'identity_verified').maxActiveSaleListings));
    expect(listings.pro).toBe(String(resolveLimits('pro', 'identity_verified').maxActiveSaleListings));
    expect(resolveLimits('business', 'identity_verified').maxActiveSaleListings).toBe(UNLIMITED);
    expect(listings.business).toBe('∞');
  });
});

describe('§12 checkout', () => {
  it('requires a target for a boost', () => {
    expect(checkoutSchema.safeParse({ product: 'boost_7d' }).success).toBe(false);
    expect(
      checkoutSchema.safeParse({
        product: 'boost_7d',
        targetId: '11111111-1111-1111-1111-111111111111',
      }).success,
    ).toBe(true);
  });

  it('does not require one for a subscription', () => {
    expect(checkoutSchema.safeParse({ product: 'pro_monthly' }).success).toBe(true);
  });
});

describe('§18.2 S28 boost estimate', () => {
  it('refuses to show a median drawn from too few boosts', () => {
    const estimate = boostEstimate(7, 120, BOOST_ESTIMATE_MIN_SAMPLE - 1);
    expect(estimate.medianExtraViews).toBeNull();
    expect(estimate.noticeTr).toContain('yeterli veri yok');
  });

  it('labels a usable median as an estimate, never a guarantee', () => {
    const estimate = boostEstimate(30, 240, 50);
    expect(estimate.medianExtraViews).toBe(240);
    expect(estimate.isEstimate).toBe(true);
    expect(estimate.noticeTr).toContain('garanti değildir');
  });
});
