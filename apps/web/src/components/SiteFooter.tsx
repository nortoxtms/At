import Link from 'next/link';

import { LEGAL_SLUGS, legalDocument } from '@/content/legal';

/**
 * The site footer — §24.26's "linked from signup and settings", plus the
 * ordinary obligation that policy pages be reachable from every page rather
 * than only from the sitemap.
 *
 * Also carries the sentence §14.5 and §16 both depend on being visible: the
 * platform takes no commission and does not handle payment. A marketplace
 * that stays quiet about that is one buyers assume holds their money.
 */
export function SiteFooter() {
  const documents = LEGAL_SLUGS.map((slug) => legalDocument('tr', slug)).filter(
    (document): document is NonNullable<typeof document> => document !== null,
  );

  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-5xl px-6 py-10 text-small">
        <div className="flex flex-wrap gap-x-10 gap-y-8">
          <div className="min-w-[14rem] flex-1">
            <p className="font-display text-h3">ONLY HORSES</p>
            <p className="text-text-secondary mt-2 max-w-sm">
              Atın kimliği kalıcıdır, ilan geçicidir. Kayıt önce gelir; ilan ondan türer.
            </p>
          </div>

          <nav aria-label="Bölümler" className="min-w-[10rem]">
            <p className="text-label text-text-secondary uppercase">Bölümler</p>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href="/tr/atlar" className="hover:text-gold-soft">
                  Satılık atlar
                </Link>
              </li>
              <li>
                <Link href="/tr/hizmetler" className="hover:text-gold-soft">
                  Hizmetler
                </Link>
              </li>
              <li>
                <Link href="/tr/isler" className="hover:text-gold-soft">
                  İşler
                </Link>
              </li>
              <li>
                <Link href="/tr/fiyatlandirma" className="hover:text-gold-soft">
                  Fiyatlandırma
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label="Yasal" className="min-w-[12rem]">
            <p className="text-label text-text-secondary uppercase">Yasal</p>
            <ul className="mt-3 space-y-2">
              {documents.map((document) => (
                <li key={document.path}>
                  <Link href={`/tr/${document.path}`} className="hover:text-gold-soft">
                    {document.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <p className="text-text-secondary mt-10 border-t border-border pt-6">
          ONLY HORSES at satışından komisyon almaz ve ödemeye aracılık etmez. Alım satım
          taraflar arasındadır.
        </p>
      </div>
    </footer>
  );
}
