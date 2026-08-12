#!/usr/bin/env node
/**
 * Development seed — spec §25.
 *
 * "Use deterministic seeding (faker with a fixed seed) so screenshots and
 * tests are reproducible."
 *
 * Determinism here comes from a seeded PRNG and curated name lists rather than
 * faker: the same seed produces the same database on every machine, and the
 * names are actually plausible for the launch region instead of generically
 * Western. Re-running with the same seed is idempotent — the script clears the
 * rows it owns first.
 *
 *   node apps/api/scripts/seed-dev.mjs [--listings 500] [--seed 20260812]
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const args = new Map(
  process.argv.slice(2).flatMap((arg, index, all) =>
    arg.startsWith('--') ? [[arg.slice(2), all[index + 1]]] : [],
  ),
);

const LISTING_COUNT = Number(args.get('listings') ?? 500);
const SEED = Number(args.get('seed') ?? 20260812);

const connectionString =
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL ??
  'postgresql://postgres@localhost:5432/only_horses';

/** mulberry32 — small, fast, and identical across runs. */
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = makeRandom(SEED);
const pick = (list) => list[Math.floor(random() * list.length)];
const pickMany = (list, count) => {
  const pool = [...list];
  const chosen = [];
  for (let i = 0; i < count && pool.length > 0; i += 1) {
    chosen.push(...pool.splice(Math.floor(random() * pool.length), 1));
  }
  return chosen;
};
const between = (min, max) => min + random() * (max - min);
const intBetween = (min, max) => Math.floor(between(min, max + 1));

const FIRST_NAMES = [
  'Ayşe', 'Mehmet', 'Zeynep', 'Mustafa', 'Elif', 'Ahmet', 'Fatma', 'Emre',
  'Selin', 'Burak', 'Deniz', 'Can', 'Ece', 'Kerem', 'Merve', 'Onur',
  'Sofia', 'Lucas', 'Anna', 'Marco', 'Elena', 'Jan', 'Laura', 'Diego',
];
const LAST_NAMES = [
  'Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Aydın', 'Öztürk',
  'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'García', 'Müller', 'Rossi', 'Novak',
];
const HORSE_NAMES = [
  'Luna', 'Rüzgar', 'Şimşek', 'Yıldız', 'Kartal', 'Zümrüt', 'Poyraz', 'Kısmet',
  'Bora', 'Efsane', 'Sultan', 'Doru', 'Kula', 'Yakut', 'Ateş', 'Kuzey',
  'Bellona', 'Cassio', 'Diva', 'Estrella', 'Falcon', 'Gitano', 'Halcyon', 'Indigo',
  'Jazz', 'Kismet', 'Lyra', 'Mistral', 'Nova', 'Orion', 'Piaffe', 'Quixote',
];
const COLORS = ['doru', 'kır', 'yağız', 'al', 'kula', 'demirkır', 'siyah', 'kestane'];
const TRAINING_LEVELS = ['başlangıç', 'temel', 'orta', 'ileri', 'yarışma'];
const RIDER_LEVELS = ['yeni başlayan', 'orta', 'ileri', 'profesyonel'];

const LOCATIONS = [
  { country: 'TR', region: 'Ankara', city: 'Ankara', lat: 39.9334, lng: 32.8597, weight: 22 },
  { country: 'TR', region: 'İstanbul', city: 'İstanbul', lat: 41.0082, lng: 28.9784, weight: 20 },
  { country: 'TR', region: 'İzmir', city: 'İzmir', lat: 38.4237, lng: 27.1428, weight: 12 },
  { country: 'TR', region: 'Bursa', city: 'Bursa', lat: 40.1826, lng: 29.0665, weight: 8 },
  { country: 'TR', region: 'Antalya', city: 'Antalya', lat: 36.8969, lng: 30.7133, weight: 8 },
  { country: 'TR', region: 'Kayseri', city: 'Kayseri', lat: 38.7312, lng: 35.4787, weight: 5 },
  { country: 'TR', region: 'Konya', city: 'Konya', lat: 37.8746, lng: 32.4932, weight: 5 },
  { country: 'ES', region: 'Andalucía', city: 'Sevilla', lat: 37.3891, lng: -5.9845, weight: 7 },
  { country: 'DE', region: 'Niedersachsen', city: 'Verden', lat: 52.9226, lng: 9.2306, weight: 7 },
  { country: 'NL', region: 'Noord-Brabant', city: 'Eindhoven', lat: 51.4416, lng: 5.4697, weight: 6 },
];

