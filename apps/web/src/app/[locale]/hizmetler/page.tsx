import type { Metadata } from 'next';
import Link from 'next/link';

import { searchServices } from '@/lib/api';

/**
 * Services index — spec §19.1 `/[locale]/hizmetler`, §18.2 S15.
 *
 * The hub is a category grid on mobile; on the web it is a list, because the
 * traffic that lands here arrives from "Ankara nalbant" rather than from a
 * grid of icons.
 */
export const revalidate = 300;

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const metadata: Metadata = {
  title: 'At hizmetleri — nalbant, veteriner, nakliye, pansiyon',
  description:
    'Doğrulanmış at hizmeti sağlayıcıları: nalbant, veteriner, diş bakımı, nakliye, ' +
    'pansiyon ve eğitim. Konumuna en yakın olanları gör.',
};

export default async function ServicesIndexPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const query = await searchParams;

  const first = (key: string): string | undefined => {
    const value = query[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const { hits, total } = await searchServices({
    q: first('q'),
    categories: first('categories'),
    countryCode: first('countryCode'),
    city: first('city'),
    isMobile: first('isMobile'),
    sort: first('sort') ?? 'recommended',
    page: Number(first('page') ?? 1),
    limit: 20,
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="font-display text-h1 md:text-display">Hizmetler</h1>
        <p className="text-small text-text-secondary mt-2 tabular">{total} hizmet ilanı</p>
      </header>

      {hits.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center">
          <p className="font-display text-h3">Bu filtrelerle hizmet bulunamadı</p>
          <p className="text-small text-text-secondary mt-2">
            Mobil hizmet verenler de dahil, arama yarıçapını genişletmeyi dene.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {hits.map((service) => (
            <li key={service.id}>
              <Link
                href={`/${locale}/hizmetler/${service.slug}`}
                className="block h-full rounded-lg border border-border bg-surface p-5 transition hover:border-gold-muted"
              >
                <h2 className="font-display text-h3">{service.title}</h2>
                <p className="text-small text-text-secondary mt-1">
                  {service.providerName}
                  {service.city ? ` · ${service.city}` : ''}
                  {service.distanceKm !== null ? ` · ${service.distanceKm} km` : ''}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {service.isMobile ? (
                    <span className="rounded-full bg-surface-raised px-3 py-1 text-caption">Mobil hizmet</span>
                  ) : null}
                  {service.ratingAverage !== null ? (
                    <span className="rounded-full border border-border px-3 py-1 text-caption tabular">
                      ★ {service.ratingAverage.toFixed(1)} ({service.ratingCount})
                    </span>
                  ) : null}
                  {service.priceMin !== null ? (
                    <span className="rounded-full border border-border px-3 py-1 text-caption tabular">
                      {service.priceMin}
                      {service.priceMax && service.priceMax !== service.priceMin
                        ? `–${service.priceMax}`
                        : ''}{' '}
                      {service.currency}
                      {service.priceUnit ? `/${service.priceUnit}` : ''}
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
