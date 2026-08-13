import { z } from 'zod';

import { applicationStatus, type ApplicationStatus, jobType, roleType } from './enums.js';
import { booleanParam, locationParams, pagingParams, type SearchResult } from './params.js';

/**
 * Job listings and applications — spec §7, §12, §13.6, §18.2 S17–S20, §26.
 *
 * Two rules from §26 are enforced here rather than left to moderation:
 * employment terms are between the parties (a notice, shipped with every job),
 * and listings that fail a minimum-wage or unpaid-full-time check "in the
 * listing country where determinable" are blocked at publish.
 */

export const salaryPeriod = z.enum(['hour', 'day', 'week', 'month', 'year']);
export type SalaryPeriod = z.infer<typeof salaryPeriod>;

export const accommodationKind = z.enum(['none', 'shared', 'private', 'negotiable']);
export type AccommodationKind = z.infer<typeof accommodationKind>;

export const applyMethod = z.enum(['in_app', 'email', 'external_url']);
export type ApplyMethod = z.infer<typeof applyMethod>;

/** §18.2 S20 — every field on the post-a-job form. */
export const createJobSchema = z
  .object({
    title: z.string().trim().min(4, 'Başlık en az 4 karakter olmalı.').max(140),
    organizationId: z.string().uuid().optional(),
    jobType,
    rolesNeeded: z.array(roleType).min(1, 'En az bir rol seç.').max(6),
    disciplines: z.array(z.string().max(60)).max(10).default([]),

    description: z.string().trim().min(80, 'Açıklama en az 80 karakter olmalı.').max(8000),
    responsibilities: z.string().trim().max(4000).optional(),
    requirements: z.string().trim().max(4000).optional(),

    countryCode: z.string().length(2),
    region: z.string().trim().max(120).optional(),
    city: z.string().trim().max(120).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),

    salaryMin: z.number().nonnegative().max(9_999_999).optional(),
    salaryMax: z.number().nonnegative().max(9_999_999).optional(),
    salaryCurrency: z.string().length(3).optional(),
    salaryPeriod: salaryPeriod.optional(),
    /** §18.2 S20's "gizle" toggle — hidden from the card, still checked at publish. */
    salaryPublic: z.boolean().default(true),

    accommodation: accommodationKind.optional(),
    mealsIncluded: z.boolean().default(false),
    visaSupport: z.boolean().default(false),
    horseCount: z.number().int().min(0).max(2000).optional(),
    experienceYearsMin: z.number().int().min(0).max(50).optional(),
    languagesRequired: z.array(z.string().max(10)).max(8).default([]),

    startDate: z.string().date().optional(),
    applicationDeadline: z.string().date().optional(),

    applyMethod: applyMethod.default('in_app'),
    applyEmail: z.string().email().optional(),
    applyUrl: z.string().url().optional(),
  })
  .refine((v) => v.salaryMin === undefined || v.salaryMax === undefined || v.salaryMax >= v.salaryMin, {
    message: 'Üst maaş alt maaştan küçük olamaz.',
    path: ['salaryMax'],
  })
  // A number without a period is unreadable ("1500" a week or a year?), and
  // without a currency it is unusable for the §26 check.
  .refine((v) => (v.salaryMin === undefined && v.salaryMax === undefined) || (v.salaryPeriod !== undefined && v.salaryCurrency !== undefined), {
    message: 'Maaş girdiysen dönem ve para birimini de seç.',
    path: ['salaryPeriod'],
  })
  .refine((v) => v.applyMethod !== 'email' || Boolean(v.applyEmail), {
    message: 'E-posta ile başvuru için e-posta adresi gerekli.',
    path: ['applyEmail'],
  })
  .refine((v) => v.applyMethod !== 'external_url' || Boolean(v.applyUrl), {
    message: 'Dış bağlantı ile başvuru için adres gerekli.',
    path: ['applyUrl'],
  });
export type CreateJobInput = z.infer<typeof createJobSchema>;

