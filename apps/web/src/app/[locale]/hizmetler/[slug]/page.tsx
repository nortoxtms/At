import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getService, type ServiceDetail } from '@/lib/api';

/**
 * Service detail — spec §19.1 `/[locale]/hizmetler/[slug]`, §18.2 S16.
 *
 * `LocalBusiness` structured data (§19.2) fits a service provider better than
 * `Product`: what is being offered is a person's availability in an area, not
 * an item with a price and stock.
 */
export const revalidate = 300;

interface PageProps {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const service = await getService(slug);

  if (!service) return { title: 'Hizmet bulunamadı' };

  return {
    title: `${service.title} · ${service.city ?? service.country_code}`,
    description: service.description.slice(0, 155),
    alternates: {
      canonical: `/${locale}/hizmetler/${service.slug}`,
      languages: {
        tr: `/tr/hizmetler/${service.slug}`,
        en: `/en/hizmetler/${service.slug}`,
        'x-default': `/tr/hizmetler/${service.slug}`,
      },
    },
  };
}

export default async function ServicePage({ params }: PageProps) {
  const { slug } = await params;
  const service = await getService(slug);

  if (!service) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildLocalBusinessJsonLd(service)) }}
      />

      <header className="border-b border-border pb-6">
        <p className="text-caption text-text-secondary uppercase tracking-wide">
          {service.category_name_tr}
        </p>
        <h1 className="font-display text-h1 mt-1">{service.title}</h1>
        <p className="text-small text-text-secondary mt-2">
          {service.organization_name ?? service.provider_name}
          {service.city ? ` · ${service.city}` : ''}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {service.is_mobile ? (
            <span className="rounded-full bg-surface-raised px-3 py-1 text-caption">Mobil hizmet</span>
          ) : null}
          {service.service_radius_km ? (
            <span className="rounded-full border border-border px-3 py-1 text-caption tabular">
              {service.service_radius_km} km hizmet yarıçapı
            </span>
          ) : null}
          {service.rating_average ? (
            <span className="rounded-full border border-border px-3 py-1 text-caption tabular">
              ★ {Number(service.rating_average).toFixed(1)} ({service.rating_count})
            </span>
          ) : null}
        </div>
      </header>

      <section className="prose-tight mt-8">
        <p className="whitespace-pre-line">{service.description}</p>

        {service.price_min ? (
          <p className="mt-6 tabular">
            <strong>Fiyat aralığı:</strong> {service.price_min}
            {service.price_max && service.price_max !== service.price_min
              ? `–${service.price_max}`
              : ''}{' '}
            {service.currency}
            {service.price_unit ? `/${service.price_unit}` : ''}
          </p>
        ) : null}

        {service.availability_note ? (
          <p className="text-small text-text-secondary mt-2">{service.availability_note}</p>
        ) : null}
      </section>

      {/* §26: transport services carry a regulatory notice. It arrives from
          the API, so it is present here without this page knowing the rule. */}
      {service.notice ? (
        <aside className="mt-8 rounded-lg border border-gold-muted/50 bg-surface-raised/60 p-5 text-small">
          <p>{service.notice.tr}</p>
        </aside>
      ) : null}
    </main>
  );
}

/** §19.2: `LocalBusiness` on service providers. */
function buildLocalBusinessJsonLd(service: ServiceDetail): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: service.organization_name ?? service.provider_name,
    description: service.description,
    address: {
      '@type': 'PostalAddress',
      addressLocality: service.city ?? undefined,
      addressRegion: service.region ?? undefined,
      addressCountry: service.country_code,
    },
    aggregateRating:
      service.rating_average && Number(service.rating_count) > 0
        ? {
            '@type': 'AggregateRating',
            ratingValue: Number(service.rating_average),
            reviewCount: Number(service.rating_count),
          }
        : undefined,
    areaServed: service.service_radius_km
      ? { '@type': 'GeoCircle', geoRadius: service.service_radius_km * 1000 }
      : undefined,
  };
}
