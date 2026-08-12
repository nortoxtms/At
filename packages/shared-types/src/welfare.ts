import type { HorseSex } from './enums.js';

/**
 * Welfare policy enforced in code — spec §14.4, §24.28.
 *
 * P8: "Welfare is a product feature. Prohibited-content rules are enforced in
 * code, not only in the ToS."
 *
 * §24.28 requires the block to carry "a clear, specific message". A generic
 * "this listing violates our policies" teaches sellers nothing and reads as
 * arbitrary, so every rule below names what tripped it and what to do instead.
 */

export type WelfareRuleKey =
  | 'slaughter_or_meat'
  | 'foal_under_six_months'
  | 'untreated_lameness_or_illness'
  | 'free_to_good_home_unverified'
  | 'pregnant_mare_near_foaling';

export interface WelfareViolation {
  rule: WelfareRuleKey;
  messageTr: string;
  /** True when a human decides; false when the block is categorical. */
  requiresReview: boolean;
}

export interface WelfareCheckInput {
  title: string;
  description: string;
  priceAmount: number | null;
  priceType: string;
  sellerIdentityVerified: boolean;
  horse: {
    sex: HorseSex;
    dateOfBirth: string | null;
    /** Set when the seller has declared a due date for a pregnant mare. */
    expectedFoalingDate?: string | null;
  };
  /** Recent health records the check can read, newest first. */
  recentHealthRecords?: { type: string; title: string; performedOn: string }[];
}

const SLAUGHTER_PATTERNS = [
  /\bkasapl[ıi]k\b/i,
  /\bet\s*(?:i[çc]in|amac[ıi]yla|olarak)\b/i,
  /\bmezbaha\b/i,
  /\bkesim(?:lik|e)?\b/i,
  /\bslaughter\b/i,
  /\bmeat\s*(?:horse|purpose|price)\b/i,
  /\bfor\s+meat\b/i,
];

const LAMENESS_PATTERNS = [
  /\btopal(?:l[ıi]k|d[ıi]r|\b)/i,
  /\bsakat(?:l[ıi]k|\b)/i,
  /\blame\b/i,
  /\bunsound\b/i,
];

const TREATMENT_PATTERNS = [
  /\btedavi\s*(?:edil|g[öo]r|alt[ıi]nda)/i,
  /\bveteriner\s*(?:raporu|kontrol|takib)/i,
  /\bvet\s*(?:report|care|treatment)\b/i,
  /\btreated\b/i,
  /\biyile[şs]/i,
];

const FREE_TO_HOME_PATTERNS = [
  /\b[üu]cretsiz\s*(?:sahiplen|devir|verilir)/i,
  /\bbedava\s*(?:verilir|sahiplen)/i,
  /\bfree\s+to\s+(?:a\s+)?good\s+home\b/i,
];

const PREGNANCY_PATTERNS = [/\bgebe\b/i, /\bdo[ğg]uma?\s*yak[ıi]n\b/i, /\bin\s*foal\b/i, /\bpregnant\b/i];

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

export function checkWelfarePolicy(
  input: WelfareCheckInput,
  now = new Date(),
): WelfareViolation[] {
  const violations: WelfareViolation[] = [];
  const text = `${input.title}\n${input.description}`;

  // 1. Slaughter / meat-purpose listings. Categorical: there is no review
  //    outcome under which this becomes acceptable on a welfare platform.
  if (SLAUGHTER_PATTERNS.some((pattern) => pattern.test(text))) {
    violations.push({
      rule: 'slaughter_or_meat',
      messageTr:
        'Kesimlik veya et amaçlı satış ilanları yayınlanamaz. İlan metnindeki bu ifadeyi kaldır.',
      requiresReview: false,
    });
  }

  // 2. Foals under six months sold away from the dam.
  if (input.horse.dateOfBirth) {
    const ageMonths = monthsBetween(new Date(input.horse.dateOfBirth), now);
    if (ageMonths < 6) {
      violations.push({
        rule: 'foal_under_six_months',
        messageTr:
          '6 aydan küçük taylar annesinden ayrı satılamaz. Tayı annesiyle birlikte ilan et veya sütten kesildikten sonra tekrar dene.',
        requiresReview: true,
      });
    }
  }

  // 3. Currently lame or sick, with no vet note. The listing is not blocked
  //    for disclosing a problem — honesty is what we want — but it needs a
  //    veterinary record to back the claim that it is being handled.
  const mentionsLameness = LAMENESS_PATTERNS.some((pattern) => pattern.test(text));
  const mentionsTreatment = TREATMENT_PATTERNS.some((pattern) => pattern.test(text));
  const hasVetRecord = (input.recentHealthRecords ?? []).some((record) =>
    ['vet_exam', 'lameness', 'xray', 'medication', 'surgery'].includes(record.type),
  );

  if (mentionsLameness && !mentionsTreatment && !hasVetRecord) {
    violations.push({
      rule: 'untreated_lameness_or_illness',
      messageTr:
        'Topallık veya hastalık belirttin ama veteriner kaydı yok. Atın sağlık dosyasına veteriner muayenesi ekle, sonra ilanı yayınla.',
      requiresReview: true,
    });
  }

  // 4. "Free to good home" without identity verification. Free horses are how
  //    animals end up moved on without a trace; the identity gate is the whole
  //    control.
  const isFree =
    input.priceType === 'free' ||
    input.priceAmount === 0 ||
    FREE_TO_HOME_PATTERNS.some((pattern) => pattern.test(text));

  if (isFree && !input.sellerIdentityVerified) {
    violations.push({
      rule: 'free_to_good_home_unverified',
      messageTr:
        'Ücretsiz sahiplendirme ilanları için kimlik doğrulaması zorunlu. Doğrulamayı tamamladıktan sonra ilanı yayınlayabilirsin.',
      requiresReview: false,
    });
  }

  // 5. Pregnant mares within 30 days of foaling — transport at that stage
  //    risks both mare and foal.
  if (input.horse.sex === 'mare' && input.horse.expectedFoalingDate) {
    const daysToFoaling = Math.round(
      (new Date(input.horse.expectedFoalingDate).getTime() - now.getTime()) / 86_400_000,
    );

    if (daysToFoaling >= 0 && daysToFoaling <= 30) {
      violations.push({
        rule: 'pregnant_mare_near_foaling',
        messageTr:
          'Doğumuna 30 günden az kalan gebe kısraklar satışa çıkarılamaz. Doğumdan sonra tekrar dene.',
        requiresReview: false,
      });
    }
  } else if (
    input.horse.sex === 'mare' &&
    PREGNANCY_PATTERNS.some((pattern) => pattern.test(text))
  ) {
    // Declared pregnant with no due date: a human checks how far along.
    violations.push({
      rule: 'pregnant_mare_near_foaling',
      messageTr:
        'Gebe kısrak ilanları için beklenen doğum tarihini girmen gerekiyor. Doğumuna 30 günden az kalan kısraklar satışa çıkarılamaz.',
      requiresReview: true,
    });
  }

  return violations;
}
