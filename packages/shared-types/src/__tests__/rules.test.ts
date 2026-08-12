import { describe, expect, it } from 'vitest';
import {
  AUTO_APPROVE_THRESHOLD,
  canTransition,
  checkPublishPreconditions,
  cmToHands,
  computeQualityScore,
  listingSearchSchema,
  detectOffsitePaymentLanguage,
  findContactInfo,
  meetsVerification,
  nextStatus,
  resolveLimits,
  stripContactInfo,
  trustBand,
  UNLIMITED,
  type QualityScoreInput,
} from '../index.js';

// §24.21 requires 100% coverage on the listing lifecycle, quality score,
// trust score and limit enforcement.

describe('§14.1 verification ladder', () => {
  it('treats the ladder as cumulative', () => {
    expect(meetsVerification('identity_verified', 'phone_verified')).toBe(true);
    expect(meetsVerification('business_verified', 'identity_verified')).toBe(true);
  });

  it('blocks a rung that has not been reached', () => {
    expect(meetsVerification('phone_verified', 'identity_verified')).toBe(false);
    expect(meetsVerification('none', 'email_verified')).toBe(false);
  });
});

describe('§13.2 quality score', () => {
  const perfect: QualityScoreInput = {
    photoCount: 8,
    videoCount: 2,
    videoCategories: ['trot', 'canter'],
    descriptionLength: 300,
    hasXray: true,
    horse: {
      heightCm: 165,
      breedId: 'arabian',
      dateOfBirth: '2018-04-01',
      birthYearEstimated: false,
      color: 'doru',
      disciplines: ['dressage'],
      visibilityHealth: 'on_request',
    },
    sellerVerification: 'identity_verified',
    priceType: 'fixed',
  };

  it('sums the §13.2 table to exactly 100', () => {
    expect(computeQualityScore(perfect).score).toBe(100);
  });

  it('scores an empty listing at zero', () => {
    const result = computeQualityScore({
      photoCount: 0,
      videoCount: 0,
      videoCategories: [],
      descriptionLength: 0,
      hasXray: false,
      horse: {
        heightCm: null,
        breedId: null,
        dateOfBirth: null,
        birthYearEstimated: false,
        color: null,
        disciplines: [],
        visibilityHealth: 'private',
      },
      sellerVerification: 'none',
      priceType: 'on_request',
    });
    expect(result.score).toBe(0);
    expect(result.suggestions).toHaveLength(11);
  });

  it('awards the gait bonus only when trot and canter are both present', () => {
    const trotOnly = computeQualityScore({ ...perfect, videoCategories: ['trot'] });
    expect(trotOnly.score).toBe(95);
  });

  it('counts photos cumulatively at the 3 and 8 thresholds', () => {
    const three = computeQualityScore({ ...perfect, photoCount: 3 });
    const eight = computeQualityScore({ ...perfect, photoCount: 8 });
    expect(eight.score - three.score).toBe(10);
  });

  it('ranks suggestions richest first for the S13 meter', () => {
    const result = computeQualityScore({ ...perfect, videoCount: 0, videoCategories: [], hasXray: false });
    expect(result.suggestions[0].points).toBe(20);
    expect(result.suggestions[0].suggestion).toBe('Video ekle');
  });

  it('puts a listing with photos, a video and full details past auto-approve', () => {
    const modest = computeQualityScore({
      ...perfect,
      photoCount: 3,
      videoCount: 1,
      videoCategories: [],
      descriptionLength: 150,
      hasXray: false,
    });
    // 15 + 20 + 10 + 5 + 10 + 5 + 5 = 70
    expect(modest.score).toBeGreaterThanOrEqual(AUTO_APPROVE_THRESHOLD);
  });

  it('treats private health records as unearned', () => {
    const priv = computeQualityScore({
      ...perfect,
      horse: { ...perfect.horse, visibilityHealth: 'private' },
    });
    expect(priv.score).toBe(90);
  });
});

describe('§13.1 listing lifecycle', () => {
  it('routes publish through review, never straight to active', () => {
    expect(nextStatus('draft', 'publish')).toBe('pending_review');
    expect(nextStatus('draft', 'approve')).toBeNull();
  });

  it('allows a rejected listing to be resubmitted', () => {
    expect(nextStatus('rejected', 'publish')).toBe('pending_review');
  });

  it('reverts under_offer to active', () => {
    expect(nextStatus('under_offer', 'revert_offer')).toBe('active');
  });

  it('renews an expired listing', () => {
    expect(nextStatus('expired', 'renew')).toBe('active');
  });

  it('refuses to resurrect a sold listing', () => {
    for (const action of ['publish', 'resume', 'renew', 'pause'] as const) {
      expect(canTransition('sold', action)).toBe(false);
    }
  });

  it('refuses to pause a draft', () => {
    expect(canTransition('draft', 'pause')).toBe(false);
  });
});

