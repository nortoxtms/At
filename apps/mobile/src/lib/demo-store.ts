import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEMO_BREEDS,
  DEMO_DISCIPLINES,
  DEMO_JOBS,
  DEMO_LISTINGS,
  DEMO_LISTING_DETAIL,
  DEMO_SERVICES,
} from '@only-horses/demo-content';
import type { ListingSearchHit } from '@only-horses/shared-types';

/**
 * The demo's state, and the rules that change it.
 *
 * This is a small database, not a set of canned screens. Everything you do in
 * demo mode is real inside the demo: a horse you add is there tomorrow, the
 * listing you publish appears in search, the message you send has a reply, and
 * the photo you take is on the record. The alternative — screens that show
 * fixed content and buttons that do nothing — demonstrates a slideshow rather
 * than a product, and the first thing anyone tries is the thing it cannot do.
 *
 * It persists, because a demo that resets on every launch is a demo you cannot
 * show twice. `RESET` is offered in settings for when you want a clean one.
 *
 * What it is not is the API. §11's ranking, §18.4's trust score, moderation,
 * duplicate-photo detection and the search index all live on the server and
 * none of them are reproduced. The banner says so on every screen.
 */
const KEY = 'only-horses.demo.v1';

export interface DemoHorse {
  id: string;
  slug: string;
  name: string;
  sex: string;
  dateOfBirth: string | null;
  birthYearEstimated: boolean;
  heightCm: number | null;
  color: string | null;
  breedId: string | null;
  disciplines: string[];
  about: string | null;
  passportNumber: string | null;
  microchipNumber: string | null;
  coverBlurhash: string | null;
  ownerName: string;
  createdAt: string;
  /** §6: the record survives the sale, so this is a log rather than a field. */
  ownership: { name: string; from: string; note: string | null }[];
  transferredAway: boolean;
}

export interface DemoMedia {
  mediaId: string;
  horseId: string;
  uri: string;
  createdAt: string;
}

export interface DemoHealth {
  id: string;
  horseId: string;
  type: string;
  title: string;
  notes: string | null;
  performedOn: string;
  nextDueOn: string | null;
}

export interface DemoCompetition {
  id: string;
  horseId: string;
  eventDate: string;
  eventName: string;
  discipline?: string;
  className?: string;
  placing?: number;
  location?: string;
  riderName?: string;
}

export interface DemoListing {
  id: string;
  slug: string;
  horseId: string;
  title: string;
  description: string;
  type: string;
  status: string;
  priceAmount: number | null;
  priceCurrency: string;
  priceType: string;
  city: string | null;
  trialAllowed: boolean;
  ppeWelcome: boolean;
  viewCount: number;
  saveCount: number;
  inquiryCount: number;
  createdAt: string;
}

export interface DemoMessage {
  id: string;
  conversationId: string;
  body: string;
  fromMe: boolean;
  isSystem: boolean;
  createdAt: string;
}

export interface DemoConversation {
  id: string;
  counterpartName: string;
  counterpartId: string;
  contextType: string;
  contextId: string | null;
  contextTitle: string | null;
  lastReadAt: string | null;
}

export interface DemoSaved {
  itemType: string;
  itemId: string;
  title: string;
  subtitle: string | null;
  slug: string | null;
  note: string | null;
  createdAt: string;
  isAvailable: boolean;
}

export interface DemoSavedSearch {
  id: string;
  name: string;
  entity: string;
  query: Record<string, unknown>;
  alertChannel: string[];
  alertFrequency: string;
  createdAt: string;
}

