import Link from 'next/link';

/**
 * The site header — §19.1's navigation.
 *
 * The web app had none: the landing page offered two buttons and every other
 * page was reachable only by typing its URL. §1.3 P6 makes the web the
 * acquisition channel, and an acquisition channel a visitor cannot navigate is
 * a single page with orphans behind it.
 *
 * Deliberately flat. §19.1 names four public sections and the policy pages;
 * anything requiring a session lives in the app (§18.2), so there is no
 * account menu here to imply otherwise.
 */
const SECTIONS = [
  { href: '/tr/atlar', label: 'Satılık atlar' },
  { href: '/tr/hizmetler', label: 'Hizmetler' },
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

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-paper">
      <nav
        aria-label="Ana menü"
        className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4"
      >
        <Link href="/" className="font-display text-h3 tracking-tight">
          ONLY HORSES
        </Link>

        <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-small">
          {[...SECTIONS, ...PREVIEW_SECTIONS].map((section) => (
            <li key={section.href}>
              <Link href={section.href} className="text-text-secondary hover:text-brass-text">
                {section.label}
              </Link>
            </li>
          ))}
        </ul>

        <Link
          href="/tr/atlar"
          className="ml-auto rounded-md bg-ink px-4 py-2 text-small text-text-inverse"
        >
          Atlara bak
        </Link>
      </nav>
    </header>
  );
}
