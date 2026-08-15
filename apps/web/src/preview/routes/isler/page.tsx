import type { Metadata } from 'next';

import { DEMO_JOBS } from '@only-horses/demo-content';
import { formatSalary, JOB_TYPE_LABEL_TR } from '@/lib/api';

/**
 * The preview's job board — stands in for `[locale]/isler` in the static
 * export only.
 *
 * §26's employment notice and the "Maaş görüşülür" rule (§18.2 S17) come from
 * the same helpers the production page uses, so a job with no published salary
 * reads the same here as it does live.
 */
export const metadata: Metadata = {
  title: 'İşler',
  description: 'Seyis, eğitmen, nalbant ve hara işleri — konaklama ve vize desteği bilgisiyle.',
};

export function generateStaticParams() {
  return [{ locale: 'tr' }, { locale: 'en' }];
}

export default function PreviewJobsPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="font-display text-h1 md:text-display">İşler</h1>
        <p className="text-small text-text-secondary mt-2">
          Bu önizlemede {DEMO_JOBS.length} örnek iş ilanı var. Başvuru canlı API gerektirir.
        </p>
      </header>

      {DEMO_JOBS.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center">
          <p className="font-display text-h3">Şu an açık ilan yok</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {DEMO_JOBS.map((job) => (
            <li key={job.id} className="rounded-lg border border-border bg-surface p-5">
              <h2 className="font-display text-h3">{job.title}</h2>
              <p className="text-small text-text-secondary mt-1">
                {job.organizationName ?? job.posterName}
                {job.city ? ` · ${job.city}` : ''}
                {job.jobType ? ` · ${JOB_TYPE_LABEL_TR[job.jobType] ?? job.jobType}` : ''}
              </p>
              <p className="text-small mt-3 tabular">
                {formatSalary({
                  salary_min: job.salaryMin === null ? null : String(job.salaryMin),
                  salary_max: job.salaryMax === null ? null : String(job.salaryMax),
                  salary_currency: job.salaryCurrency,
                  salary_period: job.salaryPeriod,
                })}
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="text-small text-text-secondary mt-8">
        ONLY HORSES bir istihdam bürosu değildir; iş ilanları ilan sahibinin sorumluluğundadır.
      </p>
    </main>
  );
}
