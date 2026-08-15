import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { HorseTimeline, type TimelineEntry as UiTimelineEntry } from '@/components/HorseTimeline';
import { SafetyCard } from '@/components/SafetyCard';
import {
  ageYears,
  formatHeight,
  formatPrice,
  getListing,
  getTimeline,
  LISTING_TYPE_LABEL_TR,
  SEX_LABEL_TR,
  type ListingDetail,
} from '@/lib/api';

/**
 * Listing detail — spec §19.1 `/[locale]/atlar/[slug]`, §18.2 S08.
 *
 * Server-rendered and indexable (§19.2). This is the page §1.3 P6 calls the
 * acquisition channel, so everything a buyer or a crawler needs is in the
 * initial HTML: no client fetch, no hydration gate.
 */

// §19.2: ISR at 300 s, with on-demand revalidation on publish/edit/close.
export const revalidate = 300;

interface PageProps {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const listing = await getListing(slug);

  if (!listing) return { title: 'İlan bulunamadı' };

  const age = ageYears(listing.date_of_birth);
  const breed = listing.breed_name_tr ?? listing.breed_name_en;
  const descriptor = [
    breed,
    age === null ? null : `${age} yaşında`,
    SEX_LABEL_TR[listing.sex],
    formatHeight(listing.height_cm),
    listing.city,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    title: listing.title,
    description: listing.summary ?? descriptor,
    alternates: {
      canonical: `/${locale}/atlar/${listing.slug}`,
      // §19.2 hreflang for tr/en/es/de with x-default.
      languages: {
        tr: `/tr/atlar/${listing.slug}`,
        en: `/en/atlar/${listing.slug}`,
        'x-default': `/tr/atlar/${listing.slug}`,
      },
    },
    openGraph: {
      title: listing.title,
      description: listing.summary ?? descriptor,
      type: 'website',
      url: `/${locale}/atlar/${listing.slug}`,
    },
    // §19.2: closed listings stop being indexed rather than lingering as
    // results a buyer cannot act on.
    robots: listing.status === 'active' ? undefined : { index: false, follow: true },
  };
}