export const updateJobSchema = z.object({
  title: z.string().trim().min(4).max(140).optional(),
  jobType: jobType.optional(),
  rolesNeeded: z.array(roleType).min(1).max(6).optional(),
  disciplines: z.array(z.string().max(60)).max(10).optional(),
  description: z.string().trim().min(80).max(8000).optional(),
  responsibilities: z.string().trim().max(4000).nullish(),
  requirements: z.string().trim().max(4000).nullish(),
  countryCode: z.string().length(2).optional(),
  region: z.string().trim().max(120).nullish(),
  city: z.string().trim().max(120).nullish(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  salaryMin: z.number().nonnegative().max(9_999_999).nullish(),
  salaryMax: z.number().nonnegative().max(9_999_999).nullish(),
  salaryCurrency: z.string().length(3).nullish(),
  salaryPeriod: salaryPeriod.nullish(),
  salaryPublic: z.boolean().optional(),
  accommodation: accommodationKind.nullish(),
  mealsIncluded: z.boolean().optional(),
  visaSupport: z.boolean().optional(),
  horseCount: z.number().int().min(0).max(2000).nullish(),
  experienceYearsMin: z.number().int().min(0).max(50).nullish(),
  languagesRequired: z.array(z.string().max(10)).max(8).optional(),
  startDate: z.string().date().nullish(),
  applicationDeadline: z.string().date().nullish(),
  applyMethod: applyMethod.optional(),
  applyEmail: z.string().email().nullish(),
  applyUrl: z.string().url().nullish(),
});
export type UpdateJobInput = z.infer<typeof updateJobSchema>;

/** §18.2 S17's filter bar: konum, iş türü, konaklama, deneyim, maaş. */
export const jobSearchSchema = z.object({
  q: z.string().trim().max(200).optional(),
  ...locationParams,
  jobTypes: z.array(jobType).optional(),
  roles: z.array(roleType).optional(),
  disciplines: z.array(z.string().max(60)).optional(),
  accommodation: z.array(accommodationKind).optional(),
  mealsIncluded: booleanParam.optional(),
  visaSupport: booleanParam.optional(),
  experienceMaxYears: z.coerce.number().int().min(0).max(50).optional(),
  salaryMinEur: z.coerce.number().nonnegative().optional(),
  /** Jobs quoting no salary are the majority; excluding them is opt-in. */
  includeUndisclosedSalary: booleanParam.default(true),
  sort: z.enum(['recommended', 'newest', 'distance', 'salary_desc']).default('recommended'),
  ...pagingParams,
});
export type JobSearchQuery = z.infer<typeof jobSearchSchema>;

export interface JobSearchHit {
  id: string;
  slug: string;
  title: string;
  jobType: string;
  rolesNeeded: string[];
  organizationName: string | null;
  organizationLogo: string | null;
  posterName: string | null;
  countryCode: string;
  region: string | null;
  city: string | null;
  distanceKm: number | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  /** Null when the poster hid it (§18.2 S20) — the card shows "Maaş görüşülür". */
  salaryMonthlyEur: number | null;
  accommodation: string | null;
  mealsIncluded: boolean;
  visaSupport: boolean;
  experienceYearsMin: number | null;
  applicationCount: number;
  publishedAt: string | null;
}

/** §12 POST /jobs/:id/apply — §18.2 S19. */
export const applyToJobSchema = z.object({
  coverLetter: z.string().trim().min(20, 'Ön yazı en az 20 karakter olmalı.').max(4000),
  cvMediaId: z.string().uuid().optional(),
  /** §18.2 S19: "optional 60-second video". */
  videoMediaId: z.string().uuid().optional(),
  answers: z.record(z.string().max(80), z.string().max(2000)).default({}),
});
export type ApplyToJobInput = z.infer<typeof applyToJobSchema>;

/** §12 PATCH /applications/:id {status, note}. */
export const applicationDecisionSchema = z.object({
  status: applicationStatus,
  note: z.string().trim().max(2000).optional(),
});
export type ApplicationDecisionInput = z.infer<typeof applicationDecisionSchema>;

/**
 * §13.6: `submitted → viewed → shortlisted → interview → offered →
 * rejected|withdrawn`.
 *
 * The chain is ordered rather than a fixed edge list because employers skip
 * rungs constantly — shortlisting straight from `submitted` is normal, and
 * refusing it would only teach them to lie about the state. What is refused is
 * moving *backwards* (un-rejecting an applicant who has already been told) and
 * leaving a terminal state at all.
 */
const PROGRESSION: ApplicationStatus[] = [
  'submitted',
  'viewed',
  'shortlisted',
  'interview',
  'offered',
];

export const TERMINAL_APPLICATION_STATUSES: ApplicationStatus[] = ['rejected', 'withdrawn'];

export type ApplicationActor = 'poster' | 'applicant';

export interface ApplicationTransitionResult {
  allowed: boolean;
  /** Turkish, user-facing — the API returns this verbatim. */
  reasonTr?: string;
}

export function canTransitionApplication(
  from: ApplicationStatus,
  to: ApplicationStatus,
  actor: ApplicationActor,
): ApplicationTransitionResult {
  if (from === to) return { allowed: false, reasonTr: 'Başvuru zaten bu durumda.' };

  if (TERMINAL_APPLICATION_STATUSES.includes(from)) {
    return { allowed: false, reasonTr: 'Sonuçlanmış bir başvuru yeniden değerlendirilemez.' };
  }

  // The applicant owns exactly one transition: pulling out. Everything else is
  // the employer's, and letting an applicant mark themselves "offered" would
  // make the status meaningless.
  if (actor === 'applicant') {
    return to === 'withdrawn'
      ? { allowed: true }
      : { allowed: false, reasonTr: 'Başvurunu yalnızca geri çekebilirsin.' };
  }

  if (to === 'withdrawn') {
    return { allowed: false, reasonTr: 'Başvuruyu yalnızca aday geri çekebilir.' };
  }

  if (to === 'rejected') return { allowed: true };

  const fromRank = PROGRESSION.indexOf(from);
  const toRank = PROGRESSION.indexOf(to);
  if (toRank < 0) return { allowed: false, reasonTr: 'Geçersiz başvuru durumu.' };

  return toRank > fromRank
    ? { allowed: true }
    : { allowed: false, reasonTr: 'Başvuru bir önceki aşamaya geri alınamaz.' };
}

/** §17 `application.status_changed` copy, one line per state. */
export const APPLICATION_STATUS_COPY: Record<ApplicationStatus, { tr: string; en: string }> = {
  submitted: { tr: 'Başvurun alındı.', en: 'Your application was received.' },
  viewed: { tr: 'Başvurun görüntülendi.', en: 'Your application was viewed.' },
  shortlisted: { tr: 'Başvurun ön listeye alındı.', en: 'You were shortlisted.' },
  interview: { tr: 'Görüşmeye davet edildin.', en: 'You were invited to interview.' },
  offered: { tr: 'Sana teklif yapıldı.', en: 'You received an offer.' },
  rejected: { tr: 'Başvurun bu sefer olumsuz sonuçlandı.', en: 'Your application was not successful.' },
  withdrawn: { tr: 'Başvurunu geri çektin.', en: 'You withdrew your application.' },
};

/**
 * §26: "display a notice that employment terms are between the parties".
 * Shipped from the API with every job so a client release cannot lag it.
 */
export const JOB_TERMS_NOTICE = {
  tr:
    'İş koşulları ilan sahibi ile aday arasındadır. ONLY HORSES iş sözleşmesinin tarafı değildir ' +
    've maaş, konaklama veya çalışma saatlerini doğrulamaz.',
  en:
    'Employment terms are between the poster and the applicant. ONLY HORSES is not a party to the ' +
    'contract and does not verify salary, accommodation or working hours.',
} as const;

/**
 * §26's minimum-wage table — configuration, not law.
 *
 * Gross statutory monthly minimum in each country's own currency. The check
 * runs only when the job's salary currency matches, so a euro salary on a
 * Turkish job is treated as "not determinable" rather than converted at a rate
 * this package has no business knowing.
 *
 * These are the figures in force at `asOf` and must be reviewed when
 * governments update them. A stale table under-blocks — it lets a listing
 * through that a current one would stop — which is the safe direction for a
 * rule that refuses to publish someone's job.
 */
export const MIN_WAGE_AS_OF = '2025-01';

export const MONTHLY_MIN_WAGE: Record<string, { currency: string; amount: number }> = {
  TR: { currency: 'TRY', amount: 26_005 },
  DE: { currency: 'EUR', amount: 2_222 },
  FR: { currency: 'EUR', amount: 1_801 },
  ES: { currency: 'EUR', amount: 1_184 },
  NL: { currency: 'EUR', amount: 2_191 },
  BE: { currency: 'EUR', amount: 2_070 },
  IE: { currency: 'EUR', amount: 2_281 },
  PT: { currency: 'EUR', amount: 870 },
  PL: { currency: 'PLN', amount: 4_666 },
  GB: { currency: 'GBP', amount: 2_116 },
  US: { currency: 'USD', amount: 1_256 },
};

/**
 * Hours assumed in a full-time month: 40 h/week × 52 weeks ÷ 12. Used to
 * normalize an hourly or weekly quote before comparing it to a monthly floor.
 */
export const FULL_TIME_HOURS_PER_MONTH = 173.33;

export function monthlySalary(amount: number, period: SalaryPeriod): number {
  switch (period) {
    case 'hour':
      return amount * FULL_TIME_HOURS_PER_MONTH;
    case 'day':
      return amount * 21.67;
    case 'week':
      return (amount * 52) / 12;
    case 'month':
      return amount;
    case 'year':
      return amount / 12;
  }
}

export interface JobLegalityInput {
  countryCode: string;
  jobType: z.infer<typeof jobType>;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: SalaryPeriod | null;
  accommodation?: AccommodationKind | null;
  mealsIncluded?: boolean;
}

export interface JobLegalityViolation {
  rule: 'unpaid_full_time' | 'below_minimum_wage';
  messageTr: string;
  messageEn: string;
  details?: Record<string, unknown>;
}

/**
 * §26's publish gate.
 *
 * Deliberately narrow. It blocks two things a reader would recognise as wage
 * theft — a full-time job advertised as unpaid, and a stated wage below the
 * country's own floor — and stays silent everywhere the answer is not
 * determinable from the listing alone. An unpaid internship is not blocked:
 * that is lawful in most of the launch region, and treating it as fraud would
 * be this file inventing policy the spec did not write.
 */
export function checkJobLegality(input: JobLegalityInput): JobLegalityViolation[] {
  const violations: JobLegalityViolation[] = [];
  const paidRoleTypes: z.infer<typeof jobType>[] = ['full_time', 'part_time', 'seasonal', 'contract'];

  const statedZero =
    (input.salaryMin ?? null) !== null && (input.salaryMax ?? input.salaryMin ?? 0) === 0;

  if (statedZero && paidRoleTypes.includes(input.jobType)) {
    violations.push({
      rule: 'unpaid_full_time',
      messageTr:
        'Ücretsiz tam zamanlı iş ilanı yayınlanamaz. Konaklama ve yemek ücret yerine geçmez.',
      messageEn:
        'An unpaid full-time job cannot be published. Accommodation and meals do not replace a wage.',
      details: { jobType: input.jobType },
    });

    // One violation is enough; the wage comparison below would only repeat it.
    return violations;
  }

  const floor = MONTHLY_MIN_WAGE[input.countryCode.toUpperCase()];
  const amount = input.salaryMin ?? input.salaryMax ?? null;

  // Not determinable: no floor published for the country, no salary quoted, or
  // a currency this table cannot compare against without an FX rate.
  if (!floor || amount === null || !input.salaryPeriod) return violations;
  if ((input.salaryCurrency ?? '').toUpperCase() !== floor.currency) return violations;
  if (input.jobType === 'internship' || input.jobType === 'working_student') return violations;

  const monthly = monthlySalary(amount, input.salaryPeriod);

  // Part-time is quoted for fewer hours than the floor assumes, so only an
  // hourly rate can be compared honestly.
  const comparable = input.jobType !== 'part_time' || input.salaryPeriod === 'hour';
  if (!comparable) return violations;

  // 2 % tolerance: rounding a published hourly rate into a monthly figure
  // lands a cent or two under the floor for wages that are in fact compliant.
  if (monthly < floor.amount * 0.98) {
    violations.push({
      rule: 'below_minimum_wage',
      messageTr:
        `Belirtilen maaş ${input.countryCode.toUpperCase()} asgari ücretinin altında ` +
        `(aylık ${Math.round(monthly).toLocaleString('tr-TR')} ${floor.currency}, ` +
        `asgari ${floor.amount.toLocaleString('tr-TR')} ${floor.currency}).`,
      messageEn:
        `The stated salary is below the ${input.countryCode.toUpperCase()} statutory minimum ` +
        `(${Math.round(monthly)} ${floor.currency}/month against ${floor.amount}).`,
      details: { monthly: Math.round(monthly), floor: floor.amount, currency: floor.currency, asOf: MIN_WAGE_AS_OF },
    });
  }

  return violations;
}

export type JobSearchResult = SearchResult<JobSearchHit>;
