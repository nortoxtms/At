import { meetsVerification, SEX_LABEL_TR } from '@only-horses/shared-types';

import {
  CATALOGUE,
  getState,
  nextId,
  ownListingHits,
  ownProductHits,
  persist,
  type DemoConversation,
  type DemoHorse,
  type DemoListing,
  type DemoOrder,
  type DemoProduct,
} from '@/lib/demo-store';
import { HEALTH_TYPES } from '@/lib/endpoints';

/**
 * The demo's server, in one file.
 *
 * Every screen already speaks to `api()`. Rather than teaching thirty screens
 * about a demo mode — thirty places to forget, thirty branches to keep in
 * step — this answers the same routes from local state, and the screens cannot
 * tell the difference. The shapes are the API's, including the parts that are
 * inconsistent: `/me/horses` is camelCase and `/horses/:id` is snake_case,
 * because a demo that returns tidier data than production hides exactly the
 * bugs the app has already had twice.
 *
 * Rules are enforced where the real server enforces them, not skipped: §5's
 * lifecycle refuses a transition that does not exist, §6's transfer removes
 * the horse from your stable and keeps its history, §16 opens one thread per
 * counterparty per subject. A demo that says yes to everything teaches the
 * wrong product.
 */
type Result = { status: number; body: unknown };

const ok = (data: unknown): Result => ({ status: 200, body: { data } });
const created = (data: unknown): Result => ({ status: 201, body: { data } });
const noContent = (): Result => ({ status: 204, body: null });

const fail = (status: number, code: string, message: string): Result => ({
  status,
  body: { error: { code, message } },
});

const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);

/** The icons the API stores against each product group. */
const PRODUCT_GROUP_ICON: Record<string, string> = {
  tack: 'ribbon',
  rider: 'shirt',
  horse_care: 'medkit',
  feed: 'nutrition',
  stable: 'construct',
  arena: 'flag',
  transport: 'bus',
  other_product: 'ellipsis-horizontal',
};

const slugify = (value: string) =>
  value
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

/** §5's transitions. Anything not in here is refused, as the API refuses it. */
const TRANSITIONS: Record<string, Record<string, string>> = {
  draft: { publish: 'active' },
  active: { pause: 'paused', close: 'closed' },
  paused: { resume: 'active', close: 'closed' },
  expired: { renew: 'active' },
};

function horseDetail(horse: DemoHorse): Record<string, unknown> {
  const breed = CATALOGUE.breeds.find((entry) => entry.code === horse.breedId);

  return {
    id: horse.id,
    slug: horse.slug,
    name: horse.name,
    sex: horse.sex,
    date_of_birth: horse.dateOfBirth,
    birth_year_estimated: horse.birthYearEstimated,
    height_cm: horse.heightCm,
    color: horse.color,
    breed_id: horse.breedId,
    breed_name_tr: breed?.name ?? null,
    disciplines: horse.disciplines,
    about: horse.about,
    passport_number: horse.passportNumber,
    microchip_number: horse.microchipNumber,
    cover_blurhash: horse.coverBlurhash,
  };
}

function listingDetail(listing: DemoListing): Record<string, unknown> {
  const state = getState();
  const horse = state.horses.find((entry) => entry.id === listing.horseId);
  const breed = CATALOGUE.breeds.find((entry) => entry.code === horse?.breedId);

  return {
    id: listing.id,
    slug: listing.slug,
    title: listing.title,
    summary: null,
    description: listing.description,
    type: listing.type,
    status: listing.status,
    price_amount: listing.priceAmount === null ? null : String(listing.priceAmount),
    price_currency: listing.priceCurrency,
    price_type: listing.priceType,
    country_code: 'TR',
    region: listing.city,
    city: listing.city,
    trial_allowed: listing.trialAllowed,
    ppe_welcome: listing.ppeWelcome,
    published_at: listing.createdAt,
    view_count: listing.viewCount,
    horse_name: horse?.name ?? '',
    horse_slug: horse?.slug ?? '',
    sex: horse?.sex ?? 'mare',
    color: horse?.color ?? null,
    height_cm: horse?.heightCm === null ? null : String(horse?.heightCm ?? ''),
    date_of_birth: horse?.dateOfBirth ?? null,
    birth_year_estimated: horse?.birthYearEstimated ?? false,
    disciplines: horse?.disciplines ?? [],
    training_level: null,
    rider_level_min: null,
    horse_about: horse?.about ?? null,
    breed_id: horse?.breedId ?? null,
    breed_name_tr: breed?.name ?? null,
    breed_name_en: null,
    visibility_health: 'on_request',
    visibility_pedigree: 'public',
    seller_profile_id: state.profile.id,
    seller_handle: state.profile.handle,
    seller_name: state.profile.displayName,
    seller_trust_score: state.profile.trustScore,
    seller_verification: state.profile.verificationLevel,
    seller_response_rate: '92',
  };
}

