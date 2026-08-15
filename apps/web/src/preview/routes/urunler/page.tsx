import type { Metadata } from 'next';

import { DemoProductBrowser } from '@/preview/DemoProductBrowser';

/**
 * The preview's equipment marketplace — stands in for `[locale]/urunler` in
 * the static export only (scripts/build-preview.sh swaps it in).
 *
 * The production page reads the query string and calls the search API. A
 * static export can do neither, so this filters the exported catalogue in the
 * browser. The cards below the filters are the same component the real page
 * uses, against the same types.
 */
export const metadata: Metadata = {
  title: 'Ekipman ve malzeme',
  description:
    'Eyer, başlık, kask, çul, yem, altlık, çit, boks, engel, römork — atla ilgili her şey, sahibinden.',
};

export function generateStaticParams() {
  return [{ locale: 'tr' }, { locale: 'en' }];
}

export default function PreviewProductsPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="font-display text-h1 md:text-display">Ekipman ve malzeme</h1>
        <p className="text-small text-text-secondary mt-2 max-w-2xl">
          Sadece at değil: eyerden çite, yemden kaska, atla ilgili her şey. Bu
          önizlemede yirmi üç örnek ürün var ve filtreler tarayıcıda çalışır.
        </p>
      </header>

      <DemoProductBrowser />
    </main>
  );
}
