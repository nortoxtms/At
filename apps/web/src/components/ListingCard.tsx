import type { ListingSearchHit } from '@only-horses/shared-types';

import { LISTING_TYPE_LABEL_TR, SEX_LABEL_TR } from '@/lib/api';

/**
 * Result card — spec §18.2 S06.
 *
 * "image carousel dot indicator, ♥ save, price top-right, title,
 *  Irk · Yaş · Boy · Cinsiyet, city + distance, trust chip, 📹 if video,
 *  'Öne çıkarılan' label if boosted."
 *
 * The boosted label is not decoration: §11.2 requires boosted results to be
 * labelled, and an unlabelled paid placement is an advert disguised as a
 * result.
 */
export function ListingCard({ hit }: { hit: ListingSearchHit }) {
  const facts = [
    hit.breed,
    hit.ageYears === null ? null : `${hit.ageYears} yaş`,
    hit.heightCm === null ? null : `${Math.round(hit.heightCm)} cm`,
    SEX_LABEL_TR[hit.sex] ?? hit.sex,
  ]
    .filter(Boolean)
    .join(' · ');

  const price =
    hit.priceType === 'on_request' || hit.priceAmount === null
      ? 'Fiyat sorunuz'
      : new Intl.NumberFormat('tr-TR', {
          style: 'currency',
          currency: hit.priceCurrency,
          maximumFractionDigits: 0,
        }).format(hit.priceAmount);

  return (
    <article className="overflow-hidden rounded-lg border border-border bg-paper shadow-card transition-shadow hover:shadow-sheet">
      <a href={`/tr/atlar/${hit.slug}`} className="block">
        {/* §20.6 card crop is 3:2. The blurhash stands in until real
            photography is wired through Cloudflare Images. */}
        <div className="aspect-card w-full bg-sand" aria-hidden="true" />

        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-label uppercase text-text-muted">
              {LISTING_TYPE_LABEL_TR[hit.listingType] ?? hit.listingType}
            </p>
            <p className="font-display text-h3 tabular whitespace-nowrap">{price}</p>
          </div>

          <h2 className="font-display text-h3 mt-1 line-clamp-2">{hit.title}</h2>
          <p className="text-small text-text-secondary mt-1">{facts}</p>

          <p className="text-caption text-text-muted mt-2">
            {[hit.city, hit.distanceKm === null ? null : `${hit.distanceKm} km`]
              .filter(Boolean)
              .join(' · ')}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {hit.sellerVerification !== 'none' && hit.sellerVerification !== 'email_verified' ? (
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-caption text-success">
                Doğrulanmış satıcı
              </span>
            ) : null}
            {hit.hasVideo ? (
              <span className="rounded-full border border-border px-2 py-0.5 text-caption">
                📹 Video
              </span>
            ) : null}
            {hit.isBoosted ? (
              <span className="rounded-full bg-brass/15 px-2 py-0.5 text-caption text-leather">
                Öne çıkarılan
              </span>
            ) : null}
          </div>
        </div>
      </a>
    </article>
  );
}