/** §20.4's timeline, assembled from the record the way the API assembles it. */
function timeline(horse: DemoHorse) {
  const state = getState();

  const entries = [
    {
      kind: 'registered' as const,
      date: horse.createdAt.slice(0, 10),
      title: 'Kayıt oluşturuldu',
      detail: null,
      referenceId: horse.id,
    },
    ...horse.ownership.map((entry) => ({
      kind: 'ownership' as const,
      date: entry.from,
      title: 'Sahiplik kaydı',
      detail: entry.note ? `${entry.name} · ${entry.note}` : entry.name,
      referenceId: null,
    })),
    ...state.health
      .filter((entry) => entry.horseId === horse.id)
      .map((entry) => ({
        kind: 'health' as const,
        date: entry.performedOn,
        title: entry.title,
        detail: entry.notes,
        referenceId: entry.id,
      })),
    ...state.competitions
      .filter((entry) => entry.horseId === horse.id)
      .map((entry) => ({
        kind: 'competition' as const,
        date: entry.eventDate,
        title: entry.eventName,
        detail: entry.placing ? `${entry.placing}. sıra` : (entry.location ?? null),
        referenceId: entry.id,
      })),
    ...state.listings
      .filter((entry) => entry.horseId === horse.id)
      .map((entry) => ({
        kind: 'listing' as const,
        date: entry.createdAt.slice(0, 10),
        title: entry.title,
        detail: entry.status === 'active' ? 'Yayında' : null,
        referenceId: entry.id,
      })),
  ];

  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

function notify(type: string, title: string, body: string | null, data: Record<string, unknown>) {
  getState().notifications.unshift({
    id: nextId('notif'),
    type,
    title,
    body,
    data,
    readAt: null,
    createdAt: now(),
  });
}

/** The seller's side of a conversation, so a demo message gets an answer. */
function autoReply(conversation: DemoConversation, incoming: string) {
  const state = getState();

  const reply = /fiyat|pazarlık|indirim/i.test(incoming)
    ? 'Fiyatta biraz esneklik var, atı gördükten sonra konuşalım.'
    : /ne zaman|görebilir|randevu|hafta/i.test(incoming)
      ? 'Bu hafta sonu müsaitim. Cumartesi öğleden önce uygun olur mu?'
      : 'Teşekkürler, en kısa sürede dönüş yapacağım.';

  state.messages.push({
    id: nextId('msg'),
    conversationId: conversation.id,
    body: reply,
    fromMe: false,
    isSystem: false,
    createdAt: new Date(Date.now() + 1_000).toISOString(),
  });

  notify('message', `${conversation.counterpartName} yanıtladı`, reply, {
    conversationId: conversation.id,
  });
}

function search(query: URLSearchParams) {
  const needle = (query.get('q') ?? '').trim().toLocaleLowerCase('tr');
  const type = query.get('type');
  const region = query.get('region');
  const sex = query.get('sex');
  const discipline = query.get('discipline');
  const maxPriceEur = query.get('maxPriceEur');

  // Yours first: a listing you just published that appears below two hundred
  // others reads as not published at all.
  return [...ownListingHits(), ...CATALOGUE.listings].filter((hit) => {
    if (type && hit.listingType !== type) return false;
    if (region && hit.region !== region) return false;
    if (sex && hit.sex !== sex) return false;
    if (discipline && !hit.disciplines.includes(discipline)) return false;
    if (maxPriceEur && (hit.priceEur ?? Infinity) > Number(maxPriceEur)) return false;
    if (!needle) return true;

    return [hit.title, hit.horseName, hit.breed, hit.city, hit.region]
      .filter(Boolean)
      .some((field) => String(field).toLocaleLowerCase('tr').includes(needle));
  });
}

/**
 * Route a request against local state.
 *
 * Returns `null` for anything unrecognised, so a route added to a screen and
 * forgotten here surfaces as a clear 501 rather than as a screen that silently
 * shows nothing.
 */
export async function demoRequest(
  path: string,
  method: string,
  body: unknown,
): Promise<Result> {
  const [rawPath, rawQuery] = path.split('?');
  const query = new URLSearchParams(rawQuery ?? '');
  const segments = rawPath.split('/').filter(Boolean);
  const state = getState();
  const payload = (body ?? {}) as Record<string, unknown>;

  const at = (index: number) => segments[index];
  const is = (...parts: (string | null)[]) =>
    parts.length === segments.length && parts.every((part, index) => part === null || part === segments[index]);

  // ── identity ────────────────────────────────────────────────────────────
  if (is('auth', 'login') || is('auth', 'register')) {
    return created({
      profile: state.profile,
      tokens: { accessToken: 'demo-access', refreshToken: 'demo-refresh' },
    });
  }

  if (is('me') && method === 'GET') return ok({ ...state.profile, roles: state.profile.roles });

  if (is('me') && method === 'PATCH') {
    if (typeof payload.displayName === 'string') state.profile.displayName = payload.displayName;
    if ('city' in payload) state.profile.city = (payload.city as string) || null;
    if ('bio' in payload) state.profile.bio = (payload.bio as string) || null;
    await persist();
    return noContent();
  }

  if (is('me', 'account') && method === 'DELETE') return noContent();

  if (is('me', 'roles') && method === 'POST') {
    const role = String(payload.role ?? '');
    if (role && !state.profile.roles.includes(role)) state.profile.roles.push(role);
    await persist();
    return created({ id: nextId('role') });
  }

  if (is('me', 'dashboard')) {
    return ok({
      horses: state.horses.filter((horse) => !horse.transferredAway).length,
      activeListings: state.listings.filter((listing) => listing.status === 'active').length,
      draftListings: state.listings.filter((listing) => listing.status === 'draft').length,
      unreadNotifications: state.notifications.filter((entry) => !entry.readAt).length,
      savedItems: state.saved.length,
      pendingAccessRequests: 0,
      dueReminders: state.health.filter(
        (entry) => entry.nextDueOn !== null && entry.nextDueOn <= today(),
      ).length,
    });
  }

  if (is('profiles', null)) {
    if (at(1) === state.profile.handle) {
      return ok({
        ...state.profile,
        responseRate: 92,
        responseTimeMins: 45,
        reviewCount: 4,
        reviewAverage: 4.5,
        roles: state.profile.roles.map((role) => ({ role })),
        trustChips: [
          'Kimliği doğrulanmış',
          '4 değerlendirme, 4.5 ortalama',
          'Mesajların %92’sini yanıtlıyor',
        ],
        createdAt: now(),
      });
    }

    return ok({
      id: 'demo-seller-1',
      handle: at(1),
      displayName: 'Ege Atlı Spor Kulübü',
      bio: 'İzmir merkezli atlı spor kulübü.',
      city: 'İzmir',
      region: 'İzmir',
      verificationLevel: 'business_verified',
      trustScore: 74,
      responseRate: 88,
      responseTimeMins: 120,
      reviewCount: 12,
      reviewAverage: 4.7,
      roles: [{ role: 'ranch_manager' }],
      trustChips: ['İşletme doğrulanmış', '12 değerlendirme, 4.7 ortalama'],
      createdAt: now(),
    });
  }

  // ── reference ───────────────────────────────────────────────────────────
  if (is('reference', 'breeds')) return ok(CATALOGUE.breeds);
  if (is('reference', 'disciplines')) return ok(CATALOGUE.disciplines);

  // ── horses ──────────────────────────────────────────────────────────────
  if (is('me', 'horses')) {
    return ok(
      state.horses
        .filter((horse) => !horse.transferredAway)
        .map((horse) => {
          const due = state.health
            .filter((entry) => entry.horseId === horse.id && entry.nextDueOn)
            .sort((a, b) => (a.nextDueOn ?? '').localeCompare(b.nextDueOn ?? ''))[0];

          return {
            id: horse.id,
            slug: horse.slug,
            name: horse.name,
            sex: horse.sex,
            breedId: horse.breedId,
            breedName: CATALOGUE.breeds.find((entry) => entry.code === horse.breedId)?.name ?? null,
            dateOfBirth: horse.dateOfBirth,
            birthYearEstimated: horse.birthYearEstimated,
            heightCm: horse.heightCm,
            color: horse.color,
            status: 'active',
            coverMediaId: null,
            coverBlurhash: horse.coverBlurhash,
            mediaCount: state.media.filter((entry) => entry.horseId === horse.id).length,
            activeListingId:
              state.listings.find(
                (listing) => listing.horseId === horse.id && listing.status === 'active',
              )?.id ?? null,
            nextDueOn: due?.nextDueOn ?? null,
            nextDueTitle: due?.title ?? null,
          };
        }),
    );
  }

  if (is('horses') && method === 'POST') {
    const name = String(payload.name ?? '').trim();
    const horse: DemoHorse = {
      id: nextId('horse'),
      slug: slugify(name) || nextId('at'),
      name,
      sex: String(payload.sex ?? 'mare'),
      dateOfBirth: (payload.dateOfBirth as string) ?? null,
      birthYearEstimated: Boolean(payload.birthYearEstimated),
      heightCm: payload.heightCm ? Number(payload.heightCm) : null,
      color: (payload.color as string) ?? null,
      breedId: (payload.breedId as string) ?? null,
      disciplines: (payload.disciplines as string[]) ?? [],
      about: (payload.about as string) ?? null,
      passportNumber: (payload.passportNumber as string) ?? null,
      microchipNumber: (payload.microchipNumber as string) ?? null,
      coverBlurhash: null,
      ownerName: state.profile.displayName,
      createdAt: now(),
      ownership: [{ name: state.profile.displayName, from: today(), note: 'Kayıt açıldı' }],
      transferredAway: false,
    };

    state.horses.unshift(horse);
    await persist();
    return created({ id: horse.id, slug: horse.slug });
  }

  if (segments[0] === 'horses' && segments.length >= 2) {
    const horse = state.horses.find((entry) => entry.id === at(1) || entry.slug === at(1));
    if (!horse) return fail(404, 'NOT_FOUND', 'At bulunamadı.');

    if (segments.length === 2 && method === 'GET') return ok(horseDetail(horse));

    if (segments.length === 2 && method === 'PATCH') {
      if (typeof payload.name === 'string') horse.name = payload.name;
      if (typeof payload.sex === 'string') horse.sex = payload.sex;
      if ('heightCm' in payload) horse.heightCm = payload.heightCm ? Number(payload.heightCm) : null;
      if ('color' in payload) horse.color = (payload.color as string) || null;
      if ('about' in payload) horse.about = (payload.about as string) || null;
      if (Array.isArray(payload.disciplines)) horse.disciplines = payload.disciplines as string[];
      await persist();
      return noContent();
    }

    if (is('horses', null, 'timeline')) return ok(timeline(horse));

    if (is('horses', null, 'health') && method === 'GET') {
      return ok(
        state.health
          .filter((entry) => entry.horseId === horse.id)
          .map((entry) => ({
            id: entry.id,
            type: entry.type,
            title: entry.title,
            notes: entry.notes,
            performedOn: entry.performedOn,
            nextDueOn: entry.nextDueOn,
            typeLabel: HEALTH_TYPES.find((option) => option.id === entry.type)?.label ?? 'Diğer',
            performedByName: null,
            clinicName: null,
            isSensitive: false,
          })),
      );
    }

    if (is('horses', null, 'health') && method === 'POST') {
      const record = {
        id: nextId('health'),
        horseId: horse.id,
        type: String(payload.type ?? 'other'),
        title: String(payload.title ?? ''),
        notes: (payload.notes as string) ?? null,
        performedOn: String(payload.performedOn ?? today()),
        nextDueOn: (payload.nextDueOn as string) ?? null,
      };

      state.health.push(record);

      if (record.nextDueOn) {
        notify('health_due', `${horse.name} — ${record.title}`, `Sıradaki: ${record.nextDueOn}`, {
          horseId: horse.id,
        });
      }

      await persist();
      return created({ id: record.id });
    }

    if (is('horses', null, 'competitions') && method === 'POST') {
      const record = {
        id: nextId('comp'),
        horseId: horse.id,
        eventDate: String(payload.eventDate ?? today()),
        eventName: String(payload.eventName ?? ''),
        discipline: payload.discipline as string | undefined,
        className: payload.className as string | undefined,
        placing: payload.placing ? Number(payload.placing) : undefined,
        location: payload.location as string | undefined,
        riderName: payload.riderName as string | undefined,
      };

      state.competitions.push(record);
      await persist();
      return created({ id: record.id });
    }

    if (is('horses', null, 'media') && method === 'GET') {
      return ok(
        state.media
          .filter((entry) => entry.horseId === horse.id)
          .map((entry, index) => ({
            mediaId: entry.mediaId,
            url: entry.uri,
            category: 'general',
            sortOrder: index,
            visibility: 'public',
            type: 'image',
            blurhash: horse.coverBlurhash,
            width: null,
            height: null,
          })),
      );
    }

    if (is('horses', null, 'media') && method === 'POST') {
      const mediaId = String(payload.mediaId ?? '');
      const pending = state.media.find((entry) => entry.mediaId === mediaId);
      if (pending) pending.horseId = horse.id;
      await persist();
      return created({ attached: mediaId });
    }

    if (is('horses', null, 'media', null) && method === 'DELETE') {
      state.media = state.media.filter((entry) => entry.mediaId !== at(3));
      await persist();
      return noContent();
    }

    if (is('horses', null, 'transfer') && method === 'POST') {
      const to = String(payload.toEmail ?? payload.toProfileId ?? 'yeni sahip');

      // §6: the record is not deleted, it changes hands. The horse leaves your
      // stable and the ownership line keeps your name.
      horse.ownership.push({
        name: to,
        from: String(payload.date ?? today()),
        note: payload.price && payload.pricePublic ? `${payload.price} TRY` : 'Devir',
      });
      horse.transferredAway = true;

      state.listings
        .filter((listing) => listing.horseId === horse.id && listing.status === 'active')
        .forEach((listing) => {
          listing.status = 'closed';
        });

      notify('ownership', `${horse.name} devredildi`, `Yeni sahip: ${to}`, { horseId: horse.id });
      await persist();
      return created({ transferred: true });
    }
  }

  // ── media ───────────────────────────────────────────────────────────────
  if (is('media', 'upload-intent') && method === 'POST') {
    const mediaId = nextId('media');
    // No bytes move in the demo — `uploadImage` hands the local URI straight
    // to `demoAttachMedia`, and this only reserves the id.
    return created({
      mediaId,
      uploadUrl: 'demo://upload',
      storageKey: mediaId,
      method: 'POST',
      headers: {},
      expiresAt: now(),
    });
  }

  if (segments[0] === 'media' && segments[2] === 'complete') return ok({ status: 'ready' });

  // ── listings ────────────────────────────────────────────────────────────
  if (is('listings', 'search')) {
    const hits = search(query);
    return {
      status: 200,
      body: { data: hits, meta: { page: 1, limit: hits.length, total: hits.length, hasMore: false } },
    };
  }

  if (is('listings') && method === 'POST') {
    const horse = state.horses.find((entry) => entry.id === payload.horseId);
    if (!horse) return fail(404, 'NOT_FOUND', 'At bulunamadı.');

    const listing: DemoListing = {
      id: nextId('listing'),
      slug: `${horse.slug}-${slugify(String(payload.type ?? 'sale'))}-${state.seq}`,
      horseId: horse.id,
      title: String(payload.title ?? ''),
      description: String(payload.description ?? ''),
      type: String(payload.type ?? 'sale'),
      status: 'draft',
      priceAmount: payload.priceAmount ? Number(payload.priceAmount) : null,
      priceCurrency: String(payload.priceCurrency ?? 'TRY'),
      priceType: String(payload.priceType ?? 'fixed'),
      city: (payload.city as string) ?? state.profile.city,
      trialAllowed: payload.trialAllowed !== false,
      ppeWelcome: payload.ppeWelcome !== false,
      viewCount: 0,
      saveCount: 0,
      inquiryCount: 0,
      createdAt: now(),
    };

    state.listings.unshift(listing);
    await persist();
    return created({ id: listing.id, slug: listing.slug });
  }

  if (is('me', 'listings')) {
    return ok(
      state.listings.map((listing) => ({
        id: listing.id,
        slug: listing.slug,
        title: listing.title,
        status: listing.status,
        type: listing.type,
        price_amount: listing.priceAmount === null ? null : String(listing.priceAmount),
        price_currency: listing.priceCurrency,
        price_type: listing.priceType,
        view_count: listing.viewCount,
        save_count: listing.saveCount,
        inquiry_count: listing.inquiryCount,
        is_boosted: false,
        horse_name: state.horses.find((horse) => horse.id === listing.horseId)?.name ?? '',
      })),
    );
  }

  if (segments[0] === 'listings' && segments.length === 3 && method === 'POST') {
    const listing = state.listings.find((entry) => entry.id === at(1));
    if (!listing) return fail(404, 'NOT_FOUND', 'İlan bulunamadı.');

    const next = TRANSITIONS[listing.status]?.[at(2) ?? ''];
    if (!next) {
      return fail(
        409,
        'INVALID_TRANSITION',
        `Bu ilan "${listing.status}" durumundayken bu işlem yapılamaz.`,
      );
    }

    listing.status = next;

    if (next === 'active') {
      listing.viewCount += 7;
      notify('listing_published', `${listing.title} yayında`, 'İlanın aramada görünüyor.', {
        listingSlug: listing.slug,
      });
    }

    await persist();
    return ok({ status: next });
  }

  if (segments[0] === 'listings' && segments.length === 2 && method === 'GET') {
    const own = state.listings.find((entry) => entry.slug === at(1) || entry.id === at(1));
    if (own) {
      own.viewCount += 1;
      return ok(listingDetail(own));
    }

    const catalogue = CATALOGUE.listingDetail[at(1) ?? ''];
    if (catalogue) return ok({ ...catalogue, seller_profile_id: 'demo-seller-1' });

    return fail(404, 'NOT_FOUND', 'İlan bulunamadı.');
  }

  // ── products ────────────────────────────────────────────────────────────
  if (is('products', 'categories')) {
    // Counts are the bundled catalogue plus whatever you have listed, so a
    // tile that says 4 and opens on 5 cannot happen.
    const own = ownProductHits();

    return ok(
      CATALOGUE.productCategories.map((entry) => {
        const children = CATALOGUE.productCategories
          .filter((child) => child.parentCode === entry.code)
          .map((child) => child.code);

        const inScope = (code: string) => code === entry.code || children.includes(code);

        return {
          code: entry.code,
          parent_code: entry.parentCode,
          name_tr: entry.name,
          icon: PRODUCT_GROUP_ICON[entry.code] ?? null,
          active_count:
            entry.activeCount + own.filter((product) => inScope(product.category)).length,
        };
      }),
    );
  }

  if (is('products', 'search')) {
    const needle = (query.get('q') ?? '').trim().toLocaleLowerCase('tr');
    const category = query.get('category');
    const condition = query.get('condition');
    const delivery = query.get('delivery');
    const limit = Number(query.get('limit') ?? 50);

    const children = category
      ? CATALOGUE.productCategories
          .filter((entry) => entry.parentCode === category)
          .map((entry) => entry.code)
      : [];

    const hits = [...ownProductHits(), ...CATALOGUE.products].filter((product) => {
      // A parent matches its children, as the API rolls them up — otherwise
      // tapping a group returns nothing and the taxonomy looks broken.
      if (category && product.category !== category && !children.includes(product.category)) {
        return false;
      }
      if (condition && product.condition !== condition) return false;
      if (delivery && product.delivery !== delivery && product.delivery !== 'both') return false;
      if (!needle) return true;

      return [
        product.title,
        product.brand,
        product.model,
        product.sizeLabel,
        product.categoryName,
        product.city,
      ]
        .filter(Boolean)
        .some((field) => String(field).toLocaleLowerCase('tr').includes(needle));
    });

    return {
      status: 200,
      body: {
        data: hits.slice(0, limit),
        meta: { page: 1, limit, total: hits.length, hasMore: false },
      },
    };
  }

  if (is('me', 'products')) {
    return ok(
      state.products.map((product) => ({
        id: product.id,
        slug: product.slug,
        title: product.title,
        status: product.status,
        category: product.category,
        category_name:
          CATALOGUE.productCategories.find((entry) => entry.code === product.category)?.name ?? '',
        price_amount: product.priceAmount === null ? null : String(product.priceAmount),
        price_currency: product.priceCurrency,
        price_type: product.priceType,
        price_unit: product.priceUnit,
        quantity: product.quantity,
        view_count: product.viewCount,
        save_count: product.saveCount,
        inquiry_count: product.inquiryCount,
      })),
    );
  }

  if (is('products') && method === 'POST') {
    const product: DemoProduct = {
      id: nextId('product'),
      slug: `${slugify(String(payload.title ?? 'urun'))}-${state.seq}`,
      category: String(payload.category ?? 'other_product'),
      title: String(payload.title ?? ''),
      description: String(payload.description ?? ''),
      brand: (payload.brand as string) ?? null,
      model: (payload.model as string) ?? null,
      sizeLabel: (payload.sizeLabel as string) ?? null,
      color: (payload.color as string) ?? null,
      condition: String(payload.condition ?? 'good'),
      priceAmount: payload.priceAmount ? Number(payload.priceAmount) : null,
      priceCurrency: String(payload.priceCurrency ?? 'TRY'),
      priceType: String(payload.priceType ?? (payload.priceAmount ? 'fixed' : 'on_request')),
      priceUnit: String(payload.priceUnit ?? 'item'),
      quantity: Number(payload.quantity ?? 1),
      delivery: String(payload.delivery ?? 'pickup'),
      shippingNote: (payload.shippingNote as string) ?? null,
      city: (payload.city as string) ?? state.profile.city,
      status: 'draft',
      viewCount: 0,
      saveCount: 0,
      inquiryCount: 0,
      createdAt: now(),
    };

    state.products.unshift(product);
    await persist();
    return created({ id: product.id, slug: product.slug });
  }

  if (segments[0] === 'products' && segments[2] === 'media') {
    const productId = at(1) ?? '';

    if (method === 'GET') {
      return ok(
        state.media
          .filter((entry) => entry.horseId === productId)
          .map((entry, index) => ({
            mediaId: entry.mediaId,
            url: entry.uri,
            category: 'general',
            sortOrder: index,
            visibility: 'public',
            type: 'image',
            blurhash: null,
            width: null,
            height: null,
          })),
      );
    }

    if (method === 'POST') {
      const mediaId = String(payload.mediaId ?? '');
      const pending = state.media.find((entry) => entry.mediaId === mediaId);
      if (pending) pending.horseId = productId;
      await persist();
      return created({ attached: mediaId });
    }

    if (method === 'DELETE') {
      state.media = state.media.filter((entry) => entry.mediaId !== at(3));
      await persist();
      return noContent();
    }
  }

  if (segments[0] === 'products' && segments.length === 3 && method === 'POST') {
    const product = state.products.find((entry) => entry.id === at(1));
    if (!product) return fail(404, 'NOT_FOUND', 'Ürün bulunamadı.');

    const next = TRANSITIONS[product.status]?.[at(2) ?? ''];
    if (!next) {
      return fail(409, 'CONFLICT', `Bu ürün "${product.status}" durumundayken bu işlem yapılamaz.`);
    }

    // §3.3, mirrored from the real service. The demo account is verified, so
    // this never fires here — which is exactly why it has to exist: a demo
    // that skips a gate teaches the shape of a product that does not have one.
    if (next === 'active' && !meetsVerification(state.profile.verificationLevel, 'identity_verified')) {
      return fail(403, 'VERIFICATION_REQUIRED', 'Ürün yayınlamak için kimliğini doğrulaman gerekiyor.');
    }

    product.status = next;
    if (next === 'active') {
      product.viewCount += 3;
      notify('listing_published', `${product.title} yayında`, 'Ürünün ekipman pazarında.', {});
    }

    await persist();
    return ok({ status: next });
  }

  // ── orders ──────────────────────────────────────────────────────────────
  //
  // The same lifecycle table and the same actor rules as OrdersService, and
  // that duplication is deliberate: a demo that lets a buyer press "Kargoya
  // verdim" teaches the shape of a product that does not exist. The stock
  // arithmetic is here too, because "sold out" is one of the few states a
  // demo can actually show somebody.

  if (is('orders', 'mine') && method === 'GET') {
    const side = query.get('side') === 'seller' ? 'seller' : 'buyer';

    return ok(
      state.orders
        .filter((order) => order.side === side)
        .map((order) => ({
          id: order.id,
          reference: order.reference,
          status: order.status,
          payment_status: order.paymentStatus,
          quantity: order.quantity,
          title_snapshot: order.titleSnapshot,
          unit_price_amount: String(order.unitPriceAmount),
          total_amount: String(order.totalAmount),
          currency: order.currency,
          delivery: order.delivery,
          tracking_note: order.trackingNote,
          created_at: order.createdAt,
          paid_at: order.paidAt,
          shipped_at: order.shippedAt,
          completed_at: order.completedAt,
          cancel_reason: order.cancelReason,
          product_slug: order.productSlug,
          counterparty_name: order.counterpartyName,
          counterparty_handle: order.counterpartyHandle,
        })),
    );
  }

  if (is('orders') && method === 'POST') {
    const product =
      state.products.find((entry) => entry.id === payload.productId) ??
      CATALOGUE.products.find((entry) => entry.id === payload.productId);

    if (!product) return fail(404, 'NOT_FOUND', 'Ürün bulunamadı.');

    const owned = state.products.some((entry) => entry.id === product.id);
    // The rule the real service enforces with a CHECK constraint. In the demo
    // the only listings the user owns are the ones they created here.
    if (owned) return fail(400, 'VALIDATION_ERROR', 'Kendi ürününü satın alamazsın.');

    const price = 'priceAmount' in product ? product.priceAmount : null;
    if (price === null || price === undefined) {
      return fail(
        400,
        'VALIDATION_ERROR',
        'Bu ürün "fiyat sorunuz" olarak yayınlanmış. Satıcıya yazman gerekiyor.',
      );
    }

    const wanted = Number(payload.quantity ?? 1) || 1;
    const stock = 'quantity' in product ? Number(product.quantity ?? 1) : 1;
    if (wanted > stock) return fail(400, 'VALIDATION_ERROR', 'Bu üründen istediğin adet kalmadı.');

    const order: DemoOrder = {
      id: nextId('order'),
      reference: `OH-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      productId: product.id,
      productSlug: product.slug,
      side: 'buyer',
      counterpartyName: 'sellerName' in product ? product.sellerName : 'Satıcı',
      counterpartyHandle: 'sellerHandle' in product ? product.sellerHandle : 'satici',
      quantity: wanted,
      titleSnapshot: product.title,
      unitPriceAmount: price,
      totalAmount: price * wanted,
      currency: 'priceCurrency' in product ? product.priceCurrency : 'TRY',
      delivery: 'delivery' in product ? String(product.delivery) : 'shipping',
      status: 'pending_seller',
      paymentStatus: 'none',
      trackingNote: null,
      cancelReason: null,
      createdAt: now(),
      paidAt: null,
      shippedAt: null,
      completedAt: null,
    };

    state.orders.unshift(order);
    notify('order_placed', 'Siparişin alındı', `${order.reference} — satıcı onayı bekleniyor.`, {
      orderId: order.id,
    });

    // The demo has no second person to press "Onayla", so the catalogue seller
    // answers on a timer the way `autoReply` answers a message. Without it the
    // buy flow dead-ends at the first step and nobody ever sees the payment
    // screen.
    setTimeout(() => {
      void (async () => {
        const live = getState().orders.find((entry) => entry.id === order.id);
        if (!live || live.status !== 'pending_seller') return;
        live.status = 'awaiting_payment';
        notify('order_update', 'Siparişin onaylandı', `${live.reference} — ödeyebilirsin.`, {
          orderId: live.id,
        });
        await persist();
      })();
    }, 1200);

    await persist();
    return created({ id: order.id, reference: order.reference, total: order.totalAmount });
  }

  if (segments[0] === 'orders' && segments.length === 2 && method === 'GET') {
    const order = state.orders.find((entry) => entry.id === at(1));
    if (!order) return fail(404, 'NOT_FOUND', 'Sipariş bulunamadı.');
    return ok({ ...order });
  }

  if (segments[0] === 'orders' && segments.length === 3 && method === 'POST') {
    const order = state.orders.find((entry) => entry.id === at(1));
    if (!order) return fail(404, 'NOT_FOUND', 'Sipariş bulunamadı.');

    const action = at(2) ?? '';

    if (action === 'pay') {
      if (order.status !== 'awaiting_payment') {
        return fail(409, 'CONFLICT', 'Bu sipariş şu anda ödenebilir durumda değil.');
      }

      order.status = 'paid';
      order.paymentStatus = 'paid';
      order.paidAt = now();

      // Stock moves here, as it does in `pay_product_order`, so a demo buyer
      // watching the last unit go sees the listing turn sold.
      const owned = state.products.find((entry) => entry.id === order.productId);
      if (owned) {
        owned.quantity = Math.max(owned.quantity - order.quantity, 0);
        if (owned.quantity === 0) owned.status = 'sold';
      }

      notify('order_paid', 'Ödeme alındı', `${order.reference} — satıcı kargoya verecek.`, {
        orderId: order.id,
      });

      // And the seller ships, on the same reasoning as the auto-accept above.
      setTimeout(() => {
        void (async () => {
          const live = getState().orders.find((entry) => entry.id === order.id);
          if (!live || live.status !== 'paid') return;
          live.status = 'shipped';
          live.shippedAt = now();
          live.trackingNote = 'Demo Kargo 1234567890';
          notify('order_update', 'Siparişin yolda', `${live.reference} — satıcı gönderdi.`, {
            orderId: live.id,
          });
          await persist();
        })();
      }, 2000);

      await persist();
      return ok({ status: 'paid', remaining: owned?.quantity ?? 0, provider: 'demo' });
    }

    const TRANSITIONS: Record<string, Record<string, { to: string; by: 'buyer' | 'seller' }>> = {
      pending_seller: {
        accept: { to: 'awaiting_payment', by: 'seller' },
        reject: { to: 'cancelled', by: 'seller' },
      },
      paid: { ship: { to: 'shipped', by: 'seller' } },
      shipped: { confirm: { to: 'completed', by: 'buyer' } },
    };

    if (action === 'cancel') {
      if (['cancelled', 'refunded', 'completed'].includes(order.status)) {
        return fail(409, 'CONFLICT', 'Bu sipariş artık iptal edilemez.');
      }

      const refunding = order.paymentStatus === 'paid';
      if (refunding) {
        const owned = state.products.find((entry) => entry.id === order.productId);
        if (owned) {
          owned.quantity += order.quantity;
          if (owned.status === 'sold') owned.status = 'active';
        }
        order.paymentStatus = 'refunded';
      }

      order.status = refunding ? 'refunded' : 'cancelled';
      order.cancelReason = (payload.reason as string) ?? null;
      await persist();
      return ok({ status: order.status });
    }

    const rule = TRANSITIONS[order.status]?.[action];
    if (!rule) {
      return fail(409, 'CONFLICT', `Bu sipariş "${order.status}" durumundayken bu işlem yapılamaz.`);
    }

    if (rule.by !== order.side) {
      return fail(
        403,
        'FORBIDDEN',
        rule.by === 'seller'
          ? 'Bu işlemi yalnızca satıcı yapabilir.'
          : 'Bu işlemi yalnızca alıcı yapabilir.',
      );
    }

    order.status = rule.to;
    if (rule.to === 'shipped') order.shippedAt = now();
    if (rule.to === 'completed') order.completedAt = now();

    await persist();
    return ok({ status: rule.to });
  }

  if (segments[0] === 'products' && segments.length === 2 && method === 'GET') {
    const own = state.products.find((entry) => entry.slug === at(1) || entry.id === at(1));

    if (own) {
      own.viewCount += 1;
      const hit = ownProductHits().find((entry) => entry.id === own.id);

      return ok({
        ...(hit ?? {}),
        id: own.id,
        slug: own.slug,
        title: own.title,
        description: own.description,
        shippingNote: own.shippingNote,
        color: own.color,
        status: own.status,
        viewCount: own.viewCount,
        sellerProfileId: state.profile.id,
        images: state.media.filter((entry) => entry.horseId === own.id).map((entry) => entry.uri),
      });
    }

    const catalogue = CATALOGUE.products.find((entry) => entry.slug === at(1));
    if (!catalogue) return fail(404, 'NOT_FOUND', 'Ürün bulunamadı.');

    return ok({
      ...catalogue,
      description:
        'Bu ürün örnek veridir. Demo modunda satıcıya yazabilir, konuşmanın nasıl açıldığını görebilirsin.',
      shippingNote: null,
      color: null,
      status: 'active',
      viewCount: 12,
      sellerProfileId: 'demo-seller-1',
      images: [],
    });
  }

  // ── services, jobs, professionals ───────────────────────────────────────
  if (is('services', 'search')) return ok(CATALOGUE.services);

  if (segments[0] === 'services' && segments.length === 2 && method === 'GET') {
    const service = CATALOGUE.services.find((entry) => entry.slug === at(1));
    if (!service) return fail(404, 'NOT_FOUND', 'Hizmet bulunamadı.');

    return ok({
      ...service,
      description:
        'Bu hizmet örnek veridir. Demo modunda mesaj gönderebilir, konuşmanın nasıl açıldığını görebilirsin.',
      price_min: service.priceMin,
      price_max: service.priceMax,
      price_unit: service.priceUnit,
      category_name_tr:
        CATALOGUE.disciplines.find((entry) => entry.code === service.category)?.name ??
        service.category,
      is_mobile: service.isMobile,
      service_radius_km: service.serviceRadiusKm,
      availability_note: null,
      provider_id: service.providerId,
      provider_handle: 'ege-atli-spor',
      provider_name: service.providerName,
      verification_level: service.providerVerification,
      trust_score: service.providerTrustScore,
      rating_average: service.ratingAverage,
      rating_count: service.ratingCount,
      organization_name: service.organizationName,
    });
  }

  if (is('jobs', 'search')) return ok(CATALOGUE.jobs);

  if (segments[0] === 'jobs' && segments.length === 2 && method === 'GET') {
    const job = CATALOGUE.jobs.find((entry) => entry.slug === at(1));
    if (!job) return fail(404, 'NOT_FOUND', 'İlan bulunamadı.');

    return ok({
      ...job,
      description:
        'Bu iş ilanı örnek veridir. Demo modunda başvurabilir, başvurunun nasıl göründüğünü görebilirsin.',
      responsibilities: null,
      requirements: null,
      job_type: job.jobType,
      roles_needed: job.rolesNeeded,
      country_code: job.countryCode,
      salary_min: job.salaryMin,
      salary_max: job.salaryMax,
      salary_currency: job.salaryCurrency,
      salary_period: job.salaryPeriod,
      meals_included: job.mealsIncluded,
      visa_support: job.visaSupport,
      experience_years_min: job.experienceYearsMin,
      start_date: null,
      organization_name: job.organizationName,
      poster_name: job.posterName,
      application_count: job.applicationCount,
    });
  }

  if (segments[0] === 'jobs' && segments[2] === 'apply' && method === 'POST') {
    state.applications.push({
      jobSlug: at(1) ?? '',
      coverLetter: String(payload.coverLetter ?? ''),
      createdAt: now(),
    });
    notify('application', 'Başvurun alındı', 'İşveren yanıtladığında haber vereceğiz.', {});
    await persist();
    return created({ id: nextId('application') });
  }

  if (is('professionals', 'search')) {
    return ok([
      {
        id: 'demo-pro-1',
        handle: 'nalbant-usta',
        displayName: 'Nalbant Usta',
        avatar: null,
        roles: ['farrier'],
        headline: 'Ortopedik nallama uzmanı',
        specialties: [],
        disciplines: [],
        languages: ['tr'],
        yearsExperience: 14,
        countryCode: 'TR',
        region: 'Ankara',
        city: 'Ankara',
        distanceKm: null,
        travels: true,
        serviceRadiusKm: 120,
        verificationLevel: 'professional_verified',
        trustScore: 71,
        ratingAverage: 4.8,
        ratingCount: 23,
      },
      {
        id: 'demo-pro-2',
        handle: 'vet-deniz',
        displayName: 'Vet. Dr. Deniz Arslan',
        avatar: null,
        roles: ['veterinarian'],
        headline: 'At sağlığı ve satış öncesi muayene',
        specialties: [],
        disciplines: [],
        languages: ['tr', 'en'],
        yearsExperience: 9,
        countryCode: 'TR',
        region: 'İstanbul',
        city: 'İstanbul',
        distanceKm: null,
        travels: true,
        serviceRadiusKm: 80,
        verificationLevel: 'professional_verified',
        trustScore: 68,
        ratingAverage: 4.9,
        ratingCount: 11,
      },
    ]);
  }

  // ── messaging ───────────────────────────────────────────────────────────
  if (is('conversations') && method === 'GET') {
    return ok(
      state.conversations.map((conversation) => {
        const messages = state.messages.filter(
          (message) => message.conversationId === conversation.id,
        );
        const last = messages.at(-1);

        return {
          id: conversation.id,
          contextType: conversation.contextType,
          contextId: conversation.contextId,
          contextTitle: conversation.contextTitle,
          counterpartId: conversation.counterpartId,
          counterpartName: conversation.counterpartName,
          lastMessageAt: last?.createdAt ?? null,
          lastMessageBody: last?.body ?? null,
          unread: !!last && (!conversation.lastReadAt || last.createdAt > conversation.lastReadAt),
          isArchived: false,
          blocked: false,
        };
      }),
    );
  }

  if (is('conversations') && method === 'POST') {
    const contextId = (payload.contextId as string) ?? null;
    const participantId = String(payload.participantId ?? 'demo-seller-1');

    // §16: one thread per counterparty per subject. Tapping "message" twice
    // must land back in the conversation you already have.
    let conversation = state.conversations.find(
      (entry) => entry.counterpartId === participantId && entry.contextId === contextId,
    );

    if (!conversation) {
      const subject =
        state.listings.find((listing) => listing.id === contextId)?.title ??
        CATALOGUE.listings.find((listing) => listing.id === contextId)?.title ??
        CATALOGUE.services.find((service) => service.id === contextId)?.title ??
        null;

      conversation = {
        id: nextId('thread'),
        counterpartName:
          CATALOGUE.services.find((service) => service.providerId === participantId)
            ?.providerName ?? 'Ege Atlı Spor Kulübü',
        counterpartId: participantId,
        contextType: String(payload.contextType ?? 'listing'),
        contextId,
        contextTitle: subject,
        lastReadAt: null,
      };

      state.conversations.unshift(conversation);
    }

    const message = {
      id: nextId('msg'),
      conversationId: conversation.id,
      body: String(payload.firstMessage ?? ''),
      fromMe: true,
      isSystem: false,
      createdAt: now(),
    };

    state.messages.push(message);
    autoReply(conversation, message.body);
    await persist();

    return created({ conversationId: conversation.id, messageId: message.id });
  }

  if (segments[0] === 'conversations' && segments.length === 2 && method === 'GET') {
    const conversation = state.conversations.find((entry) => entry.id === at(1));
    if (!conversation) return fail(404, 'NOT_FOUND', 'Konuşma bulunamadı.');

    conversation.lastReadAt = now();
    await persist();

    return ok(
      state.messages
        .filter((message) => message.conversationId === conversation.id)
        .map((message) => ({
          id: message.id,
          sender_id: message.fromMe ? state.profile.id : conversation.counterpartId,
          sender_name: message.fromMe ? state.profile.displayName : conversation.counterpartName,
          body: message.body,
          attachment: null,
          is_system: message.isSystem,
          // §16's warning fires on the content, not on a flag someone set.
          payment_warning: /kapora|havale|iban|eft|para gönder/i.test(message.body),
          created_at: message.createdAt,
        })),
    );
  }

  if (segments[0] === 'conversations' && segments[2] === 'messages' && method === 'POST') {
    const conversation = state.conversations.find((entry) => entry.id === at(1));
    if (!conversation) return fail(404, 'NOT_FOUND', 'Konuşma bulunamadı.');

    const message = {
      id: nextId('msg'),
      conversationId: conversation.id,
      body: String(payload.body ?? ''),
      fromMe: true,
      isSystem: false,
      createdAt: now(),
    };

    state.messages.push(message);
    autoReply(conversation, message.body);
    await persist();
    return created({ id: message.id });
  }

  // ── saved ───────────────────────────────────────────────────────────────
  if (is('saved') && method === 'GET') {
    return ok(
      state.saved.map((entry) => ({
        item_type: entry.itemType,
        item_id: entry.itemId,
        note: entry.note,
        created_at: entry.createdAt,
        title: entry.title,
        slug: entry.slug,
        subtitle: entry.subtitle,
        is_available: entry.isAvailable,
      })),
    );
  }

  if (is('saved') && method === 'POST') {
    const itemId = String(payload.itemId ?? '');
    const hit =
      ownListingHits().find((entry) => entry.id === itemId) ??
      CATALOGUE.listings.find((entry) => entry.id === itemId);

    if (!state.saved.some((entry) => entry.itemId === itemId)) {
      state.saved.unshift({
        itemType: String(payload.itemType ?? 'listing'),
        itemId,
        title: hit?.title ?? 'İlan',
        subtitle: hit
          ? `${SEX_LABEL_TR[hit.sex] ?? hit.sex}${hit.city ? ` · ${hit.city}` : ''}`
          : null,
        slug: hit?.slug ?? null,
        note: (payload.note as string) ?? null,
        createdAt: now(),
        isAvailable: true,
      });
    }

    await persist();
    return created({ saved: true });
  }

  if (segments[0] === 'saved' && segments.length === 3 && method === 'DELETE') {
    state.saved = state.saved.filter((entry) => entry.itemId !== at(2));
    await persist();
    return noContent();
  }

  // ── saved searches ──────────────────────────────────────────────────────
  if (is('saved-searches') && method === 'GET') {
    return ok(
      state.savedSearches.map((entry) => ({
        id: entry.id,
        name: entry.name,
        entity: entry.entity,
        query: entry.query,
        alert_channel: entry.alertChannel,
        alert_frequency: entry.alertFrequency,
        last_run_at: null,
        created_at: entry.createdAt,
      })),
    );
  }

  if (is('saved-searches') && method === 'POST') {
    const entry = {
      id: nextId('search'),
      name: String(payload.name ?? 'Arama'),
      entity: String(payload.entity ?? 'listings'),
      query: (payload.query as Record<string, unknown>) ?? {},
      alertChannel: ['push'],
      alertFrequency: 'instant',
      createdAt: now(),
    };

    state.savedSearches.unshift(entry);
    notify('saved_search', `“${entry.name}” kaydedildi`, 'Yeni eşleşmede haber vereceğiz.', {});
    await persist();
    return created({ id: entry.id });
  }

  if (segments[0] === 'saved-searches' && segments.length === 2) {
    const entry = state.savedSearches.find((search) => search.id === at(1));
    if (!entry) return fail(404, 'NOT_FOUND', 'Arama bulunamadı.');

    if (method === 'PATCH') {
      if (typeof payload.alertFrequency === 'string') entry.alertFrequency = payload.alertFrequency;
      if (typeof payload.name === 'string') entry.name = payload.name;
      await persist();
      return noContent();
    }

    if (method === 'DELETE') {
      state.savedSearches = state.savedSearches.filter((search) => search.id !== at(1));
      await persist();
      return noContent();
    }
  }

  // ── notifications, reports ──────────────────────────────────────────────
  if (is('notifications') && method === 'GET') {
    const unreadOnly = query.get('unreadOnly') === 'true';
    return ok(
      state.notifications.filter((entry) => (unreadOnly ? !entry.readAt : true)),
    );
  }

  if (is('notifications', 'read-all') && method === 'POST') {
    state.notifications.forEach((entry) => {
      entry.readAt = entry.readAt ?? now();
    });
    await persist();
    return noContent();
  }

  if (is('reports') && method === 'POST') {
    state.reports.push({
      targetType: String(payload.targetType ?? ''),
      targetId: String(payload.targetId ?? ''),
      reason: String(payload.reason ?? ''),
      createdAt: now(),
    });
    await persist();
    return created({ id: nextId('report') });
  }

  return {
    status: 501,
    body: {
      error: {
        code: 'DEMO_UNSUPPORTED',
        message: `Bu işlem demo modunda yok (${method} ${rawPath}).`,
      },
    },
  };
}
