import {
  healthRecordType,
  horseSex,
  listingType,
  ROLE_LABEL_TR,
  roleType,
} from '@only-horses/shared-types';
import type { HealthRecordType, RoleType } from '@only-horses/shared-types';

/**
 * The shapes the API actually speaks (§12), in one file.
 *
 * Written after the screens were, which was the wrong order and cost real
 * bugs: the app asked for `/messages/threads`, `/me/saved`,
 * `/horses/:id/health-records` and `/users/:handle`, and the API serves
 * `/conversations`, `/saved`, `/horses/:id/health` and `/profiles/:handle`.
 * Every one of those failed into the demo fallback or an empty state, which
 * is exactly what a working screen with no data looks like.
 *
 * The enums are imported from shared-types rather than restated. §7's
 * `roleType` has no "owner" — it has `horse_owner`; `healthRecordType` has no
 * `vet_visit` — it has `vet_exam`. A hand-typed enum value is a 400 the
 * screen shows as "Bir şeyler ters gitti".
 */

/** §12's auth envelope: `{ profile, tokens }`, not the tokens alone. */
export interface AuthResponse {
  profile: {
    id: string;
    handle: string;
    displayName: string;
    email: string;
    verificationLevel: string;
    trustScore: number;
  };
  tokens: { accessToken: string; refreshToken: string; expiresIn?: number };
}

/** GET /conversations — §18.2 S21. */
export interface ConversationSummary {
  id: string;
  contextType: string | null;
  contextId: string | null;
  contextTitle: string | null;
  counterpartId: string | null;
  counterpartName: string | null;
  lastMessageAt: string | null;
  lastMessageBody: string | null;
  unread: boolean;
  isArchived: boolean;
  blocked: boolean;
}

/** GET /conversations/:id — snake-cased, straight out of the query. */
export interface ConversationMessage {
  id: string;
  sender_id: string | null;
  sender_name: string | null;
  body: string;
  attachment: unknown;
  is_system: boolean;
  payment_warning: boolean;
  created_at: string;
}

/**
 * GET /horses/:id/health.
 *
 * camelCase — unlike GET /horses/:id, and unlike most of §12's list endpoints,
 * because this one maps its rows through `toHealthRecord` before answering.
 * This interface said snake_case, which is worse than saying nothing: the
 * compiler agreed with the app, every date read as undefined, and a horse with
 * four years of vaccinations rendered four blank dates and no reminders.
 *
 * `typeLabel` comes down with the row, so the client does not need its own
 * copy of §7's Turkish labels to render a log.
 */
export interface HealthRecord {
  id: string;
  type: HealthRecordType;
  typeLabel: string;
  title: string;
  notes: string | null;
  performedOn: string;
  nextDueOn: string | null;
  performedByName: string | null;
  clinicName: string | null;
  isSensitive: boolean;
}

/**
 * GET /me/horses.
 *
 * camelCase — unlike GET /horses/:id, which is snake-cased because it comes
 * straight out of the query. The two shapes for the same entity are a trap the
 * app fell into: reading `date_of_birth` off this list yields undefined for
 * every horse, so ages, heights and cover washes were all silently blank.
 */
export interface MyHorse {
  id: string;
  slug: string | null;
  name: string;
  sex: string;
  breedId: string | null;
  breedName: string | null;
  dateOfBirth: string | null;
  birthYearEstimated: boolean;
  heightCm: string | number | null;
  color: string | null;
  status: string;
  coverMediaId: string | null;
  coverBlurhash: string | null;
  mediaCount: number;
  /** §5: the id of the live listing, if this horse is on the market. */
  activeListingId: string | null;
  /** §9's next reminder, surfaced on the stable row. */
  nextDueOn: string | null;
  nextDueTitle: string | null;
}

/**
 * §18.2 S04's role picker offers plain words; §7's enum is the vocabulary the
 * database speaks. Mapping them here keeps the picker readable without letting
 * a label leak into a request body.
 */
const ROLE_BODIES: { id: RoleType; body: string }[] = [
  { id: 'horse_owner', body: 'Bir ya da daha fazla atım var' },
  { id: 'rider', body: 'Biniyorum, yarışıyorum' },
  { id: 'trainer', body: 'At ve binici eğitiyorum' },
  { id: 'instructor', body: 'Ders veriyorum' },
  { id: 'breeder', body: 'Damızlık ve tay yetiştiriyorum' },
  { id: 'veterinarian', body: 'Sağlık hizmeti veriyorum' },
  { id: 'farrier', body: 'Nal ve tırnak bakımı' },
  { id: 'groom', body: 'Günlük bakım ve ahır işleri' },
  { id: 'transporter', body: 'At taşıyorum' },
  { id: 'equine_therapist', body: 'Fizyoterapi ve rehabilitasyon' },
  { id: 'ranch_manager', body: 'Ahır, tesis ya da kulüp' },
  { id: 'agent', body: 'Alım satımda temsil ediyorum' },
];