export interface DemoNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface DemoState {
  profile: {
    id: string;
    handle: string;
    displayName: string;
    email: string;
    verificationLevel: string;
    trustScore: number;
    city: string | null;
    region: string | null;
    bio: string | null;
    roles: string[];
  };
  horses: DemoHorse[];
  media: DemoMedia[];
  health: DemoHealth[];
  competitions: DemoCompetition[];
  listings: DemoListing[];
  conversations: DemoConversation[];
  messages: DemoMessage[];
  saved: DemoSaved[];
  savedSearches: DemoSavedSearch[];
  notifications: DemoNotification[];
  applications: { jobSlug: string; coverLetter: string; createdAt: string }[];
  reports: { targetType: string; targetId: string; reason: string; createdAt: string }[];
  seq: number;
}

const now = () => new Date().toISOString();
const daysFromNow = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

let state: DemoState | null = null;

/**
 * §3.3 says publishing needs identity verification, and the demo account has
 * it. That is the one rule the demo deliberately starts on the far side of:
 * the gate itself is shown on the real account path, and a demo that stops at
 * it can never show the listing flow it exists to show. The verification
 * screen still explains the rule.
 */
function seed(): DemoState {
  const horse: DemoHorse = {
    id: 'demo-horse-1',
    slug: 'sultan',
    name: 'Sultan',
    sex: 'mare',
    dateOfBirth: `${new Date().getFullYear() - 8}-04-12`,
    birthYearEstimated: false,
    heightCm: 163,
    color: 'doru',
    breedId: 'arabian',
    disciplines: ['endurance', 'leisure'],
    about: 'Sakin, insana alışkın. Uzun mesafede dayanıklı.',
    passportNumber: null,
    microchipNumber: null,
    coverBlurhash: 'L6PZfSjE.AyE_3t7t7R**0o#DgR4',
    ownerName: 'Demo Kullanıcı',
    createdAt: now(),
    ownership: [{ name: 'Demo Kullanıcı', from: now().slice(0, 10), note: null }],
    transferredAway: false,
  };

  const conversationId = 'demo-thread-1';
  const subject = DEMO_LISTINGS[0];

  return {
    profile: {
      id: 'demo-profile',
      handle: 'demo',
      displayName: 'Demo Kullanıcı',
      email: 'demo@onlyhorses.app',
      verificationLevel: 'identity_verified',
      trustScore: 62,
      city: 'İstanbul',
      region: 'İstanbul',
      bio: null,
      roles: ['horse_owner', 'rider'],
    },
    horses: [horse],
    media: [],
    health: [
      {
        id: 'demo-health-1',
        horseId: horse.id,
        type: 'vaccination',
        title: 'İnfluenza aşısı',
        notes: 'Yıllık rapel',
        performedOn: daysFromNow(-95),
        nextDueOn: daysFromNow(270),
      },
      {
        id: 'demo-health-2',
        horseId: horse.id,
        type: 'farrier',
        title: 'Nal değişimi',
        notes: 'Ön çift nal',
        performedOn: daysFromNow(-30),
        // Overdue on purpose: §9's reminder is the thing worth demonstrating,
        // and a log with nothing due shows none of it.
        nextDueOn: daysFromNow(-2),
      },
    ],
    competitions: [
      {
        id: 'demo-comp-1',
        horseId: horse.id,
        eventDate: daysFromNow(-120),
        eventName: 'Kapadokya Dayanıklılık Kupası',
        discipline: 'endurance',
        placing: 4,
        location: 'Nevşehir',
        riderName: 'Demo Kullanıcı',
      },
    ],
    listings: [],
    conversations: [
      {
        id: conversationId,
        counterpartName: 'Ege Atlı Spor Kulübü',
        counterpartId: 'demo-seller-1',
        contextType: 'listing',
        contextId: subject?.id ?? null,
        contextTitle: subject?.title ?? null,
        lastReadAt: null,
      },
    ],
    messages: [
      {
        id: 'demo-msg-1',
        conversationId,
        body: 'Merhaba, ilandaki atı hafta sonu görebilir miyim?',
        fromMe: true,
        isSystem: false,
        createdAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
      },
      {
        id: 'demo-msg-2',
        conversationId,
        body: 'Merhaba, tabii. Cumartesi 11:00 uygun olur mu? PPE için kendi veterinerinizi getirebilirsiniz.',
        fromMe: false,
        isSystem: false,
        createdAt: new Date(Date.now() - 20 * 60_000).toISOString(),
      },
    ],
    saved: [],
    savedSearches: [],
    notifications: [
      {
        id: 'demo-notif-1',
        type: 'message',
        title: 'Ege Atlı Spor Kulübü yanıtladı',
        body: 'Cumartesi 11:00 uygun olur mu?',
        data: { conversationId },
        readAt: null,
        createdAt: new Date(Date.now() - 20 * 60_000).toISOString(),
      },
      {
        id: 'demo-notif-2',
        type: 'health_due',
        title: 'Sultan — nal değişimi gecikti',
        body: 'Planlanan tarih geçti.',
        data: { horseId: horse.id },
        readAt: null,
        createdAt: new Date(Date.now() - 26 * 3_600_000).toISOString(),
      },
    ],
    applications: [],
    reports: [],
    seq: 1,
  };
}

