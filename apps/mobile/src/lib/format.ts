import { SEX_LABEL_TR } from '@only-horses/shared-types';
import type { ListingSearchHit } from '@only-horses/shared-types';

/**
 * §20.6: prices are set in Cormorant Garamond, never abbreviated, and a
 * listing without one says "Fiyat sorunuz" rather than showing a zero.
 */
export function formatPrice(
  amount: number | string | null,
  currency = 'TRY',
  priceType?: string,
): string {
  if (priceType === 'free') return 'Ücretsiz';
  if (amount === null || amount === '') return 'Fiyat sorunuz';

  const value = Number(amount);
  if (!Number.isFinite(value)) return 'Fiyat sorunuz';

  const formatted = new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);

  return priceType === 'negotiable' ? `${formatted} · pazarlıklı` : formatted;
}

/** The card's second line: sex · age · height · breed. */
export function describeHorse(hit: ListingSearchHit): string {
  return [
    SEX_LABEL_TR[hit.sex] ?? hit.sex,
    hit.ageYears !== null ? `${hit.ageYears} yaş` : null,
    hit.heightCm !== null ? `${Math.round(hit.heightCm)} cm` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * A stand-in colour for a photograph that has not loaded.
 *
 * The listings carry a blurhash but not the decoder, and a grey rectangle on a
 * near-black ground reads as a broken image. Deriving a warm tone from the
 * hash at least makes each card distinct and keeps the grid from flashing.
 */
export function washFromBlurhash(hash: string | null | undefined): string {
  if (!hash) return '#221D17';

  let sum = 0;
  for (let index = 0; index < hash.length; index += 1) sum = (sum * 31 + hash.charCodeAt(index)) % 360;

  return `hsl(${sum} 18% 14%)`;
}

/** §22: relative time, in the reading a Turkish speaker expects. */
export function relativeTime(iso: string | null): string {
  if (!iso) return '';

  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';

  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return 'az önce';
  if (minutes < 60) return `${minutes} dk önce`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days} gün önce`;

  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' }).format(then);
}
