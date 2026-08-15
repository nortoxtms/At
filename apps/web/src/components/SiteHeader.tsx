import Link from 'next/link';

import { readSession } from '@/lib/session';

/**
 * The site header — §19.1's navigation.
 *
 * The web app had none: the landing page offered two buttons and every other
 * page was reachable only by typing its URL. §1.3 P6 makes the web the
 * acquisition channel, and an acquisition channel a visitor cannot navigate is
 * a single page with orphans behind it.
 *
 * Deliberately flat: every public section, and nothing that needs a session —
 * the signed-in screens hang off "Hesabım" rather than crowding the bar.
 *
 * "Ekipman" sits second because it is the half of the market that is not a
 * horse: fencing, feed, rugs, trailers, boots. Most of what actually changes
 * hands in a yard is an object, and burying it under a menu makes the site
 * look like it only sells animals.
 */
const SECTIONS = [
  { href: '/tr/atlar', label: 'Satılık atlar' },
  { href: '/tr/urunler', label: 'Ekipman' },
  { href: '/tr/hizmetler', label: 'Hizmetler' },
  { href: '/tr/uzmanlar', label: 'Uzmanlar' },
  { href: '/tr/isler', label: 'İşler' },
  { href: '/tr/fiyatlandirma', label: 'Fiyatlandırma' },
];

/**
 * Publishing lives in the app (§18.2), so the web app has no such route and
 * this link would be a dead end. The preview does have one — it runs §13.2 and
 * §14.4 in the browser without saving anything — so the entry appears only
 * there.
 */
const PREVIEW_SECTIONS =
  process.env.NEXT_PUBLIC_STATIC_PREVIEW === '1'
    ? [{ href: '/tr/ilan-ver', label: 'İlan ver' }]
    : [];

export async function SiteHeader() {
  // The static preview has no server and no session; asking for one there
  // would be asking a cookie jar that does not exist.
  const signedIn =
    process.env.NEXT_PUBLIC_STATIC_PREVIEW === '1' ? false : Boolean(await readSession());

  /*
   * Sticky and translucent. The header is the only navigation on the site, so
   * it should not scroll away — and `backdrop-blur` keeps it legible over the
   * ink hero without needing a second, opaque variant of it.
   */
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-surface/85 backdrop-blur-md supports-[backdrop-filter]:bg-surface/70">
      <nav
        aria-label="Ana menü"
        className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4"
      >
        <Link
          href="/"
          className="font-display text-h3 tracking-tight transition-opacity hover:opacity-70"
        >
          ONLY HORSES
        </Link>

        <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-small">
          {[...SECTIONS, ...PREVIEW_SECTIONS].map((section) => (
            <li key={section.href}>
              <Link
                href={section.href}
                className="text-text-secondary transition-colors hover:text-gold-soft"
              >
                {section.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-3 text-small">
          {signedIn ? (
            <Link
              href="/tr/hesap"
              className="rounded-full bg-gold-soft px-5 py-2 text-text-on-gold transition-transform hover:-translate-y-0.5"
            >
              Hesabım
            </Link>
          ) : (
            <>
              <Link href="/tr/giris" className="text-text-secondary hover:text-gold-soft">
                Giriş
              </Link>
              <Link
                href="/tr/kayit"
                className="rounded-full bg-gold-soft px-5 py-2 text-text-on-gold transition-transform hover:-translate-y-0.5"
              >
                Hesap oluştur
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
