import {
  PRODUCT_CONDITION_LABEL_TR,
  PRODUCT_PRICE_UNIT_LABEL_TR,
} from '@only-horses/shared-types';
import type { ProductSearchHit } from '@only-horses/shared-types';
import Link from 'next/link';

/**
 * A product in the grid.
 *
 * Brand, size and condition sit on the card rather than behind a click. For a
 * horse the photograph does the selling; for a saddle the three facts that
 * decide whether it is worth opening are "Wintec", "17.5 inç" and "sıfır
 * ayarında", and a grid of photos without them is a grid nobody can shop from.
 */
export function ProductCard({ hit }: { hit: ProductSearchHit }) {
  const price =
    hit.priceType === 'free'
      ? 'Ücretsiz'
      : hit.priceAmount === null
        ? 'Fiyat sorunuz'
        : `${new Intl.NumberFormat('tr-TR', {
            style: 'currency',
            currency: hit.priceCurrency,
            maximumFractionDigits: 0,
          }).format(hit.priceAmount)}${
            hit.priceUnit && hit.priceUnit !== 'item'
              ? ` / ${PRODUCT_PRICE_UNIT_LABEL_TR[hit.priceUnit] ?? hit.priceUnit}`
              : ''
          }`;

  const facts = [
    hit.brand,
    hit.sizeLabel,
    PRODUCT_CONDITION_LABEL_TR[hit.condition] ?? hit.condition,
  ].filter(Boolean);

  return (
    <Link
      href={`/tr/urunler/${hit.slug}`}
      className="block h-full overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-gold-muted"
    >
      <div className="aspect-[4/3] bg-surface-raised">
        {hit.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hit.coverImage}
            alt={hit.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : null}
      </div>

      <div className="p-5">
        <h2 className="font-display text-h3 line-clamp-2">{hit.title}</h2>
        <p className="text-small text-text-secondary mt-1">{facts.join(' · ')}</p>
        <p className="text-small text-text-secondary">
          {[hit.categoryName, hit.city].filter(Boolean).join(' · ')}
        </p>
        <p className="font-display text-h3 text-gold-soft mt-3">{price}</p>
      </div>
    </Link>
  );
}