/**
 * The label comes from shared-types so the web's public profile and this
 * picker cannot end up calling the same role two different things.
 */
export const ROLE_OPTIONS: { id: RoleType; label: string; body: string }[] = ROLE_BODIES.map(
  (entry) => ({ ...entry, label: ROLE_LABEL_TR[entry.id] ?? entry.id }),
);

/** §7's health record types, in the order §18.2 S12 lists them. */
export const HEALTH_TYPES: { id: HealthRecordType; label: string }[] = [
  { id: 'vaccination', label: 'Aşı' },
  { id: 'deworming', label: 'Parazit' },
  { id: 'farrier', label: 'Nalbant' },
  { id: 'dental', label: 'Diş' },
  { id: 'vet_exam', label: 'Veteriner' },
  { id: 'ppe', label: 'Satış öncesi muayene' },
  { id: 'injury', label: 'Yaralanma' },
  { id: 'lameness', label: 'Topallık' },
  { id: 'xray', label: 'Röntgen' },
  { id: 'lab_result', label: 'Laboratuvar' },
  { id: 'medication', label: 'İlaç' },
  { id: 'surgery', label: 'Operasyon' },
  { id: 'other', label: 'Diğer' },
];

/**
 * §18.2 S12 auto-suggests the next due date from the type. The table lives in
 * shared-types (`DEFAULT_INTERVAL_DAYS`) and the API applies it when
 * `nextDueOn` is omitted — so the wizard offers the same intervals rather than
 * inventing its own and disagreeing with the reminder that gets scheduled.
 */
export const REMINDER_INTERVALS: { label: string; days: number | null }[] = [
  { label: 'Yok', days: null },
  { label: '6 hafta', days: 42 },
  { label: '3 ay', days: 91 },
  { label: '6 ay', days: 182 },
  { label: '1 yıl', days: 365 },
];

/** §18.5's report reasons, as the moderation endpoint enumerates them. */
export const REPORT_REASONS: { id: string; label: string }[] = [
  { id: 'welfare', label: 'At refahı' },
  { id: 'scam', label: 'Dolandırıcılık' },
  { id: 'misrepresentation', label: 'Yanıltıcı bilgi' },
  { id: 'stolen_photos', label: 'Çalıntı fotoğraf' },
  { id: 'duplicate', label: 'Mükerrer ilan' },
  { id: 'prohibited_content', label: 'Yasaklı içerik' },
  { id: 'harassment', label: 'Taciz' },
  { id: 'spam', label: 'Spam' },
  { id: 'wrong_category', label: 'Yanlış kategori' },
  { id: 'other', label: 'Diğer' },
];

export const SEXES = horseSex.options;
export const LISTING_TYPE_OPTIONS = listingType.options;
export const ROLE_IDS = roleType.options;
export const HEALTH_TYPE_IDS = healthRecordType.options;

/** GET /orders/mine — snake_cased, straight out of the query. */
export interface OrderRow {
  id: string;
  reference: string;
  status: string;
  payment_status: string;
  quantity: number;
  title_snapshot: string;
  unit_price_amount: string;
  total_amount: string;
  currency: string;
  delivery: string;
  tracking_note: string | null;
  created_at: string;
  paid_at: string | null;
  shipped_at: string | null;
  completed_at: string | null;
  cancel_reason: string | null;
  product_slug: string;
  counterparty_name: string;
  counterparty_handle: string;
}

/**
 * §5-style transitions, as the buttons each side may press.
 *
 * Keyed by role because the two parties do not share a lifecycle: the seller
 * confirms and ships, the buyer pays and receives. Rendering the seller's
 * buttons to a buyer would offer four actions the API answers 403 to.
 */
export const ORDER_ACTIONS: Record<
  'buyer' | 'seller',
  Record<string, { action: string; label: string }[]>
> = {
  buyer: {
    pending_seller: [{ action: 'cancel', label: 'Vazgeç' }],
    awaiting_payment: [
      { action: 'pay', label: 'Öde' },
      { action: 'cancel', label: 'Vazgeç' },
    ],
    paid: [{ action: 'cancel', label: 'İptal et' }],
    shipped: [{ action: 'confirm', label: 'Teslim aldım' }],
  },
  seller: {
    pending_seller: [
      { action: 'accept', label: 'Onayla' },
      { action: 'reject', label: 'Reddet' },
    ],
    paid: [{ action: 'ship', label: 'Kargoya verdim' }],
  },
};
