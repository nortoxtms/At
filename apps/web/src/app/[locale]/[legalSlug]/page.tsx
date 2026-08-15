import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { LEGAL_SLUGS, legalDocument } from '@/content/legal';

/**
 * Legal and policy pages — spec §19.1, §24.26, §26.
 *
 * One route for all of them, matched against a fixed slug list. A catch-all
 * segment at this level would otherwise swallow `/tr/atlar`, so
 * `generateStaticParams` enumerates exactly the legal slugs and anything else
 * falls through to `notFound` — the same reason SearchModule is registered
 * before ListingsModule in the API.
 */
export const revalidate = 86_400;
export const dynamicParams = false;

interface PageProps {
  params: Promise<{ locale: string; legalSlug: string }>;
}

export function generateStaticParams() {
  return ['tr', 'en'].flatMap((locale) =>
    LEGAL_SLUGS.map((legalSlug) => ({ locale, legalSlug })),
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, legalSlug } = await params;
  const document = legalDocument(locale, legalSlug);

  if (!document) return { title: 'Bulunamadı' };

  return {
    title: document.title,
    description: document.summary,
    alternates: {
      canonical: `/${locale}/${document.path}`,
      // §19.2: both languages of a policy are the same document.
      languages: {
        tr: `/tr/${document.path}`,
        en: `/en/${document.path}`,
        'x-default': `/tr/${document.path}`,
      },
    },
  };
}

export default async function LegalPage({ params }: PageProps) {
  const { locale, legalSlug } = await params;
  const document = legalDocument(locale, legalSlug);

  if (!document) notFound();

  const other = locale === 'tr' ? 'en' : 'tr';

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <nav className="text-small text-text-secondary mb-8 flex items-center justify-between">
        <Link href={`/${locale}`} className="hover:text-gold-soft">
          ONLY HORSES
        </Link>
        {/* §24.26 requires both languages, so every page carries the way to the other one. */}
        <Link href={`/${other}/${document.path}`} className="hover:text-gold-soft" hrefLang={other}>
          {other === 'en' ? 'English' : 'Türkçe'}
        </Link>
      </nav>

      <header className="border-b border-border pb-6">
        <h1 className="font-display text-h1">{document.title}</h1>
        <p className="text-small text-text-secondary mt-3">{document.summary}</p>
        <p className="text-caption text-text-secondary mt-2 tabular">
          {locale === 'en' ? 'Last updated' : 'Son güncelleme'}: {document.updatedAt}
        </p>
      </header>

      <article className="mt-8 space-y-8">
        {document.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="font-display text-h3">{section.heading}</h2>
            <div className="mt-3 space-y-3">
              {section.body.map((paragraph) => (
                <p key={paragraph.slice(0, 40)} className="text-body">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </article>

      <footer className="border-border mt-12 border-t pt-6">
        <ul className="text-small text-text-secondary flex flex-wrap gap-x-6 gap-y-2">
          {LEGAL_SLUGS.filter((slug) => slug !== legalSlug).map((slug) => {
            const link = legalDocument(locale, slug);
            return link ? (
              <li key={slug}>
                <Link href={`/${locale}/${link.path}`} className="hover:text-gold-soft">
                  {link.title}
                </Link>
              </li>
            ) : null;
          })}
        </ul>
      </footer>
    </main>
  );
}