/** Price is driven by breed group, age and training level, not by chance alone. */
const BREED_PRICE_BAND = {
  warmblood: [12000, 90000],
  thoroughbred: [8000, 60000],
  arabian: [6000, 45000],
  iberian: [10000, 70000],
  baroque: [12000, 80000],
  stock: [5000, 35000],
  gaited: [4000, 25000],
  native_tr: [2500, 18000],
  asian: [5000, 40000],
  pony: [2000, 15000],
  draft: [3000, 20000],
  other: [3000, 25000],
};

const DISCIPLINES_BY_GROUP = {
  warmblood: ['show_jumping', 'dressage', 'eventing', 'hunter'],
  thoroughbred: ['racing_flat', 'eventing', 'show_jumping'],
  arabian: ['endurance', 'dressage', 'leisure', 'racing_flat'],
  iberian: ['dressage', 'working_equitation', 'leisure'],
  baroque: ['dressage', 'driving', 'leisure'],
  stock: ['reining', 'western_pleasure', 'cutting', 'barrel_racing', 'trail'],
  gaited: ['gaited', 'trail', 'leisure'],
  native_tr: ['rahvan', 'cirit', 'leisure', 'trail'],
  asian: ['endurance', 'leisure', 'polo'],
  pony: ['show_jumping', 'equitation', 'leisure'],
  draft: ['driving', 'leisure'],
  other: ['leisure', 'trail'],
};

function weightedLocation() {
  const total = LOCATIONS.reduce((sum, location) => sum + location.weight, 0);
  let roll = random() * total;
  for (const location of LOCATIONS) {
    roll -= location.weight;
    if (roll <= 0) return location;
  }
  return LOCATIONS[0];
}

function slugify(value, suffix) {
  const turkish = { ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g', ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c' };
  const base = value
    .replace(/[ıİşŞğĞüÜöÖçÇ]/g, (char) => turkish[char] ?? char)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  // The 'seed' marker survives orphaning: once an account is deleted its
  // horses keep the slug but lose created_by (§24.14, migration 0027), so a
  // cleanup keyed on the creator can no longer find them. The slug can.
  return `${base}-seed${suffix}`;
}

