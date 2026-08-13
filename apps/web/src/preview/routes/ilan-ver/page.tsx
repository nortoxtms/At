import type { Metadata } from 'next';

import { DemoListingComposer } from '@/preview/DemoListingComposer';

/**
 * "İlan ver" in the preview — §18.2 S10's publish flow, running the real rules.
 *
 * Publishing itself needs an account, an identity check and a database. The
 * decisions do not: §14.4's welfare policy and §13.2's quality score are pure
 * functions, so the preview runs the same code the API runs and shows the same
 * verdict. What it cannot do is save.
 */
export const metadata: Metadata = {
  title: 'İlan ver',
  description:
    'Bir atı satışa çıkarırken ilanın hangi kurallardan geçtiğini ve kalite puanının nasıl hesaplandığını gör.',
};

export function generateStaticParams() {
  return [{ locale: 'tr' }, { locale: 'en' }];
}

export default function PreviewComposePage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="font-display text-h1 md:text-display">İlan ver</h1>
        <p className="text-small text-text-secondary mt-2 max-w-2xl">
          Alanları değiştir; sağdaki karar canlı olarak yeniden hesaplanır. Kalite puanı,
          refah politikası kontrolleri ve &ldquo;doğrudan yayınlanır mı, incelemeye mi
          düşer&rdquo; eşiği, API&apos;nin kullandığı kodun aynısıdır.
        </p>
        <p className="text-small text-text-muted mt-2 max-w-2xl">
          Denemek için: başlığa &ldquo;kesimlik&rdquo; yaz, ya da kimlik doğrulamasını kapat.
        </p>
      </header>

      <DemoListingComposer />
    </main>
  );
}
