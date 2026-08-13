import type { Metadata } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import type { ReactNode } from 'react';

import './globals.css';
import { PreviewBanner } from '@/components/PreviewBanner';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';

/**
 * §20.2's two faces, self-hosted.
 *
 * These were loaded from fonts.googleapis.com with a `<link rel="stylesheet">`,
 * which put a third-party render-blocking request on the critical path of
 * every page: DNS, TLS and a round trip to another origin before any text can
 * paint. Measuring §24.18 made that concrete — the font stylesheet was the
 * single slowest resource on the listing page by two orders of magnitude,
 * while the document itself answered in 41 ms.
 *
 * `next/font` downloads the files at build time and serves them from this
 * origin, with the @font-face rules inlined. No external request remains.
 * That also settles a question §24.26 would have had to answer eventually:
 * hotlinking Google Fonts transmits the visitor's IP to a third country, which
 * is a transfer a privacy policy has to disclose. Now there is nothing to
 * disclose.
 */
const fraunces = Fraunces({
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '600'],
  variable: '--font-display',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
});

/**
 * §19.2 requires hreflang for tr/en/es/de with x-default, and §21 makes tr the
 * default locale. The locale-segmented routes land in M2 with the listing
 * pages; this root layout establishes the language and the metadata base.
 */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://onlyhorses.app'),
  title: {
    default: 'ONLY HORSES — Atların dünyası tek bir yerde',
    template: '%s · ONLY HORSES',
  },
  description:
    'Atının sağlık, nal, aşı ve sahiplik geçmişini tek dosyada tut. Satmak istediğinde ilanın hazır olsun.',
  openGraph: {
    type: 'website',
    locale: 'tr_TR',
    siteName: 'ONLY HORSES',
  },
  alternates: {
    languages: {
      tr: '/tr',
      en: '/en',
      'x-default': '/tr',
    },
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="font-sans antialiased flex min-h-screen flex-col">
        {/* Renders only in the GitHub Pages export (scripts/build-preview.sh). */}
        <PreviewBanner />
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
