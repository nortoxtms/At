import type { Metadata } from 'next';

import { DemoListingBrowser } from '@/preview/DemoListingBrowser';

/**
 * The preview's browse page — stands in for `[locale]/atlar` in the static
 * export only (scripts/build-preview.sh swaps it in).
 *
 * The production page reads the query string and calls the search API. A
 * static export can do neither, so this renders the demo dataset and filters
 * it client-side. Everything below the filters — the cards, the type labels,
 * the trust chips — is the same component the real page uses.
 */
export const metadata: Metadata = {
  title: 'Satılık atlar',
  description:
    'Doğrulanmış satıcılardan satılık ve kiralık atlar. Sağlık geçmişi, soy bilgisi ve gerçek videolarla.',
};

export function generateStaticParams() {
  return [{ locale: 'tr' }, { locale: 'en' }];
}

export default function PreviewListingsPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="font-display text-h1 md:text-display">Satılık atlar</h1>
        <p className="text-small text-text-secondary mt-2">
          Bu önizlemede on iki örnek ilan var ve filtreler tarayıcıda çalışır. Canlı sürümde
          arama, elli binden fazla ilanı sunucuda tarar.
        </p>
      </header>

      <DemoListingBrowser />
    </main>
  );
}
