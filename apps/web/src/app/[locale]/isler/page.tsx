import type { Metadata } from 'next';
import Link from 'next/link';

import { ACCOMMODATION_LABEL_TR, JOB_TYPE_LABEL_TR, formatSalary, searchJobs } from '@/lib/api';

/**
 * Jobs index — spec §19.1 `/[locale]/isler`, §18.2 S17.
 *
 * Server-rendered like the listing index and for the same reason (§19.2):
 * "Kayseri at bakıcısı iş ilanı" is a search someone types into Google, not
 * into an app.
 */
export const revalidate = 300;

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const metadata: Metadata = {
  title: 'At sektöründe iş ilanları',
  description:
    'Ahır, hara ve binicilik tesislerinde seyis, binici, antrenör ve nalbant iş ilanları. ' +
    'Konaklama, yemek ve vize desteği bilgileriyle.',
};

export default async function JobsIndexPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const query = await searchParams;

  const first = (key: string): string | undefined => {
    const value = query[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const page = Number(first('page') ?? 1);

  const { hits, total } = await searchJobs({
    q: first('q'),
    jobTypes: first('jobTypes'),
    countryCode: first('countryCode'),
    city: first('city'),
    accommodation: first('accommodation'),
    experienceMaxYears: first('experienceMaxYears'),
    salaryMinEur: first('salaryMinEur'),
    sort: first('sort') ?? 'recommended',
    page,
    limit: 20,
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="font-display text-h1 md:text-display">İş ilanları</h1>
        <p className="text-small text-text-secondary mt-2 tabular">{total} açık pozisyon</p>
      </header>

      {hits.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center">
          <p className="font-display text-h3">Bu filtrelerle ilan bulunamadı</p>
          <p className="text-small text-text-secondary mt-2">
            Filtreleri genişlet ya da yakındaki şehirlere de bak.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4">
          {hits.map((job) => (
            <li key={job.id}>
              <Link
                href={`/${locale}/isler/${job.slug}`}
                className="block rounded-lg border border-border bg-surface p-5 transition hover:border-gold-muted"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="font-display text-h3">{job.title}</h2>
                  <span className="text-small text-text-secondary whitespace-nowrap tabular">
                    {formatSalary({
                      salary_min: job.salaryMin === null ? null : String(job.salaryMin),
                      salary_max: job.salaryMax === null ? null : String(job.salaryMax),
                      salary_currency: job.salaryCurrency,
                      salary_period: job.salaryPeriod,
                    })}
                  </span>
                </div>

                <p className="text-small text-text-secondary mt-1">
                  {job.organizationName ?? job.posterName} · {job.city ?? job.region ?? job.countryCode}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-border px-3 py-1 text-caption">
                    {JOB_TYPE_LABEL_TR[job.jobType] ?? job.jobType}
                  </span>
                  {job.accommodation && job.accommodation !== 'none' ? (
                    <span className="rounded-full border border-border px-3 py-1 text-caption">
                      {ACCOMMODATION_LABEL_TR[job.accommodation] ?? job.accommodation}
                    </span>
                  ) : null}
                  {job.mealsIncluded ? (
                    <span className="rounded-full border border-border px-3 py-1 text-caption">
                      Yemek dahil
                    </span>
                  ) : null}
                  {job.visaSupport ? (
                    <span className="rounded-full border border-border px-3 py-1 text-caption">
                      Vize desteği
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
