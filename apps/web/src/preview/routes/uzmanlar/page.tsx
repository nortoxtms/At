import type { Metadata } from 'next';
import Link from 'next/link';

/**
 * The preview's professionals page — stands in for `[locale]/uzmanlar` in the
 * static export only.
 *
 * Unlike listings and products, the demo dataset carries no professionals:
 * §3.2's directory is built from role profiles and credentials, and exporting
 * a set of them would mean exporting real people's professional claims. So the
 * preview says what the page is instead of showing invented practitioners —
 * a fake vet in a directory is worse than an empty one.
 */
export const metadata: Metadata = {
  title: 'Uzmanlar',
  description:
    'Veteriner, nalbant, eğitmen, seyis, nakliyeci — atınla ilgilenen insanlar, bulunduğun ilde.',
};

export function generateStaticParams() {
  return [{ locale: 'tr' }, { locale: 'en' }];
}

export default function PreviewProfessionalsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-display text-h1 md:text-display">Uzmanlar</h1>
      <p className="text-body text-text-secondary mt-4">
        Veteriner, nalbant, eğitmen, seyis, nakliyeci. Bir at almak işin sadece
        başlangıcı — geri kalanını yapan insanlar burada.
      </p>

      <div className="mt-8 rounded-lg border border-border bg-surface p-6">
        <p className="text-small text-text-secondary">
          Bu önizlemede uzman listesi yok. Dizin, gerçek kişilerin meslek belgelerinden
          kurulur; uydurma bir veteriner göstermektense boş bırakmayı tercih ettik.
          Canlı sürümde arama ile, ile ve mesleğe göre çalışır.
        </p>
        <Link
          href="/tr/atlar"
          className="mt-4 inline-block rounded-md border border-border px-5 py-2 text-small hover:bg-surface-raised/60"
        >
          İlanlara bak
        </Link>
      </div>
    </main>
  );
}
