/**
 * Turkish labels for the §7 enumerations.
 *
 * These are not translations of an English UI — Türkiye is the launch region
 * (§1.2), so these strings are the primary names for the concepts and the
 * database enum is the code behind them. They live in shared-types because web
 * and mobile display the same horse, and a mare called "Kısrak" on one screen
 * and "Dişi" on the other is the same defect as two palettes.
 *
 * A missing key is not an error — a new enum value should render as its code
 * rather than blank, so every lookup below is expected to be used with `??`.
 */

export const SEX_LABEL_TR: Record<string, string> = {
  mare: 'Kısrak',
  stallion: 'Aygır',
  gelding: 'İğdiş',
  filly: 'Dişi tay',
  colt: 'Erkek tay',
};

export const LISTING_TYPE_LABEL_TR: Record<string, string> = {
  sale: 'Satılık',
  lease: 'Kiralık',
  half_lease: 'Yarı kiralık',
  share: 'Hisse',
  stud: 'Aygır hizmeti',
  loan: 'Ödünç',
};

export const JOB_TYPE_LABEL_TR: Record<string, string> = {
  full_time: 'Tam zamanlı',
  part_time: 'Yarı zamanlı',
  seasonal: 'Sezonluk',
  contract: 'Sözleşmeli',
  internship: 'Staj',
  working_student: 'Çalışan öğrenci',
};

export const ACCOMMODATION_LABEL_TR: Record<string, string> = {
  none: 'Konaklama yok',
  shared: 'Paylaşımlı konaklama',
  private: 'Özel konaklama',
  negotiable: 'Konaklama görüşülür',
};

export const SALARY_PERIOD_LABEL_TR: Record<string, string> = {
  hour: 'saat',
  day: 'gün',
  week: 'hafta',
  month: 'ay',
  year: 'yıl',
};

/** §5's listing lifecycle, as a seller reads it. */
export const LISTING_STATUS_LABEL_TR: Record<string, string> = {
  draft: 'Taslak',
  pending_review: 'İncelemede',
  active: 'Yayında',
  paused: 'Duraklatıldı',
  under_offer: 'Teklif alındı',
  sold: 'Satıldı',
  expired: 'Süresi doldu',
  closed: 'Kapatıldı',
  rejected: 'Reddedildi',
};

/** §3.3's verification ladder. */
export const VERIFICATION_LABEL_TR: Record<string, string> = {
  none: 'Doğrulanmamış',
  email_verified: 'E-posta doğrulandı',
  identity_verified: 'Kimlik doğrulandı',
  professional_verified: 'Meslek doğrulandı',
  business_verified: 'İşletme doğrulandı',
};

/** §20.4's timeline, by entry kind. */
export const TIMELINE_KIND_LABEL_TR: Record<string, string> = {
  registered: 'Kayıt',
  health: 'Sağlık',
  competition: 'Yarışma',
  ownership: 'Sahiplik',
  listing: 'İlan',
};

export const DISCIPLINE_LABEL_TR: Record<string, string> = {
  dressage: 'Dresaj',
  show_jumping: 'Engel atlama',
  eventing: 'Üçlü yarışma',
  endurance: 'Dayanıklılık',
  reining: 'Reining',
  western: 'Western',
  hunter: 'Hunter',
  leisure: 'Gezinti',
  racing_flat: 'Düz koşu',
  racing_harness: 'Koşum yarışı',
  vaulting: 'Vaulting',
  driving: 'Araba koşumu',
  polo: 'Polo',
  therapy: 'Terapi',
  breeding: 'Damızlık',
  cirit: 'Cirit',
  rahvan: 'Rahvan',
};
