/**
 * Unit and price formatting — spec §9.4, §21.
 *
 * "Store height in cm always. Display in hh (hands) when
 * preferred_units = 'imperial'."
 */

const CM_PER_HAND = 10.16;

/** 165 cm -> "16.2 hh". §9.4 gives the formula explicitly. */
export function cmToHands(cm: number): string {
  const whole = Math.floor(cm / CM_PER_HAND);
  const inches = Math.round((cm / CM_PER_HAND - whole) * 10);
  // 15.10 hh is not a thing — 10 inches is a whole hand.
  if (inches >= 10) return `${whole + 1}.0 hh`;
  return `${whole}.${inches} hh`;
}

export function handsToCm(hands: number, inches = 0): number {
  return Math.round((hands + inches / 10) * CM_PER_HAND * 10) / 10;
}

export type UnitSystem = 'metric' | 'imperial';

export function formatHeight(cm: number | null, units: UnitSystem): string | null {
  if (cm === null) return null;
  return units === 'imperial' ? cmToHands(cm) : `${Math.round(cm)} cm`;
}

/**
 * §21: "display original + converted". The original currency leads because
 * that is what the seller actually asks; the converted figure is an aid, and
 * is marked as approximate so nobody reads it as a quoted price.
 */
export function formatPrice(
  amount: number | null,
  currency: string,
  locale: string,
  converted?: { amount: number; currency: string },
): string {
  if (amount === null) return locale.startsWith('tr') ? 'Fiyat sorunuz' : 'Price on request';

  const primary = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);

  if (!converted || converted.currency === currency) return primary;

  const secondary = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: converted.currency,
    maximumFractionDigits: 0,
  }).format(converted.amount);

  return `${primary} (≈ ${secondary})`;
}

/** Age in years from a date of birth, for cards and search facets. */
export function ageYears(dateOfBirth: string | null, now = new Date()): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  let age = now.getFullYear() - dob.getFullYear();
  const monthDelta = now.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}