describe('§13.1 publish preconditions', () => {
  const ready = {
    sellerVerification: 'identity_verified' as const,
    imageCount: 3,
    priceAmount: 12000,
    priceType: 'fixed' as const,
    descriptionLength: 120,
    horse: {
      breedId: 'arabian',
      sex: 'mare',
      dateOfBirth: '2018-04-01',
      birthYearEstimated: false,
      heightCm: 155,
    },
  };

  it('passes a complete listing', () => {
    expect(checkPublishPreconditions(ready)).toEqual([]);
  });

  // §24.2: publishing without identity verification must be impossible.
  it('blocks an unverified seller', () => {
    const failures = checkPublishPreconditions({ ...ready, sellerVerification: 'phone_verified' });
    expect(failures.map((f) => f.key)).toContain('identity_required');
  });

  it('accepts a missing price only when the type is on_request', () => {
    expect(
      checkPublishPreconditions({ ...ready, priceAmount: null, priceType: 'on_request' }),
    ).toEqual([]);
    expect(
      checkPublishPreconditions({ ...ready, priceAmount: null, priceType: 'fixed' }).map((f) => f.key),
    ).toContain('price_required');
  });

  it('reports every failure at once rather than the first', () => {
    const failures = checkPublishPreconditions({
      sellerVerification: 'none',
      imageCount: 0,
      priceAmount: null,
      priceType: 'fixed',
      descriptionLength: 10,
      horse: {
        breedId: null,
        sex: null,
        dateOfBirth: null,
        birthYearEstimated: false,
        heightCm: null,
      },
    });
    expect(failures.length).toBe(8);
  });
});

describe('§3.3 capability matrix', () => {
  it('denies publishing to a registered but unverified user', () => {
    expect(resolveLimits('free', 'email_verified').canPublish).toBe(false);
    expect(resolveLimits('free', 'email_verified').maxHorses).toBe(3);
    expect(resolveLimits('free', 'email_verified').messagesPerDay).toBe(3);
  });

  it('raises the message cap at phone verification', () => {
    expect(resolveLimits('free', 'phone_verified').messagesPerDay).toBe(20);
  });

  it('unlocks publishing at identity verification', () => {
    const limits = resolveLimits('free', 'identity_verified');
    expect(limits.canPublish).toBe(true);
    expect(limits.maxHorses).toBe(10);
    expect(limits.maxActiveSaleListings).toBe(3);
    expect(limits.canSeeSellerContact).toBe(true);
  });

  // The §3.3 hard rule is not purchasable.
  it('still blocks publishing for a paying but unverified user', () => {
    const pro = resolveLimits('pro', 'phone_verified');
    expect(pro.canPublish).toBe(false);
    expect(pro.maxActiveSaleListings).toBe(0);
    expect(pro.messagesPerDay).toBe(UNLIMITED);
  });

  it('gives business tier unlimited horses and 5 free job posts', () => {
    const biz = resolveLimits('business', 'identity_verified');
    expect(biz.maxHorses).toBe(UNLIMITED);
    expect(biz.freeJobPostsPerMonth).toBe(5);
  });
});

describe('§13.3 trust bands', () => {
  it('maps scores to the four display bands', () => {
    expect(trustBand(0).band).toBe('new');
    expect(trustBand(29).band).toBe('new');
    expect(trustBand(30).band).toBe('established');
    expect(trustBand(60).band).toBe('trusted');
    expect(trustBand(100).band).toBe('highly_trusted');
  });

  it('clamps out-of-range scores', () => {
    expect(trustBand(-5).band).toBe('new');
    expect(trustBand(140).band).toBe('highly_trusted');
  });
});

describe('§9.4 unit conversion', () => {
  it('renders the worked example from the spec', () => {
    expect(cmToHands(165)).toBe('16.2 hh');
  });

  it('carries 10 inches into the next hand', () => {
    // 162.5 cm is 15.99 hands — it must not render as "15.10 hh".
    expect(cmToHands(162.5)).toBe('16.0 hh');
  });
});

describe('§14.2 contact info in descriptions', () => {
  it('finds emails, phone numbers and messaging handles', () => {
    const text = 'Ara: +90 532 123 45 67 veya ayse@example.com, whatsapp: 05321234567';
    const hits = findContactInfo(text);
    expect(hits.some((h) => h.includes('@'))).toBe(true);
    expect(hits.some((h) => h.includes('532'))).toBe(true);
  });

  it('strips what it finds', () => {
    expect(stripContactInfo('mail: ayse@example.com')).toBe('mail: [gizlendi]');
  });

  it('leaves ordinary descriptions alone', () => {
    const clean = '8 yaşında, 165 cm, dresaj için uygun sakin bir kısrak.';
    expect(findContactInfo(clean)).toEqual([]);
  });
});

describe('§14.2 off-platform payment language', () => {
  it('flags the patterns named in the spec', () => {
    expect(detectOffsitePaymentLanguage('western union ile gönder')).toBe(true);
    expect(detectOffsitePaymentLanguage('önce kapora yatır')).toBe(true);
    expect(detectOffsitePaymentLanguage('bitcoin kabul ediyorum')).toBe(true);
  });

  it('does not flag ordinary arrangements', () => {
    expect(detectOffsitePaymentLanguage('Cumartesi ata bakmaya gelebilir miyim?')).toBe(false);
  });
});

describe('§18.2 S07 boolean query parameters', () => {
  it('reads "false" as false', () => {
    // z.coerce.boolean() would make this true — Boolean("false") is true —
    // and `?includeOnRequest=false` would silently do nothing.
    const parsed = listingSearchSchema.parse({ includeOnRequest: 'false', hasVideo: 'false' });
    expect(parsed.includeOnRequest).toBe(false);
    expect(parsed.hasVideo).toBe(false);
  });

  it('reads "true" and "1" as true', () => {
    expect(listingSearchSchema.parse({ hasVideo: 'true' }).hasVideo).toBe(true);
    expect(listingSearchSchema.parse({ hasVideo: '1' }).hasVideo).toBe(true);
  });

  it('defaults includeOnRequest to true when absent', () => {
    expect(listingSearchSchema.parse({}).includeOnRequest).toBe(true);
  });

  it('rejects a value that is neither', () => {
    expect(() => listingSearchSchema.parse({ hasVideo: 'maybe' })).toThrow();
  });
});
