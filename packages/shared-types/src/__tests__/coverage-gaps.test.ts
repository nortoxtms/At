import { describe, expect, it } from 'vitest';
import {
  ALERT_INTERVAL_MINUTES,
  resolveLimits,
  trustBand,
  UNLIMITED,
  isAlertDue,
  isStaffOnly,
  OCCUPYING_STATUSES,
  suggestNextDue,
  trustChipsTr,
  type TrustComponents,
} from '../index.js';

/**
 * §24.21 asks for 100 % coverage on the listing lifecycle, the quality score,
 * the trust score and limit enforcement. A coverage run found four rules with
 * no test behind them — every one of them user-visible — so they get one here
 * rather than a note in the report.
 */

describe('§13.3 trust chips', () => {
  const base: TrustComponents = {
    emailVerified: false,
    phoneVerified: false,
    identityVerified: false,
    professionalVerified: false,
    reviewCount: 0,
    responseRate: null,
    accountAgeMonths: 0,
    upheldReports: 0,
  };

  it('shows the highest verification reached, not all of them', () => {
    const chips = trustChipsTr({
      ...base,
      emailVerified: true,
      phoneVerified: true,
      identityVerified: true,
    });

    // "Kimlik doğrulandı · Telefon doğrulandı · E-posta doğrulandı" would be
    // three chips saying one thing.
    expect(chips).toEqual(['Kimlik doğrulandı']);
  });

  it('falls back down the ladder', () => {
    expect(trustChipsTr({ ...base, phoneVerified: true, emailVerified: true })).toEqual([
      'Telefon doğrulandı',
    ]);
    expect(trustChipsTr({ ...base, emailVerified: true })).toEqual(['E-posta doğrulandı']);
  });

  it('adds the professional badge alongside the identity chip', () => {
    expect(
      trustChipsTr({ ...base, identityVerified: true, professionalVerified: true }),
    ).toEqual(['Kimlik doğrulandı', 'Profesyonel doğrulandı']);
  });

  it('omits a response rate that §13.5 withholds', () => {
    // null means "fewer than 5 inquiries" — no chip beats a misleading one.
    expect(trustChipsTr({ ...base, responseRate: null }).join()).not.toContain('yanıt');
    expect(trustChipsTr({ ...base, responseRate: 0.92 })).toContain('%92 yanıt oranı');
  });

  it('counts membership in whole years only', () => {
    expect(trustChipsTr({ ...base, accountAgeMonths: 11 }).join()).not.toContain('üye');
    expect(trustChipsTr({ ...base, accountAgeMonths: 30 })).toContain('2 yıldır üye');
  });

  it('names the review count when there is one', () => {
    expect(trustChipsTr({ ...base, reviewCount: 14 })).toContain('14 değerlendirme');
  });
});

describe('§3.3 limits at the edges', () => {
  it('gives an unverified Business subscriber no listings at all', () => {
    // §3.3's hard rule outranks the plan: paying does not replace identity.
    const limits = resolveLimits('business', 'none');
    expect(limits.maxActiveSaleListings).toBe(0);
    expect(limits.maxActiveServiceListings).toBe(0);
    // What they do get is the tier's non-gated capabilities.
    expect(limits.maxHorses).toBe(UNLIMITED);
    expect(limits.freeJobPostsPerMonth).toBe(5);
  });

  it('gives a verified Business subscriber unlimited listings', () => {
    const limits = resolveLimits('business', 'identity_verified');
    expect(limits.maxActiveSaleListings).toBe(UNLIMITED);
  });
});

describe('§13.3 trust bands', () => {
  it('clamps a score outside 0–100 instead of falling off the table', () => {
    expect(trustBand(-20).label).toBe(trustBand(0).label);
    expect(trustBand(500).label).toBe(trustBand(100).label);
  });
});

describe('§13.1 lifecycle guards', () => {
  it('marks the transitions only staff may make', () => {
    // A seller cannot approve their own listing out of review.
    expect(isStaffOnly('pending_review', 'approve')).toBe(true);
    expect(isStaffOnly('pending_review', 'reject')).toBe(true);
    expect(isStaffOnly('active', 'pause')).toBe(false);
  });

  it('returns false for a transition that does not exist', () => {
    expect(isStaffOnly('sold', 'publish')).toBe(false);
  });

  it('lists the statuses that occupy a horse’s active slot', () => {
    // §7's partial unique index allows one of these per horse at a time.
    expect(OCCUPYING_STATUSES).toEqual(['active', 'pending_review', 'under_offer']);
    expect(OCCUPYING_STATUSES).not.toContain('paused');
  });
});

describe('§24.5 alert scheduling', () => {
  const now = new Date('2026-08-13T12:00:00Z');

  it('treats a never-run search as due', () => {
    expect(isAlertDue('instant', null, now)).toBe(true);
    expect(isAlertDue('weekly', null, now)).toBe(true);
  });

  it('holds an instant search for five minutes — §24.5’s budget', () => {
    expect(ALERT_INTERVAL_MINUTES.instant).toBe(5);
    expect(isAlertDue('instant', '2026-08-13T11:57:00Z', now)).toBe(false);
    expect(isAlertDue('instant', '2026-08-13T11:54:00Z', now)).toBe(true);
  });

  it('holds daily and weekly to their own intervals', () => {
    expect(isAlertDue('daily', '2026-08-13T00:00:00Z', now)).toBe(false);
    expect(isAlertDue('daily', '2026-08-11T00:00:00Z', now)).toBe(true);
    expect(isAlertDue('weekly', '2026-08-10T00:00:00Z', now)).toBe(false);
    expect(isAlertDue('weekly', '2026-08-01T00:00:00Z', now)).toBe(true);
  });

  it('never runs a search whose alerts are off', () => {
    expect(isAlertDue('off', null, now)).toBe(false);
    expect(ALERT_INTERVAL_MINUTES.off).toBeNull();
  });
});

describe('§17 health reminder scheduling', () => {
  it('suggests the next due date from the interval', () => {
    // A vaccination given today with a 12-month interval is due next year.
    expect(suggestNextDue('vaccination', '2026-08-13', 12)).toBe('2027-08-13');
  });

  it('uses the type’s default interval when none is given', () => {
    // Farrier work recurs on a much shorter cycle than a vaccination.
    const farrier = suggestNextDue('farrier', '2026-08-13');
    const vaccination = suggestNextDue('vaccination', '2026-08-13');

    expect(farrier).not.toBeNull();
    expect(vaccination).not.toBeNull();
    expect(new Date(farrier!).getTime()).toBeLessThan(new Date(vaccination!).getTime());
  });

  it('returns null for a record type that does not recur', () => {
    // A surgery is not something to be reminded about every N weeks.
    expect(suggestNextDue('surgery', '2026-08-13')).toBeNull();
  });
});
