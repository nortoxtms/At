/**
 * Trust score presentation — spec §13.3.
 *
 * The number itself is computed in SQL (`compute_trust_score`) so it cannot
 * drift between the nightly job and the event-driven recompute. What lives
 * here is the part the clients need: the display band, and the rule that the
 * components are always shown alongside the number.
 *
 * P4: "trust_score is computed, never manually set; every component is
 * explainable to the user."
 */

export type TrustBand = 'new' | 'established' | 'trusted' | 'highly_trusted';

export interface TrustBandInfo {
  band: TrustBand;
  labelTr: string;
  labelEn: string;
  min: number;
  max: number;
}

export const TRUST_BANDS: TrustBandInfo[] = [
  { band: 'new', labelTr: 'Yeni', labelEn: 'New', min: 0, max: 29 },
  { band: 'established', labelTr: 'Yerleşik', labelEn: 'Established', min: 30, max: 59 },
  { band: 'trusted', labelTr: 'Güvenilir', labelEn: 'Trusted', min: 60, max: 79 },
  {
    band: 'highly_trusted',
    labelTr: 'Çok güvenilir',
    labelEn: 'Highly trusted',
    min: 80,
    max: 100,
  },
];

export function trustBand(score: number): TrustBandInfo {
  const clamped = Math.max(0, Math.min(100, score));
  return TRUST_BANDS.find((b) => clamped >= b.min && clamped <= b.max) ?? TRUST_BANDS[0];
}

export interface TrustComponents {
  emailVerified: boolean;
  phoneVerified: boolean;
  identityVerified: boolean;
  professionalVerified: boolean;
  accountAgeMonths: number;
  reviewCount: number;
  reviewAverage: number | null;
  responseRate: number | null;
  upheldActions: number;
}

/**
 * The human-readable chips shown next to the band — §13.3 requires the
 * components, never a bare number: "Kimlik doğrulandı · 14 değerlendirme ·
 * %92 yanıt oranı". §13.5 withholds the response rate below 5 inquiries, so
 * a null rate produces no chip rather than a misleading one.
 */
export function trustChipsTr(c: TrustComponents): string[] {
  const chips: string[] = [];

  if (c.identityVerified) chips.push('Kimlik doğrulandı');
  else if (c.phoneVerified) chips.push('Telefon doğrulandı');
  else if (c.emailVerified) chips.push('E-posta doğrulandı');

  if (c.professionalVerified) chips.push('Profesyonel doğrulandı');
  if (c.reviewCount > 0) chips.push(`${c.reviewCount} değerlendirme`);
  if (c.responseRate !== null) chips.push(`%${Math.round(c.responseRate * 100)} yanıt oranı`);
  if (c.accountAgeMonths >= 12) chips.push(`${Math.floor(c.accountAgeMonths / 12)} yıldır üye`);

  return chips;
}