export default async function ListingPage({ params }: PageProps) {
  const { slug } = await params;
  const listing = await getListing(slug);

  if (!listing) notFound();

  const timeline = (await getTimeline(listing.horse_slug)) ?? [];
  const age = ageYears(listing.date_of_birth);
  const breed = listing.breed_name_tr ?? listing.breed_name_en;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      {/* §19.2: Product + Offer JSON-LD. */}
      <script
        type="application/ld+json"
        // Serialized server-side; the payload is our own data, not user HTML.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildProductJsonLd(listing)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildBreadcrumbJsonLd(listing)) }}
      />

      <nav aria-label="Breadcrumb" className="text-small text-text-secondary mb-6">
        <Link href="/tr/atlar" className="hover:text-text-primary">
          Atlar
        </Link>
        {breed ? (
          <>
            <span className="mx-2">/</span>
            <a href={`/tr/atlar/${listing.breed_id}`} className="hover:text-text-primary">{breed}</a>
          </>
        ) : null}
      </nav>

      <header>
        <p className="text-label uppercase text-text-secondary">
          {LISTING_TYPE_LABEL_TR[listing.type] ?? listing.type}
        </p>

        <h1 className="font-display text-h1 md:text-display mt-2">{listing.title}</h1>

        <p className="font-display text-h2 mt-4 tabular">
          {formatPrice(listing.price_amount, listing.price_currency, listing.price_type)}
        </p>

        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-small text-text-secondary">
          {breed ? <Fact label="Irk" value={breed} /> : null}
          {age !== null ? <Fact label="Yaş" value={`${age}`} /> : null}
          <Fact label="Cinsiyet" value={SEX_LABEL_TR[listing.sex] ?? listing.sex} />
          {listing.height_cm ? <Fact label="Boy" value={formatHeight(listing.height_cm)!} /> : null}
          {listing.color ? <Fact label="Renk" value={listing.color} /> : null}
          {listing.city ? <Fact label="Konum" value={listing.city} /> : null}
        </dl>
      </header>

      {/* §14.3: a safety card on every sale listing, before the seller card. */}
      <div className="mt-8">
        <SafetyCard />
      </div>

      <section className="mt-8 rounded-lg border border-border bg-surface p-6 ">
        <p className="text-label uppercase text-text-secondary">Satıcı</p>
        <p className="font-display text-h3 mt-1">{listing.seller_name}</p>
        <p className="text-small text-text-secondary mt-1">
          {/* §13.3: the components, never a bare score. */}
          {[
            listing.seller_verification === 'identity_verified' ? 'Kimlik doğrulandı' : null,
            listing.seller_verification === 'business_verified' ? 'İşletme doğrulandı' : null,
            listing.seller_response_rate
              ? `%${Math.round(Number(listing.seller_response_rate) * 100)} yanıt oranı`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {/*
          There is no /tr/profil route — §19.1 lists no public profile page, and
          the seller's own screens are in the app (§18.2). This linked to a 404;
          naming the handle is what the page can honestly offer.
        */}
        <p className="text-small text-text-secondary mt-3">@{listing.seller_handle}</p>
      </section>

      {listing.description ? (
        <section className="mt-8">
          <h2 className="font-display text-h2 mb-3">Hakkında</h2>
          <p className="whitespace-pre-line text-body text-text-secondary">{listing.description}</p>
        </section>
      ) : null}

      {listing.disciplines.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-h2 mb-3">Eğitim</h2>
          <ul className="flex flex-wrap gap-2">
            {listing.disciplines.map((discipline) => (
              <li key={discipline} className="rounded-full border border-border px-3 py-1 text-small">
                {discipline}
              </li>
            ))}
          </ul>
          {listing.training_level ? (
            <p className="text-small text-text-secondary mt-3">
              Seviye: {listing.training_level}
              {listing.rider_level_min ? ` · Uygun binici: ${listing.rider_level_min}` : ''}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* §18.2 S08 step 7 — "This is the differentiator; give it visual weight." */}
      {timeline.length > 0 ? (
        <section className="mt-12 border-t border-border pt-10">
          <h2 className="font-display text-h1 mb-2">Bu atın geçmişi</h2>
          <p className="text-small text-text-secondary mb-8 max-w-lg">
            Kayıt, sağlık, yarışma ve sahiplik geçmişi — platformda tutulduğu haliyle.
          </p>
          <div className="max-w-xl">
            <HorseTimeline entries={timeline.map(toUiEntry)} />
          </div>
        </section>
      ) : null}

      <footer className="mt-12 border-t border-border pt-6">
        <p className="text-caption text-text-secondary">
          ONLY HORSES bir aracı platformdur, bu satışın tarafı değildir. Fiyat ve
          durum bilgisi satıcı beyanıdır.
        </p>
      </footer>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-label uppercase text-text-secondary">{label}</dt>
      <dd className="text-body text-text-primary tabular">{value}</dd>
    </div>
  );
}

function toUiEntry(entry: {
  kind: string;
  date: string;
  title: string;
  detail: string | null;
  referenceId: string | null;
}): UiTimelineEntry {
  return {
    id: entry.referenceId ?? `${entry.kind}-${entry.date}`,
    kind: entry.kind as UiTimelineEntry['kind'],
    date: entry.date,
    title: entry.title,
    detail: entry.detail ?? undefined,
  };
}

/**
 * §19.2: `Product` + `Offer`.
 *
 * A horse is not a retail product, but Product/Offer is the vocabulary search
 * engines actually render rich results from, and it is what the spec names.
 * `availability` reflects the real listing status so a sold horse is not
 * advertised as in stock.
 */
function buildProductJsonLd(listing: ListingDetail) {
  const age = ageYears(listing.date_of_birth);
  const breed = listing.breed_name_en ?? listing.breed_name_tr;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://onlyhorses.app';

  const availability =
    listing.status === 'active'
      ? 'https://schema.org/InStock'
      : listing.status === 'under_offer'
        ? 'https://schema.org/LimitedAvailability'
        : 'https://schema.org/SoldOut';

  const additionalProperty = [
    breed ? { '@type': 'PropertyValue', name: 'Breed', value: breed } : null,
    age === null ? null : { '@type': 'PropertyValue', name: 'Age', value: `${age} years` },
    { '@type': 'PropertyValue', name: 'Sex', value: listing.sex },
    listing.height_cm
      ? {
          '@type': 'PropertyValue',
          name: 'Height',
          value: `${Math.round(Number(listing.height_cm))} cm`,
        }
      : null,
    listing.color ? { '@type': 'PropertyValue', name: 'Colour', value: listing.color } : null,
  ].filter(Boolean);

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: listing.title,
    description: listing.summary ?? listing.description ?? listing.title,
    category: 'Horses',
    url: `${appUrl}/tr/atlar/${listing.slug}`,
    additionalProperty,
    // A price of null with priceType on_request would produce an invalid
    // Offer, so the offer is omitted entirely rather than shipped broken.
    ...(listing.price_amount === null || listing.price_type === 'on_request'
      ? {}
      : {
          offers: {
            '@type': 'Offer',
            price: Number(listing.price_amount),
            priceCurrency: listing.price_currency,
            availability,
            url: `${appUrl}/tr/atlar/${listing.slug}`,
            seller: { '@type': 'Person', name: listing.seller_name },
            ...(listing.published_at
              ? { validFrom: new Date(listing.published_at).toISOString() }
              : {}),
          },
        }),
  };
}

/** §19.2: BreadcrumbList everywhere. */
function buildBreadcrumbJsonLd(listing: ListingDetail) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://onlyhorses.app';
  const breed = listing.breed_name_en ?? listing.breed_name_tr;

  const items = [
    { name: 'Atlar', url: `${appUrl}/tr/atlar` },
    breed ? { name: breed, url: `${appUrl}/tr/atlar/${listing.breed_id}` } : null,
    { name: listing.title, url: `${appUrl}/tr/atlar/${listing.slug}` },
  ].filter(Boolean) as { name: string; url: string }[];

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