export function getState(): DemoState {
  if (!state) state = seed();
  return state;
}

export function nextId(prefix: string): string {
  const current = getState();
  current.seq += 1;
  return `${prefix}-${current.seq}`;
}

/** Persisted after every mutation; a demo that forgets is a demo shown once. */
export async function persist(): Promise<void> {
  if (!state) return;
  await AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
}

export async function restore(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(KEY).catch(() => null);
  if (!raw) return false;

  try {
    state = JSON.parse(raw) as DemoState;
    return true;
  } catch {
    return false;
  }
}

export async function reset(): Promise<void> {
  state = seed();
  await persist();
}

export async function clear(): Promise<void> {
  state = null;
  await AsyncStorage.removeItem(KEY).catch(() => {});
}

/**
 * The demo's own listings, projected into the search-hit shape the browse
 * screens already render. Yours are mixed into the bundled catalogue rather
 * than kept in a separate list, because "where did my listing go" is the first
 * question a separate list produces.
 */
export function ownListingHits(): ListingSearchHit[] {
  const current = getState();

  return current.listings
    .filter((listing) => listing.status === 'active')
    .map((listing) => {
      const horse = current.horses.find((entry) => entry.id === listing.horseId);
      const year = horse?.dateOfBirth ? new Date(horse.dateOfBirth).getFullYear() : null;

      return {
        id: listing.id,
        slug: listing.slug,
        title: listing.title,
        horseName: horse?.name ?? '',
        listingType: listing.type,
        breed: horse?.breedId ?? null,
        sex: horse?.sex ?? 'mare',
        ageYears: year ? new Date().getFullYear() - year : null,
        heightCm: horse?.heightCm ?? null,
        color: horse?.color ?? null,
        disciplines: horse?.disciplines ?? [],
        priceAmount: listing.priceAmount,
        priceCurrency: listing.priceCurrency,
        priceEur: listing.priceAmount === null ? null : Math.round(listing.priceAmount / 37),
        priceType: listing.priceType,
        countryCode: 'TR',
        region: listing.city,
        city: listing.city,
        distanceKm: null,
        sellerVerification: current.profile.verificationLevel,
        sellerTrustScore: current.profile.trustScore,
        hasVideo: false,
        hasXray: false,
        qualityScore: 80,
        isBoosted: false,
        coverImage: current.media.find((entry) => entry.horseId === listing.horseId)?.uri ?? null,
        coverBlurhash: horse?.coverBlurhash ?? null,
        publishedAt: listing.createdAt,
      };
    });
}

export const CATALOGUE = {
  listings: DEMO_LISTINGS,
  listingDetail: DEMO_LISTING_DETAIL,
  services: DEMO_SERVICES,
  jobs: DEMO_JOBS,
  breeds: DEMO_BREEDS,
  disciplines: DEMO_DISCIPLINES,
};
