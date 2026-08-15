import type { Metadata } from 'next';
import Link from 'next/link';

import { DEMO_SERVICES } from '@/content/demo';

/**
 * The preview's services index — stands in for `[locale]/hizmetler` in the
 * static export only.
 *
 * The production page reads the query string (category, city, mobile-only,
 * radius) and asks the API. A static export has no query to read, so this
 * lists the demo providers with the same card.
 */
export const metadata: Metadata = {
  title: 'Hizmetler',
  description: 'Nalbant, veteriner, eğitmen, nakliye ve diğer at hizmetleri.',
};

export function generateStaticParams() {
  return [{ locale: 'tr' }, { locale: 'en' }];
}

export default async function PreviewServicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="font-display text-h1 md:text-display">Hizmetler</h1>
        <p className="text-small text-text-secondary mt-2">
          Bu önizlemede {DEMO_SERVICES.length} örnek hizmet ilanı var. Canlı sürümde kategori,
          şehir ve hizmet yarıçapına göre filtrelenir — mobil çalışan bir nalbant, pini uzakta
          olsa da yakınındadır.
        </p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-2">
        {DEMO_SERVICES.map((service) => (
          <li key={service.id}>
            <div className="block h-full rounded-lg border border-border bg-surface p-5">
              <h2 className="font-display text-h3">{service.title}</h2>
              <p className="text-small text-text-secondary mt-1">
                {service.providerName}
                {service.city ? ` · ${service.city}` : ''}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {service.isMobile ? (
                  <span className="rounded-full bg-surface-raised px-3 py-1 text-caption">Mobil hizmet</span>
                ) : null}
                {service.ratingAverage !== null ? (
                  <span className="rounded-full bg-surface-raised px-3 py-1 text-caption tabular">
                    ★ {service.ratingAverage} ({service.ratingCount})
                  </span>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-small text-text-secondary mt-8">
        Hizmet detayları ve iletişim canlı API gerektirir.{' '}
        <Link href={`/${locale}/fiyatlandirma`} className="hover:text-gold-soft underline">
          Planlara bak
        </Link>
      </p>
    </main>
  );
}
