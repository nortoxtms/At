import { describe, expect, it } from 'vitest';
import {
  applyToJobSchema,
  canTransitionApplication,
  checkJobLegality,
  checkReviewEligibility,
  createJobSchema,
  createServiceSchema,
  jobSearchSchema,
  monthlySalary,
  MIN_MESSAGES_PER_SIDE,
  REVIEW_WINDOW_DAYS,
  reviewWindowClosesAt,
  serviceNoticeFor,
  serviceSearchSchema,
} from '../index.js';

const DAY = 24 * 60 * 60 * 1000;

describe('§13.6 job application state machine', () => {
  it('lets an employer skip rungs forwards', () => {
    expect(canTransitionApplication('submitted', 'shortlisted', 'poster').allowed).toBe(true);
    expect(canTransitionApplication('viewed', 'offered', 'poster').allowed).toBe(true);
  });

  it('refuses to walk an applicant backwards', () => {
    const result = canTransitionApplication('interview', 'viewed', 'poster');
    expect(result.allowed).toBe(false);
    expect(result.reasonTr).toContain('geri alınamaz');
  });

  it('lets an employer reject from any live state', () => {
    for (const from of ['submitted', 'viewed', 'shortlisted', 'interview', 'offered'] as const) {
      expect(canTransitionApplication(from, 'rejected', 'poster').allowed).toBe(true);
    }
  });

  it('gives the applicant exactly one transition', () => {
    expect(canTransitionApplication('shortlisted', 'withdrawn', 'applicant').allowed).toBe(true);
    expect(canTransitionApplication('shortlisted', 'offered', 'applicant').allowed).toBe(false);
    // And the employer cannot withdraw on the applicant's behalf.
    expect(canTransitionApplication('shortlisted', 'withdrawn', 'poster').allowed).toBe(false);
  });

  it('treats rejected and withdrawn as final', () => {
    expect(canTransitionApplication('rejected', 'shortlisted', 'poster').allowed).toBe(false);
    expect(canTransitionApplication('withdrawn', 'viewed', 'poster').allowed).toBe(false);
  });

  it('refuses a no-op', () => {
    expect(canTransitionApplication('viewed', 'viewed', 'poster').allowed).toBe(false);
  });
});

describe('§26 job legality', () => {
  it('blocks an unpaid full-time job', () => {
    const violations = checkJobLegality({
      countryCode: 'TR',
      jobType: 'full_time',
      salaryMin: 0,
      salaryMax: 0,
      salaryCurrency: 'TRY',
      salaryPeriod: 'month',
      accommodation: 'private',
      mealsIncluded: true,
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]!.rule).toBe('unpaid_full_time');
    // Accommodation and meals are named in the message on purpose: it is the
    // argument posters make.
    expect(violations[0]!.messageTr).toContain('Konaklama');
  });

  it('blocks a stated wage below the country floor', () => {
    const violations = checkJobLegality({
      countryCode: 'TR',
      jobType: 'full_time',
      salaryMin: 15_000,
      salaryCurrency: 'TRY',
      salaryPeriod: 'month',
    });

    expect(violations.map((v) => v.rule)).toEqual(['below_minimum_wage']);
  });

  it('allows a compliant wage', () => {
    expect(
      checkJobLegality({
        countryCode: 'DE',
        jobType: 'full_time',
        salaryMin: 2_400,
        salaryCurrency: 'EUR',
        salaryPeriod: 'month',
      }),
    ).toEqual([]);
  });

  it('stays silent where the answer is not determinable', () => {
    // No floor published for the country.
    expect(checkJobLegality({ countryCode: 'AR', jobType: 'full_time', salaryMin: 1, salaryCurrency: 'ARS', salaryPeriod: 'month' })).toEqual([]);
    // Currency the table cannot compare without an FX rate.
    expect(checkJobLegality({ countryCode: 'TR', jobType: 'full_time', salaryMin: 900, salaryCurrency: 'EUR', salaryPeriod: 'month' })).toEqual([]);
    // No salary quoted at all — "Maaş görüşülür".
    expect(checkJobLegality({ countryCode: 'TR', jobType: 'full_time' })).toEqual([]);
  });

  it('does not treat an unpaid internship as wage theft', () => {
    expect(checkJobLegality({ countryCode: 'TR', jobType: 'internship', salaryMin: 0, salaryMax: 0 })).toEqual([]);
    expect(
      checkJobLegality({ countryCode: 'DE', jobType: 'working_student', salaryMin: 400, salaryCurrency: 'EUR', salaryPeriod: 'month' }),
    ).toEqual([]);
  });

  it('compares part-time only on an hourly rate', () => {
    // A part-time monthly figure is below the full-time floor by construction.
    expect(
      checkJobLegality({ countryCode: 'DE', jobType: 'part_time', salaryMin: 1_100, salaryCurrency: 'EUR', salaryPeriod: 'month' }),
    ).toEqual([]);
    // An hourly rate is comparable, and this one is under.
    expect(
      checkJobLegality({ countryCode: 'DE', jobType: 'part_time', salaryMin: 6, salaryCurrency: 'EUR', salaryPeriod: 'hour' }).map((v) => v.rule),
    ).toEqual(['below_minimum_wage']);
  });

  it('normalizes periods to a month', () => {
    expect(Math.round(monthlySalary(12, 'hour'))).toBe(2080);
    expect(Math.round(monthlySalary(24_000, 'year'))).toBe(2000);
    expect(Math.round(monthlySalary(500, 'week'))).toBe(2167);
  });
});

