import type { Metadata } from 'next';

import { getPlans } from '@/lib/api';

/**
 * Pricing — spec §19.1 `/[locale]/fiyatlandirma`, §16.1, §18.2 S27.
 *
 * The numbers come from the API rather than from this file. §16.1 ends with
 * "Prices are configurable; do not hardcode in UI", and a price rendered in a
 * static page is a price that disagrees with Stripe the first time it changes.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Fiyatlandırma',
  description:
    'ONLY HORSES üyelik planları: ücretsiz başla, Pro ile 10 aktif ilan ve sınırsız mesaj, ' +
    'Business ile sınırsız ilan, işletme sayfası ve iş ilanları.',
};

const TIER_LABEL: Record<string, string> = {
  free: 'Ücretsiz',
  pro: 'Pro',
  business: 'Business',
};

export default async function PricingPage() {
  const catalogue = await getPlans();

  if (!catalogue) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="font-display text-h1">Fiyatlandırma</h1>
        <p className="text-small text-text-secondary mt-3">
          Planlar şu anda yüklenemedi. Birazdan tekrar dene.
        </p>
      </main>
    );
  }

  const monthly = catalogue.plans.filter((plan) => plan.interval === 'month');
  const yearly = catalogue.plans.filter((plan) => plan.interval === 'year');

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="text-center">
        <h1 className="font-display text-h1 md:text-display">Planlar</h1>
        <p className="text-small text-text-secondary mx-auto mt-3 max-w-xl">
          Ücretsiz başla. Kimlik doğrulaması her planda zorunludur ve satın alınamaz — ilan
          yayınlamanın koşulu odur, plan değil.
        </p>
      </header>

      <section className="mt-10 grid gap-6 md:grid-cols-3">
        <article className="rounded-lg border border-border bg-paper p-6">
          <h2 className="font-display text-h2">Ücretsiz</h2>
          <p className="mt-2 text-display tabular">0 €</p>
          <p className="text-small text-text-secondary mt-1">Her zaman</p>
        </article>

        {monthly.map((plan) => {
          const yearlyPlan = yearly.find((option) => option.tier === plan.tier);

          return (
            <article
              key={plan.product}
              className={`rounded-lg border bg-paper p-6 ${
                plan.tier === 'pro' ? 'border-brass' : 'border-border'
              }`}
            >
              <h2 className="font-display text-h2">{TIER_LABEL[plan.tier]}</h2>
              <p className="mt-2 text-display tabular">{plan.amountEur} €</p>
              <p className="text-small text-text-secondary mt-1">aylık</p>

              {yearlyPlan ? (
                <p className="text-small text-text-secondary mt-3 tabular">
                  Yıllık {yearlyPlan.amountEur} € — ayda {yearlyPlan.perMonthEur} €
                  {yearlyPlan.savingPercent ? ` (%${yearlyPlan.savingPercent} tasarruf)` : ''}
                </p>
              ) : null}
            </article>
          );
        })}
      </section>

      <section className="mt-12 overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-small">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-3 font-normal text-text-secondary">Özellik</th>
              <th className="py-3 font-normal">Ücretsiz</th>
              <th className="py-3 font-normal">Pro</th>
              <th className="py-3 font-normal">Business</th>
            </tr>
          </thead>
          <tbody>
            {catalogue.features.map((feature) => (
              <tr key={feature.labelEn} className="border-b border-border/60">
                <td className="py-3 text-text-secondary">{feature.labelTr}</td>
                <td className="py-3 tabular">{feature.free}</td>
                <td className="py-3 tabular">{feature.pro}</td>
                <td className="py-3 tabular">{feature.business}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-12 rounded-lg border border-border bg-sand/40 p-6 text-small">
        <h2 className="font-display text-h3">Tek seferlik ürünler</h2>
        <ul className="mt-3 space-y-2">
          <li className="tabular">
            Öne çıkarma — 7 gün {catalogue.products.boost_7d?.amountEur} €, 30 gün{' '}
            {catalogue.products.boost_30d?.amountEur} €
          </li>
          <li className="tabular">
            İş ilanı — {catalogue.products.job_post?.amountEur} € (Business planında ayda 5 ücretsiz)
          </li>
        </ul>
        <p className="text-text-secondary mt-4">
          ONLY HORSES at satışından komisyon almaz ve ödemeye aracılık etmez. Alım satım
          taraflar arasındadır.
        </p>
      </section>
    </main>
  );
}
