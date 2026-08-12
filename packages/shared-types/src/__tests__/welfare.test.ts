import { describe, expect, it } from 'vitest';

import { checkWelfarePolicy, type WelfareCheckInput } from '../welfare.js';

// §24.28: "Prohibited-content rules (§14.4) block publish with a clear,
// specific message." These tests pin both halves — that the rule fires, and
// that an ordinary listing is left alone.

const NOW = new Date('2026-06-01T12:00:00Z');

const baseline: WelfareCheckInput = {
  title: 'Luna — 8 yaşında Arap kısrak',
  description:
    'Sakin mizaçlı, dresaj ve gezinti için uygun. Düzenli nal ve aşı takibi yapılıyor. ' +
    'Deneme binişine açığız, satın alma öncesi veteriner muayenesini memnuniyetle karşılarız.',
  priceAmount: 12000,
  priceType: 'fixed',
  sellerIdentityVerified: true,
  horse: { sex: 'mare', dateOfBirth: '2018-04-12' },
  recentHealthRecords: [],
};

describe('§14.4 welfare policy', () => {
  it('passes an ordinary, honest listing', () => {
    expect(checkWelfarePolicy(baseline, NOW)).toEqual([]);
  });

  it('blocks slaughter and meat-purpose listings outright', () => {
    for (const description of [
      'Kasaplık olarak verilir, acil.',
      'Kesimlik at, uygun fiyat.',
      'Selling for meat, cheap.',
    ]) {
      const violations = checkWelfarePolicy({ ...baseline, description }, NOW);
      const rule = violations.find((v) => v.rule === 'slaughter_or_meat');

      expect(rule).toBeDefined();
      // Categorical: no review outcome makes this acceptable.
      expect(rule?.requiresReview).toBe(false);
      expect(rule?.messageTr).toMatch(/kaldır/);
    }
  });

  it('blocks a foal under six months', () => {
    const violations = checkWelfarePolicy(
      { ...baseline, horse: { sex: 'filly', dateOfBirth: '2026-03-01' } },
      NOW,
    );
    expect(violations.map((v) => v.rule)).toContain('foal_under_six_months');
  });

  it('allows a six-month-old', () => {
    const violations = checkWelfarePolicy(
      { ...baseline, horse: { sex: 'filly', dateOfBirth: '2025-12-01' } },
      NOW,
    );
    expect(violations.map((v) => v.rule)).not.toContain('foal_under_six_months');
  });

  it('blocks declared lameness with no veterinary record', () => {
    const violations = checkWelfarePolicy(
      { ...baseline, description: 'Şu an hafif topallık var, ucuza veriyorum.' },
      NOW,
    );
    expect(violations.map((v) => v.rule)).toContain('untreated_lameness_or_illness');
  });

  // Disclosure is what we want from sellers; the rule targets neglect, not
  // honesty, so a vet record clears it.
  it('allows declared lameness backed by a veterinary record', () => {
    const violations = checkWelfarePolicy(
      {
        ...baseline,
        description: 'Geçmişte topallık yaşadı, veteriner takibinde ve iyileşti.',
        recentHealthRecords: [
          { type: 'vet_exam', title: 'Topallık kontrolü', performedOn: '2026-05-01' },
        ],
      },
      NOW,
    );
    expect(violations.map((v) => v.rule)).not.toContain('untreated_lameness_or_illness');
  });

  it('blocks free-to-good-home from an unverified seller', () => {
    const violations = checkWelfarePolicy(
      {
        ...baseline,
        priceType: 'free',
        priceAmount: 0,
        sellerIdentityVerified: false,
      },
      NOW,
    );
    expect(violations.map((v) => v.rule)).toContain('free_to_good_home_unverified');
  });

  it('allows free rehoming once identity is verified', () => {
    const violations = checkWelfarePolicy(
      { ...baseline, priceType: 'free', priceAmount: 0, sellerIdentityVerified: true },
      NOW,
    );
    expect(violations.map((v) => v.rule)).not.toContain('free_to_good_home_unverified');
  });

  it('blocks a pregnant mare within 30 days of foaling', () => {
    const violations = checkWelfarePolicy(
      {
        ...baseline,
        horse: { sex: 'mare', dateOfBirth: '2018-04-12', expectedFoalingDate: '2026-06-20' },
      },
      NOW,
    );
    expect(violations.map((v) => v.rule)).toContain('pregnant_mare_near_foaling');
  });

  it('allows a pregnant mare well before foaling', () => {
    const violations = checkWelfarePolicy(
      {
        ...baseline,
        horse: { sex: 'mare', dateOfBirth: '2018-04-12', expectedFoalingDate: '2026-11-01' },
      },
      NOW,
    );
    expect(violations.map((v) => v.rule)).not.toContain('pregnant_mare_near_foaling');
  });

  it('asks for a due date when pregnancy is mentioned without one', () => {
    const violations = checkWelfarePolicy(
      { ...baseline, description: 'Gebe kısrak, sakin mizaçlı.' },
      NOW,
    );
    const rule = violations.find((v) => v.rule === 'pregnant_mare_near_foaling');

    expect(rule?.requiresReview).toBe(true);
    expect(rule?.messageTr).toMatch(/doğum tarihini/);
  });

  it('gives every violation a specific, actionable message', () => {
    const violations = checkWelfarePolicy(
      {
        ...baseline,
        description: 'Kasaplık, topal, bedava verilir.',
        priceType: 'free',
        priceAmount: 0,
        sellerIdentityVerified: false,
      },
      NOW,
    );

    expect(violations.length).toBeGreaterThanOrEqual(3);
    for (const violation of violations) {
      // §24.28 "clear, specific message" — not a policy-number reference.
      expect(violation.messageTr.length).toBeGreaterThan(30);
      expect(violation.messageTr).not.toMatch(/politika ihlali/i);
    }
  });
});
