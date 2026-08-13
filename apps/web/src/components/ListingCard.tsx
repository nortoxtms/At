import Link from 'next/link';

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
/**
 * Two colours out of a blurhash, without decoding it.
 *
 * A real decode needs the algorithm and a canvas; this reads the base-83
 * average-colour bytes that sit at the front of every blurhash and derives a
 * second, darker stop from them. It is not the photograph — it is the light
 * the photograph was taken in, which is exactly what a placeholder should
 * carry and all it can honestly claim to.
 */
function blurhashWash(hash: string): string {
  const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';
  let value = 0;
  for (const character of hash.slice(2, 6)) {
    const index = DIGITS.indexOf(character);
    if (index < 0) return 'linear-gradient(135deg, rgb(var(--sand-rgb)), rgb(var(--surface-rgb)))';
    value = value * 83 + index;
  }

  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const dim = (channel: number) => Math.round(channel * 0.62);

  return `linear-gradient(140deg, rgb(${r} ${g} ${b}), rgb(${dim(r)} ${dim(g)} ${dim(b)}))`;
}

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

  // §20.6's crop is empty until licensed photography exists. Rather than a
  // grey rectangle, the blurhash the indexer already stores is rendered as a
  // two-stop wash keyed to the listing — so a grid of cards reads as a grid of
  // different horses, which is what it will be.
  const wash = hit.coverBlurhash
    ? blurhashWash(hit.coverBlurhash)
    : 'linear-gradient(135deg, rgb(var(--sand-rgb)), rgb(var(--surface-rgb)))';

  return (
    <article className="group h-full overflow-hidden rounded-xl border border-border bg-paper shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-brass/40 hover:shadow-sheet">
      {/*
        next/link, not a bare anchor. A hard-coded absolute href skips Next's
        basePath, so every card on the GitHub Pages build pointed one directory
        above the site and 404'd.
      */}
      <Link href={`/tr/atlar/${hit.slug}`} className="block">
        {/* §20.6 card crop is 3:2. */}
        <div className="relative aspect-card w-full overflow-hidden" aria-hidden="true">
          <div
            className="absolute inset-0 transition-transform duration-500 group-hover:scale-105"
            style={{ background: wash }}
          />
          {hit.isBoosted ? (
            <span className="absolute left-3 top-3 rounded-full bg-ink/85 px-2.5 py-1 text-caption text-cream">
              Öne çıkarılan
            </span>
          ) : null}

          {/*
            The price sits on its own ink chip rather than on a gradient over
            the wash. The wash is derived from the photograph, so its brightness
            is whatever the light was that day — cream text over it is legible
            for a dusk shot and invisible for a snow one. A scrim would make
            that *usually* fine; a solid ground makes it always fine, and the
            contrast audit can see it.
          */}
          <p className="font-display absolute bottom-3 left-3 rounded-lg bg-ink/85 px-3 py-1.5 text-h3 tabular text-cream">
            {price}
          </p>
        </div>

        <div className="p-4">
          <p className="text-label uppercase tracking-wider text-text-muted">
            {LISTING_TYPE_LABEL_TR[hit.listingType] ?? hit.listingType}
          </p>

          <h2 className="font-display text-h3 mt-1 line-clamp-2 transition-colors group-hover:text-brass-text">
            {hit.title}
          </h2>
          <p className="text-small text-text-secondary mt-1">{facts}</p>

          <p className="text-caption text-text-muted mt-2">
            {[hit.city, hit.distanceKm === null ? null : `${hit.distanceKm} km`]
              .filter(Boolean)
              .join(' · ')}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {hit.sellerVerification !== 'none' && hit.sellerVerification !== 'email_verified' ? (
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-caption text-text-success">
                Doğrulanmış satıcı
              </span>
            ) : null}
            {hit.hasVideo ? (
              <span className="rounded-full border border-border px-2 py-0.5 text-caption">
                📹 Video
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </article>
  );
}