async function main() {
  const client = new pg.Client({ connectionString });
  await client.connect();

  console.log(`· seeding ${LISTING_COUNT} listings (seed ${SEED})`);

  const breeds = (await client.query('SELECT code, group_code FROM breeds WHERE code <> $1', ['unknown'])).rows;
  if (breeds.length === 0) throw new Error('Reference data missing — run `pnpm seed:ref` first.');

  // Idempotent: clear what previous runs of this script created. Identified by
  // the seed email domain so a developer's own test data survives.
  //
  // Horses go first and explicitly. Since migration 0027 a deleted account
  // leaves its horses orphaned rather than blocking the delete (§24.14), so
  // dropping only the users would strand the previous run's horses and their
  // slugs — which are globally unique.
  console.log('· clearing previous seed data');
  await client.query(`DELETE FROM horses WHERE slug LIKE '%-seed%'`);
  await client.query(`
    DELETE FROM auth.users WHERE email LIKE '%@seed.onlyhorses.test'
  `);
  await client.query(`DELETE FROM search_documents WHERE collection = 'listings'`);
  await client.query(`DELETE FROM search_outbox WHERE processed_at IS NULL`);

  const sellerCount = Math.max(20, Math.round(LISTING_COUNT / 4));
  const sellers = [];

  console.log(`· ${sellerCount} sellers`);
  for (let i = 0; i < sellerCount; i += 1) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const location = weightedLocation();

    // §14.1: most active sellers are identity verified, because §3.3 makes it
    // a precondition for publishing at all. A few sit lower so the search
    // filter "sadece doğrulanmış" has something to exclude.
    const verification = random() < 0.85
      ? 'identity_verified'
      : random() < 0.5
        ? 'business_verified'
        : 'phone_verified';

    const userId = randomUUID();
    await client.query(
      `INSERT INTO auth.users (id, firebase_uid, email, email_confirmed_at)
       VALUES ($1::uuid, $2, $3, now())`,
      [userId, userId, `seller${i}@seed.onlyhorses.test`],
    );

    await client.query(
      `INSERT INTO profiles (id, handle, display_name, verification_level, country_code,
                             region, city, locale, preferred_currency, created_at,
                             response_rate, trust_score)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now() - ($10::int || ' days')::interval, $11, $12)`,
      [
        userId,
        slugify(`${first} ${last}`, i),
        `${first} ${last}`,
        verification,
        location.country,
        location.region,
        location.city,
        location.country === 'TR' ? 'tr' : 'en',
        location.country === 'TR' ? 'TRY' : 'EUR',
        intBetween(30, 900),
        random() < 0.7 ? Number(between(0.6, 1).toFixed(3)) : null,
        intBetween(20, 95),
      ],
    );

    sellers.push({ id: userId, location, verification });
  }

  console.log(`· ${LISTING_COUNT} horses and listings`);

  // §25's mix: 70% sale, 15% lease, 10% half-lease, 5% stud.
  const typeFor = (roll) =>
    roll < 0.7 ? 'sale' : roll < 0.85 ? 'lease' : roll < 0.95 ? 'half_lease' : 'stud';

  let created = 0;

  for (let i = 0; i < LISTING_COUNT; i += 1) {
    const seller = pick(sellers);
    const breed = pick(breeds);
    const group = breed.group_code ?? 'other';
    const location = random() < 0.75 ? seller.location : weightedLocation();

    const listingType = typeFor(random());
    // Stud listings are stallions by definition; the rest skew to geldings and
    // mares the way a real market does.
    const sex =
      listingType === 'stud'
        ? 'stallion'
        : pick(['mare', 'gelding', 'gelding', 'mare', 'stallion', 'filly', 'colt']);

    const ageYears = intBetween(3, 18);
    const dateOfBirth = new Date(Date.UTC(new Date().getUTCFullYear() - ageYears, intBetween(0, 11), intBetween(1, 28)));

    const heightCm = Number(between(group === 'pony' ? 120 : 150, group === 'pony' ? 148 : 178).toFixed(1));
    const trainingLevel = pick(TRAINING_LEVELS);
    const disciplines = pickMany(DISCIPLINES_BY_GROUP[group] ?? DISCIPLINES_BY_GROUP.other, intBetween(1, 3));

    const [priceFloor, priceCeiling] = BREED_PRICE_BAND[group] ?? BREED_PRICE_BAND.other;
    // Price rises with training level and peaks in a horse's prime years.
    const levelFactor = 0.6 + TRAINING_LEVELS.indexOf(trainingLevel) * 0.22;
    const ageFactor = ageYears < 5 ? 0.8 : ageYears > 15 ? 0.5 : 1;
    const basePrice = between(priceFloor, priceCeiling) * levelFactor * ageFactor;

    const currency = location.country === 'TR' ? 'TRY' : 'EUR';
    const priceAmount = currency === 'TRY' ? Math.round(basePrice / 0.027 / 1000) * 1000 : Math.round(basePrice / 500) * 500;
    const priceType = random() < 0.08 ? 'on_request' : random() < 0.3 ? 'negotiable' : 'fixed';

    const horseName = `${pick(HORSE_NAMES)}${random() < 0.25 ? ` ${pick(['du Ciel', 'van Dijk', 'de Oro', 'Bey', 'Star'])}` : ''}`;
    const horseId = randomUUID();
    const qualityScore = intBetween(45, 100);

    await client.query(
      `INSERT INTO horses (id, slug, name, sex, breed_id, color, height_cm, date_of_birth,
                           disciplines, training_level, rider_level_min, temperament_score,
                           current_country, current_region, current_city, location,
                           location_precision, owner_profile_id, created_by,
                           visibility_health, about)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
               ST_SetSRID(ST_MakePoint($16,$17),4326)::geography, 'city', $18,$18,$19,$20)`,
      [
        horseId,
        slugify(horseName, i),
        horseName,
        sex,
        breed.code,
        pick(COLORS),
        heightCm,
        dateOfBirth.toISOString().slice(0, 10),
        disciplines,
        trainingLevel,
        pick(RIDER_LEVELS),
        intBetween(2, 9),
        location.country,
        location.region,
        location.city,
        // Jittered so seeded horses do not stack on one coordinate; the index
        // stores city-level precision anyway (§2 visibility contract).
        location.lng + between(-0.25, 0.25),
        location.lat + between(-0.25, 0.25),
        seller.id,
        random() < 0.7 ? 'on_request' : 'public',
        `${ageYears} yaşında ${sex === 'mare' ? 'kısrak' : sex === 'stallion' ? 'aygır' : 'iğdiş'}. ` +
          `${trainingLevel} seviyede, ${disciplines.join(' ve ')} için uygun. Düzenli nal ve aşı takibi yapılıyor. ` +
          'Deneme binişine açığız, satın alma öncesi veteriner muayenesini memnuniyetle karşılarız.',
      ],
    );

    await client.query(
      `INSERT INTO horse_ownership_history (horse_id, owner_profile_id, owner_name_text, from_date, verified)
       SELECT $1, $2, p.display_name, CURRENT_DATE - 200, TRUE FROM profiles p WHERE p.id = $2`,
      [horseId, seller.id],
    );

    // A share of listings carry a video and radiographs, so the §18.2 S07
    // media filters have both sides to select between.
    const hasVideo = random() < 0.45;
    const hasXray = random() < 0.2;

    for (const [index, category] of ['conformation', 'under_saddle', 'trot', ...(hasVideo ? ['canter'] : []), ...(hasXray ? ['xray'] : [])].entries()) {
      const mediaId = randomUUID();
      const isVideo = hasVideo && category === 'canter';

      await client.query(
        `INSERT INTO media (id, owner_profile_id, type, status, storage_key, mime_type,
                            width, height, blurhash, exif_stripped_at)
         VALUES ($1,$2,$3,'ready',$4,$5,$6,$7,$8, now())`,
        [
          mediaId,
          seller.id,
          isVideo ? 'video' : 'image',
          `seed/${horseId}/${index}`,
          isVideo ? 'video/mp4' : 'image/jpeg',
          isVideo ? 1920 : 1600,
          isVideo ? 1080 : 1067,
          'L6PZfSjE.AyE_3t7t7R**0o#DgR4',
        ],
      );

      await client.query(
        `INSERT INTO horse_media (horse_id, media_id, category, sort_order) VALUES ($1,$2,$3,$4)`,
        [horseId, mediaId, category, index],
      );

      if (index === 0) {
        await client.query(`UPDATE horses SET cover_media_id = $2 WHERE id = $1`, [horseId, mediaId]);
      }
    }

    const publishedDaysAgo = intBetween(0, 55);
    const isBoosted = random() < 0.06;

    await client.query(
      `INSERT INTO listings (slug, horse_id, seller_profile_id, type, status, title, summary,
                             description, price_amount, price_currency, price_type,
                             country_code, region, city, location,
                             trial_allowed, ppe_welcome, transport_help,
                             quality_score, is_boosted, boost_expires_at,
                             published_at, expires_at, view_count, save_count, inquiry_count)
       VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$8,$9,$10,$11,$12,$13,
               ST_SetSRID(ST_MakePoint($14,$15),4326)::geography,
               $16,$17,$18,$19,$20,$21,
               now() - ($22::int || ' days')::interval,
               now() + ((60 - $22::int) || ' days')::interval,
               $23,$24,$25)`,
      [
        slugify(`${horseName} ${listingType}`, i),
        horseId,
        seller.id,
        listingType,
        `${horseName} — ${ageYears} yaşında ${sex === 'mare' ? 'kısrak' : sex === 'stallion' ? 'aygır' : 'iğdiş'}`,
        `${trainingLevel} seviye, ${disciplines[0]} için uygun`,
        `${horseName}, ${location.city} bölgesinde. ${trainingLevel} seviyede eğitimli, ` +
          `${disciplines.join(', ')} çalışıyor. Sakin mizaçlı, ayak bakımı ve aşıları güncel. ` +
          'Ciddi alıcılar için deneme binişi ve satın alma öncesi veteriner muayenesi mümkündür. ' +
          'Nakliye konusunda yardımcı olabiliriz.',
        priceType === 'on_request' ? null : priceAmount,
        currency,
        priceType,
        location.country,
        location.region,
        location.city,
        location.lng + between(-0.25, 0.25),
        location.lat + between(-0.25, 0.25),
        random() < 0.85,
        random() < 0.9,
        random() < 0.4,
        qualityScore,
        isBoosted,
        isBoosted ? new Date(Date.now() + 7 * 86400000) : null,
        publishedDaysAgo,
        intBetween(5, 900),
        intBetween(0, 60),
        intBetween(0, 25),
      ],
    );

    created += 1;
    if (created % 100 === 0) console.log(`  ${created}/${LISTING_COUNT}`);
  }

  const outbox = await client.query(
    `SELECT count(*) AS pending FROM search_outbox WHERE processed_at IS NULL`,
  );

  console.log(`✓ seeded ${created} listings`);
  console.log(`· ${outbox.rows[0].pending} search_outbox rows pending — run the indexer to make them searchable`);

  await client.end();
}

main().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
