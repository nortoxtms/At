import { Injectable, Logger } from '@nestjs/common';
import {
  checkJobLegality,
  type CreateJobInput,
  findContactInfo,
  JOB_TERMS_NOTICE,
  PRODUCTS,
  type UpdateJobInput,
} from '@only-horses/shared-types';

import { ApiException } from '../../common/filters/api-exception.filter.js';
import { DatabaseService } from '../../database/database.service.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

/**
 * Job listings — spec §7, §12, §18.2 S17–S20, §26.
 *
 * Publishing a job passes three gates, and the order is the same argument as
 * everywhere else in this codebase: identity first (§3.3's hard rule, not
 * purchasable), then §26's legality checks, then payment. A poster who is one
 * verification short must be sent to the ladder, and a poster advertising an
 * unpaid full-time job must be refused before anyone takes their money.
 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly entitlements: EntitlementsService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(profileId: string, input: CreateJobInput): Promise<{ id: string; slug: string }> {
    if (input.organizationId) await this.assertOrgAdmin(profileId, input.organizationId);

    const slug = await this.allocateSlug(input.title);

    const rows = await this.db.withUser(profileId, async (client) => {
      const result = await client.query<{ id: string; slug: string }>(
        `INSERT INTO job_listings (
           slug, poster_profile_id, organization_id, title, description,
           responsibilities, requirements, job_type, roles_needed, disciplines,
           country_code, region, city, location,
           salary_min, salary_max, salary_currency, salary_period, salary_public,
           accommodation, meals_included, visa_support, horse_count,
           experience_years_min, languages_required, start_date, application_deadline,
           apply_method, apply_email, apply_url, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::role_type[],$10,$11,$12,$13,
                 CASE WHEN $14::float8 IS NULL THEN NULL
                      ELSE ST_SetSRID(ST_MakePoint($14::float8, $15::float8), 4326)::geography END,
                 $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,'draft')
         RETURNING id, slug`,
        [
          slug,
          profileId,
          input.organizationId ?? null,
          input.title,
          this.sanitize(input.description),
          input.responsibilities ?? null,
          input.requirements ?? null,
          input.jobType,
          input.rolesNeeded,
          input.disciplines,
          input.countryCode,
          input.region ?? null,
          input.city ?? null,
          input.lng ?? null,
          input.lat ?? null,
          input.salaryMin ?? null,
          input.salaryMax ?? null,
          input.salaryCurrency ?? null,
          input.salaryPeriod ?? null,
          input.salaryPublic,
          input.accommodation ?? null,
          input.mealsIncluded,
          input.visaSupport,
          input.horseCount ?? null,
          input.experienceYearsMin ?? null,
          input.languagesRequired,
          input.startDate ?? null,
          input.applicationDeadline ?? null,
          input.applyMethod,
          input.applyEmail ?? null,
          input.applyUrl ?? null,
        ],
      );
      return result.rows;
    });

    return rows[0]!;
  }

  async update(profileId: string, jobId: string, input: UpdateJobInput): Promise<void> {
    await this.loadEditable(profileId, jobId);

    const columns: Record<string, unknown> = {
      title: input.title,
      description: input.description === undefined ? undefined : this.sanitize(input.description),
      responsibilities: input.responsibilities,
      requirements: input.requirements,
      job_type: input.jobType,
      roles_needed: input.rolesNeeded,
      disciplines: input.disciplines,
      country_code: input.countryCode,
      region: input.region,
      city: input.city,
      salary_min: input.salaryMin,
      salary_max: input.salaryMax,
      salary_currency: input.salaryCurrency,
      salary_period: input.salaryPeriod,
      salary_public: input.salaryPublic,
      accommodation: input.accommodation,
      meals_included: input.mealsIncluded,
      visa_support: input.visaSupport,
      horse_count: input.horseCount,
      experience_years_min: input.experienceYearsMin,
      languages_required: input.languagesRequired,
      start_date: input.startDate,
      application_deadline: input.applicationDeadline,
      apply_method: input.applyMethod,
      apply_email: input.applyEmail,
      apply_url: input.applyUrl,
    };

    const present = Object.entries(columns).filter(([, value]) => value !== undefined);
    const movesLocation = input.lat !== undefined && input.lng !== undefined;
    if (present.length === 0 && !movesLocation) return;

    await this.db.withUser(profileId, async (client) => {
      const assignments = present.map(([column], index) => `${column} = $${index + 2}`);
      if (movesLocation) {
        assignments.push(
          `location = ST_SetSRID(ST_MakePoint($${present.length + 2}::float8, $${present.length + 3}::float8), 4326)::geography`,
        );
      }

      await client.query(`UPDATE job_listings SET ${assignments.join(', ')} WHERE id = $1`, [
        jobId,
        ...present.map(([, value]) => value),
        ...(movesLocation ? [input.lng, input.lat] : []),
      ]);
    });
  }

  /** §12 POST /jobs/:id/publish. */
  async publish(profileId: string, jobId: string): Promise<{ status: string; paidWith?: string }> {
    const job = await this.loadEditable(profileId, jobId);
    if (job.status === 'active') return { status: 'active' };

    const entitlements = await this.entitlements.requireVerification(
      profileId,
      'identity_verified',
      'İş ilanı yayınlamak',
    );

    // §26, before payment: refusing a listing after charging for it would be
    // worse than refusing it now.
    const violations = checkJobLegality({
      countryCode: job.country_code,
      jobType: job.job_type,
      salaryMin: job.salary_min === null ? null : Number(job.salary_min),
      salaryMax: job.salary_max === null ? null : Number(job.salary_max),
      salaryCurrency: job.salary_currency,
      salaryPeriod: job.salary_period,
      accommodation: job.accommodation,
      mealsIncluded: job.meals_included,
    });

    if (violations.length > 0) {
      throw ApiException.prohibitedContent(violations.map((v) => v.messageTr).join(' '), {
        violations,
      });
    }

    const paidWith = await this.consumeJobPostAllowance(profileId, jobId, entitlements);

    await this.db.withUser(profileId, (client) =>
      client.query(
        `UPDATE job_listings
         SET status = 'active',
             published_at = COALESCE(published_at, now()),
             expires_at = COALESCE(application_deadline::timestamptz + INTERVAL '1 day',
                                   now() + INTERVAL '60 days')
         WHERE id = $1`,
        [jobId],
      ),
    );

    this.logger.log(`Job ${jobId} published (${paidWith})`);
    return { status: 'active', paidWith };
  }

  /**
   * §3.3: "Publish job — Verified ID: paid · Pro: paid · Business: 5/mo".
   *
   * The free allowance is checked first, then a paid `job_post` purchase for
   * this specific job. M5 creates that row from the Stripe webhook (§16.2);
   * consuming it here is what makes the payment mean something, and marking it
   * applied is what stops one purchase publishing two jobs.
   */
  private async consumeJobPostAllowance(
    profileId: string,
    jobId: string,
    entitlements: { limits: { freeJobPostsPerMonth: number }; usage: { jobPostsThisMonth: number }; tier: string },
  ): Promise<string> {
    if (entitlements.usage.jobPostsThisMonth < entitlements.limits.freeJobPostsPerMonth) {
      return 'plan_allowance';
    }

    // system: `purchases` has a SELECT policy and no UPDATE policy (§8), by
    // design — a user who could edit their own purchases could publish
    // unlimited jobs on one payment. Routed through a SECURITY DEFINER
    // function (migration 0041) that consumes exactly one row.
    const rows = await this.db.query<{ consume_job_post_purchase: string | null }>(
      `SELECT consume_job_post_purchase($1, $2)`,
      [profileId, jobId],
    );

    const applied = rows[0]?.consume_job_post_purchase ?? null;
    if (applied) return `purchase:${applied}`;

    throw ApiException.paymentRequired(
      entitlements.tier === 'business'
        ? `Bu ay ${entitlements.limits.freeJobPostsPerMonth} ücretsiz iş ilanı hakkını kullandın. Ek ilan ${PRODUCTS.job_post!.amountEur} €.`
        : `İş ilanı yayınlamak ${PRODUCTS.job_post!.amountEur} €. Business aboneliğinde ayda 5 ilan ücretsiz.`,
      { product: 'job_post', amountEur: PRODUCTS.job_post!.amountEur, targetId: jobId },
    );
  }

  async setStatus(profileId: string, jobId: string, status: 'paused' | 'withdrawn'): Promise<{ status: string }> {
    await this.loadEditable(profileId, jobId);

    await this.db.withUser(profileId, (client) =>
      client.query(`UPDATE job_listings SET status = $2 WHERE id = $1`, [jobId, status]),
    );

    return { status };
  }

  /** §12 GET /jobs/:slug — public; §19.1 renders it server-side for SEO. */
  async findByIdOrSlug(idOrSlug: string, viewerId: string | null): Promise<Record<string, unknown>> {
    const sql = `SELECT j.id, j.slug, j.title, j.description, j.responsibilities, j.requirements,
                        j.job_type, j.roles_needed::text[] AS roles_needed, j.disciplines,
                        j.country_code, j.region, j.city,
                        j.salary_min, j.salary_max, j.salary_currency, j.salary_period,
                        j.salary_public, j.accommodation, j.meals_included, j.visa_support,
                        j.horse_count, j.experience_years_min, j.languages_required,
                        j.start_date, j.application_deadline, j.apply_method,
                        j.status, j.view_count, j.application_count,
                        j.published_at, j.expires_at,
                        j.poster_profile_id,
                        p.handle AS poster_handle, p.display_name AS poster_name,
                        p.verification_level AS poster_verification, p.trust_score,
                        o.id AS organization_id, o.name AS organization_name, o.slug AS organization_slug,
                        logo.cf_image_id AS organization_logo
                 FROM job_listings j
                 LEFT JOIN profiles p ON p.id = j.poster_profile_id
                 LEFT JOIN organizations o ON o.id = j.organization_id
                 LEFT JOIN media logo ON logo.id = o.logo_media_id
                 WHERE (j.id::text = $1 OR j.slug = $1)`;

    const anonymous = await this.db.query<Record<string, unknown>>(sql, [idOrSlug]);
    const rows = anonymous.length > 0
      ? anonymous
      : viewerId
        ? await this.db.queryAs<Record<string, unknown>>(viewerId, sql, [idOrSlug])
        : [];

    const job = rows[0];
    if (!job) throw ApiException.notFound('İş ilanı');

    const viewerIsPoster = viewerId !== null && job.poster_profile_id === viewerId;

    return {
      ...job,
      // §18.2 S20's "gizle" toggle. Hidden from everyone but the poster; the
      // §26 minimum-wage check still ran on the real numbers at publish.
      salary_min: job.salary_public || viewerIsPoster ? job.salary_min : null,
      salary_max: job.salary_public || viewerIsPoster ? job.salary_max : null,
      // §26: employment terms are between the parties.
      notice: JOB_TERMS_NOTICE,
    };
  }

  async listMine(profileId: string): Promise<unknown[]> {
    return this.db.queryAs(
      profileId,
      `SELECT j.id, j.slug, j.title, j.job_type, j.status, j.city, j.country_code,
              j.application_count, j.published_at, j.expires_at,
              (SELECT count(*) FROM job_applications a
                WHERE a.job_id = j.id AND a.status = 'submitted')::int AS unreviewed_count
       FROM job_listings j
       WHERE j.poster_profile_id = $1
       ORDER BY j.created_at DESC`,
      [profileId],
    );
  }

  /**
   * §13.6: "Applications auto-close when the job expires."
   *
   * Run hourly. An expired job's open applications are closed as `rejected`
   * with a note naming the reason — the enum has no `closed`, and leaving a
   * candidate on "shortlisted" forever against a dead job is the outcome §13.6
   * is written to prevent. Every applicant is notified, as every other status
   * change is.
   */
  async closeExpiredJobs(): Promise<{ jobs: number; applications: number }> {
    // system: routed through a SECURITY DEFINER function (migration 0038).
    // `jobs_write` belongs to the poster, so an unscoped UPDATE here would
    // match nothing and report success.
    const closed = await this.db.query<{
      application_id: string;
      applicant_id: string;
      job_id: string;
      job_title: string;
    }>(`SELECT * FROM close_expired_jobs()`);

    for (const application of closed) {
      await this.notifications.dispatch({
        profileId: application.applicant_id,
        type: 'application.status_changed',
        title: `${application.job_title} · ilan kapandı`,
        body: 'İlan süresi dolduğu için başvurun kapatıldı.',
        data: {
          applicationId: application.application_id,
          jobId: application.job_id,
          status: 'rejected',
        },
        channels: ['push', 'email'],
        dedupeKey: `application_expired:${application.application_id}`,
      });
    }

    // Jobs with no applications expire too — they just have nothing to return,
    // so this counts the ones that had someone waiting on them.
    const jobs = new Set(closed.map((row) => row.job_id)).size;
    if (closed.length > 0) {
      this.logger.log(`Closed ${closed.length} application(s) across ${jobs} expired job(s)`);
    }

    return { jobs, applications: closed.length };
  }

  private sanitize(description: string): string {
    const found = findContactInfo(description);
    if (found.length > 0) {
      throw ApiException.validation(
        'İlan metninde telefon veya e-posta paylaşamazsın. Başvurular uygulama içinden gelmeli.',
        { found },
      );
    }
    return description;
  }

  private async assertOrgAdmin(profileId: string, organizationId: string): Promise<void> {
    const rows = await this.db.queryAs<{ role: string }>(
      profileId,
      `SELECT role FROM organization_members
       WHERE organization_id = $1 AND profile_id = $2 AND role IN ('owner','admin')`,
      [organizationId, profileId],
    );

    if (!rows[0]) throw ApiException.forbidden('Bu işletme adına ilan veremezsin.');
  }

  private async loadEditable(profileId: string, jobId: string): Promise<JobRow> {
    // Scoped: `jobs_select` already answers "may this person see it", and
    // `jobs_write` answers "may they change it" — including org owners and
    // admins, which a plain poster_profile_id comparison would exclude.
    const rows = await this.db.queryAs<JobRow & { can_edit: boolean }>(
      profileId,
      `SELECT j.id, j.status, j.country_code, j.job_type, j.salary_min, j.salary_max,
              j.salary_currency, j.salary_period, j.accommodation, j.meals_included,
              j.poster_profile_id, j.organization_id,
              (j.poster_profile_id = $2
               OR is_org_member(j.organization_id, ARRAY['owner','admin']::org_member_role[])) AS can_edit
       FROM job_listings j
       WHERE j.id = $1`,
      [jobId, profileId],
    );

    const job = rows[0];
    if (!job || !job.can_edit) throw ApiException.notFound('İş ilanı');

    return job;
  }

  private async allocateSlug(title: string): Promise<string> {
    const base = slugify(title).slice(0, 60) || 'is-ilani';

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const rows = await this.db.query<{ taken: boolean }>('SELECT job_slug_taken($1) AS taken', [
        candidate,
      ]);
      if (!rows[0]?.taken) return candidate;
    }

    return `${base}-${Date.now().toString(36)}`;
  }
}

interface JobRow {
  id: string;
  status: string;
  country_code: string;
  job_type: CreateJobInput['jobType'];
  salary_min: string | null;
  salary_max: string | null;
  salary_currency: string | null;
  salary_period: CreateJobInput['salaryPeriod'] | null;
  accommodation: CreateJobInput['accommodation'] | null;
  meals_included: boolean;
  poster_profile_id: string | null;
  organization_id: string | null;
}

function slugify(input: string): string {
  const turkish: Record<string, string> = {
    ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g',
    ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c',
  };

  return input
    .replace(/[ıİşŞğĞüÜöÖçÇ]/g, (char) => turkish[char] ?? char)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