describe('§13.4 review eligibility', () => {
  const base = {
    authorCanWriteReview: true,
    authorId: 'a',
    subjectId: 'b',
    messagesFromAuthor: 2,
    messagesFromSubject: 2,
    lastMessageAt: new Date(Date.now() - 2 * DAY).toISOString(),
    alreadyReviewed: false,
  };

  it('accepts a two-sided conversation inside the window', () => {
    expect(checkReviewEligibility(base).eligible).toBe(true);
  });

  it('requires messages from both sides', () => {
    const oneSided = checkReviewEligibility({ ...base, messagesFromSubject: 1 });
    expect(oneSided.eligible).toBe(false);
    expect(oneSided.code).toBe('too_few_messages');
    expect(oneSided.messageTr).toContain(String(MIN_MESSAGES_PER_SIDE));
  });

  it('rejects a review with no contact at all (§24.12)', () => {
    const none = checkReviewEligibility({
      ...base,
      messagesFromAuthor: 0,
      messagesFromSubject: 0,
      lastMessageAt: null,
    });
    expect(none.code).toBe('no_qualifying_contact');
  });

  it('accepts a completed transfer without any messages', () => {
    expect(
      checkReviewEligibility({
        ...base,
        messagesFromAuthor: 0,
        messagesFromSubject: 0,
        lastMessageAt: null,
        transferCompletedAt: new Date(Date.now() - 3 * DAY).toISOString(),
      }).eligible,
    ).toBe(true);
  });

  it('closes the window 14 days after the last activity', () => {
    const stale = checkReviewEligibility({
      ...base,
      lastMessageAt: new Date(Date.now() - (REVIEW_WINDOW_DAYS + 1) * DAY).toISOString(),
    });
    expect(stale.eligible).toBe(false);
    expect(stale.code).toBe('window_closed');
  });

  it('extends the window when the listing closed after the last message', () => {
    const closesAt = reviewWindowClosesAt({
      ...base,
      lastMessageAt: new Date(Date.now() - 20 * DAY).toISOString(),
      listingClosedAt: new Date(Date.now() - 1 * DAY).toISOString(),
    });

    expect(closesAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('blocks self-review and unverified authors', () => {
    expect(checkReviewEligibility({ ...base, subjectId: 'a' }).code).toBe('self_review');
    expect(checkReviewEligibility({ ...base, authorCanWriteReview: false }).code).toBe('not_verified');
  });

  it('allows one review per conversation', () => {
    expect(checkReviewEligibility({ ...base, alreadyReviewed: true }).code).toBe('already_reviewed');
  });
});

describe('§26 transport notice', () => {
  it('attaches to transport services only', () => {
    expect(serviceNoticeFor('transport')?.tr).toContain('1/2005');
    expect(serviceNoticeFor('farrier')).toBeNull();
  });
});

describe('M4 schemas', () => {
  it('refuses a service radius without a centre', () => {
    const result = createServiceSchema.safeParse({
      category: 'farrier',
      title: 'Nalbant hizmeti',
      description: 'Bölgede mobil nalbant hizmeti veriyorum, 10 yıllık deneyim.',
      countryCode: 'TR',
      serviceRadiusKm: 50,
    });

    expect(result.success).toBe(false);
  });

  it('refuses a salary figure with no period or currency', () => {
    const result = createJobSchema.safeParse({
      title: 'Seyis aranıyor',
      jobType: 'full_time',
      rolesNeeded: ['groom'],
      description: 'x'.repeat(100),
      countryCode: 'TR',
      salaryMin: 30_000,
    });

    expect(result.success).toBe(false);
  });

  it('requires a destination for non-in-app applications', () => {
    const parsed = createJobSchema.safeParse({
      title: 'Seyis aranıyor',
      jobType: 'full_time',
      rolesNeeded: ['groom'],
      description: 'x'.repeat(100),
      countryCode: 'TR',
      applyMethod: 'email',
    });

    expect(parsed.success).toBe(false);
  });

  it('parses "false" as false in every M4 search schema', () => {
    expect(jobSearchSchema.parse({ includeUndisclosedSalary: 'false' }).includeUndisclosedSalary).toBe(false);
    expect(serviceSearchSchema.parse({ includeRadiusMatches: 'false' }).includeRadiusMatches).toBe(false);
  });

  it('requires a cover letter long enough to be a sentence', () => {
    expect(applyToJobSchema.safeParse({ coverLetter: 'merhaba' }).success).toBe(false);
    expect(applyToJobSchema.safeParse({ coverLetter: 'Merhaba, on yıllık seyislik deneyimim var.' }).success).toBe(true);
  });
});
