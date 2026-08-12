import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

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
    <html lang="tr">
      {/*
        §20.2: Fraunces for display, Inter for body. Loaded here rather than
        via next/font so the same families can be referenced from the CSS
        custom properties in globals.css.
      */}
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
