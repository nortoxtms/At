import type { MetadataRoute } from 'next';

/** §19.2 — crawlers get the public surface and nothing behind a session. */
export default function robots(): MetadataRoute.Robots {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://onlyhorses.app';

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Nothing under these paths is public, and crawling them would only
      // produce login redirects.
      disallow: ['/api/', '/tr/ayarlar', '/tr/mesajlar', '/tr/ahirim'],
    },
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
