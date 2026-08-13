import type { MetadataRoute } from 'next';

import { searchJobs, searchListings, searchServices } from '@/lib/api';
import { LEGAL_SLUGS, legalDocument } from '@/content/legal';

/**
 * Sitemap — spec §19.2.
 *
 * "next-sitemap producing segmented sitemaps: listings, services, jobs,
 * profiles, organizations, guides. Max 45k URLs per file."
 *
 * Generated from the live index rather than the database so a listing appears
 * in the sitemap exactly when it becomes findable — a sitemap that promises
 * URLs the search index does not serve trains crawlers to distrust it.
 */
export const revalidate = 3600;

const MAX_URLS_PER_FILE = 45_000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://onlyhorses.app';

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${appUrl}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${appUrl}/tr/atlar`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${appUrl}/tr/hizmetler`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${appUrl}/tr/isler`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${appUrl}/tr/fiyatlandirma`, changeFrequency: 'monthly', priority: 0.5 },
    // §24.26: every policy page, in both languages, each pointing at the other.
    ...LEGAL_SLUGS.flatMap((slug) =>
      (['tr', 'en'] as const)
        .map((locale) => ({ locale, document: legalDocument(locale, slug) }))
        .filter((entry) => entry.document !== null)
        .map((entry) => ({
          url: `${appUrl}/${entry.locale}/${entry.document!.path}`,
          changeFrequency: 'yearly' as const,
          priority: 0.3,
          alternates: {
            languages: {
              tr: `${appUrl}/tr/${entry.document!.path}`,
              en: `${appUrl}/en/${entry.document!.path}`,
            },
          },
        })),
    ),
  ];

  const [{ hits }, services, jobs] = await Promise.all([
    searchListings({ limit: 50, sort: 'newest' }),
    searchServices({ limit: 50, sort: 'newest' }),
    searchJobs({ limit: 50, sort: 'newest' }),
  ]);

  // §19.2's segments. Each is capped independently, because a single 45k
  // ceiling shared across segments would let listings crowd jobs out entirely.
  const serviceRoutes: MetadataRoute.Sitemap = services.hits
    .slice(0, MAX_URLS_PER_FILE)
    .map((service) => ({
      url: `${appUrl}/tr/hizmetler/${service.slug}`,
      lastModified: service.publishedAt ? new Date(service.publishedAt) : undefined,
      changeFrequency: 'weekly',
      priority: 0.6,
    }));

  const jobRoutes: MetadataRoute.Sitemap = jobs.hits.slice(0, MAX_URLS_PER_FILE).map((job) => ({
    url: `${appUrl}/tr/isler/${job.slug}`,
    lastModified: job.publishedAt ? new Date(job.publishedAt) : undefined,
    // Job postings churn faster than anything else on the site: they are
    // filled, and Google Jobs penalises stale ones.
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  const listingRoutes: MetadataRoute.Sitemap = hits.slice(0, MAX_URLS_PER_FILE).map((hit) => ({
    url: `${appUrl}/tr/atlar/${hit.slug}`,
    lastModified: hit.publishedAt ? new Date(hit.publishedAt) : undefined,
    changeFrequency: 'daily',
    priority: 0.8,
    alternates: {
      languages: {
        tr: `${appUrl}/tr/atlar/${hit.slug}`,
        en: `${appUrl}/en/atlar/${hit.slug}`,
      },
    },
  }));

  return [...staticRoutes, ...listingRoutes, ...serviceRoutes, ...jobRoutes];
}
