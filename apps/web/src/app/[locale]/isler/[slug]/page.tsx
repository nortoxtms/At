import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  ACCOMMODATION_LABEL_TR,
  JOB_TYPE_LABEL_TR,
  formatSalary,
  getJob,
  type JobDetail,
} from '@/lib/api';

/**
 * Job detail — spec §19.1 `/[locale]/isler/[slug]`, §18.2 S18, §19.2.
 *
 * §19.2 asks for `JobPosting` structured data here specifically, and Google
 * Jobs is unusually strict about it: a missing `hiringOrganization` or an
 * absent `validThrough` drops the posting silently. Both are emitted from
 * real data or not at all — inventing an employer name to satisfy a validator
 * would put a false company on a real job.
 */
export const revalidate = 300;

interface PageProps {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const job = await getJob(slug);

  if (!job) return { title: 'İlan bulunamadı' };

  const where = [job.city, job.region, job.country_code].filter(Boolean).join(', ');
  const description = `${JOB_TYPE_LABEL_TR[job.job_type] ?? job.job_type} · ${where} · ${formatSalary(job)}`;

  return {
    title: `${job.title}${job.organization_name ? ` · ${job.organization_name}` : ''}`,
    description,
    alternates: {
      canonical: `/${locale}/isler/${job.slug}`,
      languages: {
        tr: `/tr/isler/${job.slug}`,
        en: `/en/isler/${job.slug}`,
        'x-default': `/tr/isler/${job.slug}`,
      },
    },
    // A filled or expired job is not a result anyone can act on.
    robots: job.status === 'active' ? undefined : { index: false, follow: true },
  };
}

export default async function JobPage({ params }: PageProps) {
  const { locale, slug } = await params;
  const job = await getJob(slug);

  if (!job) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildJobPostingJsonLd(job, locale)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildBreadcrumbJsonLd(job, locale)) }}
      />

      <header className="border-b border-border pb-6">
        <h1 className="font-display text-h1">{job.title}</h1>
        <p className="text-small text-text-secondary mt-2">
          {job.organization_name ?? job.poster_name} ·{' '}
          {[job.city, job.region].filter(Boolean).join(', ') || job.country_code}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-surface-raised px-3 py-1 text-caption">
            {JOB_TYPE_LABEL_TR[job.job_type] ?? job.job_type}
          </span>
          <span className="rounded-full border border-border px-3 py-1 text-caption tabular">
            {formatSalary(job)}
          </span>
          {job.accommodation && job.accommodation !== 'none' ? (
            <span className="rounded-full border border-border px-3 py-1 text-caption">
              {ACCOMMODATION_LABEL_TR[job.accommodation] ?? job.accommodation}
            </span>
          ) : null}
          {job.meals_included ? (
            <span className="rounded-full border border-border px-3 py-1 text-caption">Yemek dahil</span>
          ) : null}
          {job.visa_support ? (
            <span className="rounded-full border border-border px-3 py-1 text-caption">Vize desteği</span>
          ) : null}
        </div>
      </header>

      <section className="prose-tight mt-8">
        <h2 className="font-display text-h3">İlan detayı</h2>
        <p className="mt-3 whitespace-pre-line">{job.description}</p>

        {job.responsibilities ? (
          <>
            <h3 className="font-display text-h3 mt-8">Sorumluluklar</h3>
            <p className="mt-3 whitespace-pre-line">{job.responsibilities}</p>
          </>
        ) : null}

        {job.requirements ? (
          <>
            <h3 className="font-display text-h3 mt-8">Aranan nitelikler</h3>
            <p className="mt-3 whitespace-pre-line">{job.requirements}</p>
          </>
        ) : null}
      </section>

      <dl className="mt-8 grid grid-cols-2 gap-4 border-t border-border pt-6 text-small sm:grid-cols-3">
        {job.horse_count ? (
          <div>
            <dt className="text-text-secondary">At sayısı</dt>
            <dd className="tabular">{job.horse_count}</dd>
          </div>
        ) : null}
        {job.experience_years_min !== null ? (
          <div>
            <dt className="text-text-secondary">Asgari deneyim</dt>
            <dd className="tabular">{job.experience_years_min} yıl</dd>
          </div>
        ) : null}
        {job.start_date ? (
          <div>
            <dt className="text-text-secondary">Başlangıç</dt>
            <dd className="tabular">{job.start_date}</dd>
          </div>
        ) : null}
        {job.application_deadline ? (
          <div>
            <dt className="text-text-secondary">Son başvuru</dt>
            <dd className="tabular">{job.application_deadline}</dd>
          </div>
        ) : null}
        {job.languages_required.length > 0 ? (
          <div>
            <dt className="text-text-secondary">Diller</dt>
            <dd>{job.languages_required.join(', ')}</dd>
          </div>
        ) : null}
      </dl>

      {/* §26: employment terms are between the parties, and the notice comes
          from the API so a stale build cannot omit or rewrite it. */}
      <aside className="mt-8 rounded-lg border border-border bg-surface-raised/60 p-5 text-small">
        <p>{job.notice.tr}</p>
      </aside>

      <div className="mt-8 flex items-center gap-4">
        <a
          href={`onlyhorses://jobs/${job.slug}/apply`}
          className="rounded-md bg-gold-soft px-6 py-3 text-text-on-gold transition hover:bg-gold-soft/90"
        >
          Başvur
        </a>
        <span className="text-small text-text-secondary tabular">
          {job.application_count} başvuru
        </span>
      </div>
    </main>
  );
}

/** §19.2: `JobPosting` on jobs. */
function buildJobPostingJsonLd(job: JobDetail, locale: string): Record<string, unknown> {
  const employer = job.organization_name ?? job.poster_name;

  const baseSalary =
    job.salary_public && job.salary_min && job.salary_currency && job.salary_period
      ? {
          '@type': 'MonetaryAmount',
          currency: job.salary_currency,
          value: {
            '@type': 'QuantitativeValue',
            minValue: Number(job.salary_min),
            maxValue: job.salary_max ? Number(job.salary_max) : undefined,
            unitText: job.salary_period.toUpperCase(),
          },
        }
      : undefined;

  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: [job.description, job.responsibilities, job.requirements]
      .filter(Boolean)
      .join('\n\n'),
    datePosted: job.published_at,
    validThrough: job.application_deadline ?? job.expires_at,
    employmentType: EMPLOYMENT_TYPE[job.job_type],
    // Omitted rather than faked when there is no employer to name.
    hiringOrganization: employer
      ? { '@type': 'Organization', name: employer }
      : undefined,
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: job.city ?? undefined,
        addressRegion: job.region ?? undefined,
        addressCountry: job.country_code,
      },
    },
    baseSalary,
    url: `/${locale}/isler/${job.slug}`,
  };
}

/** §19.2: BreadcrumbList everywhere. */
function buildBreadcrumbJsonLd(job: JobDetail, locale: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ONLY HORSES', item: `/${locale}` },
      { '@type': 'ListItem', position: 2, name: 'İş ilanları', item: `/${locale}/isler` },
      { '@type': 'ListItem', position: 3, name: job.title, item: `/${locale}/isler/${job.slug}` },
    ],
  };
}

/** schema.org's vocabulary, which is not §7's enum. */
const EMPLOYMENT_TYPE: Record<string, string> = {
  full_time: 'FULL_TIME',
  part_time: 'PART_TIME',
  seasonal: 'TEMPORARY',
  contract: 'CONTRACTOR',
  internship: 'INTERN',
  working_student: 'PART_TIME',
};
