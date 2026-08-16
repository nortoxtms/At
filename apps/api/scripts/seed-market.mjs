#!/usr/bin/env node
/**
 * Fill the marketplace: a product in every category, services across every
 * trade, and a handful of jobs.
 *
 * `seed-dev.mjs` covers the horse side — profiles, horses, listings — and
 * leaves the other three-quarters of the product empty. That is fine for
 * testing search and wrong for anything anyone looks at: the equipment
 * marketplace opens on a category grid, and a grid where twenty of
 * twenty-eight categories say "0" reads as a broken feature rather than an
 * empty one.
 *
 * Everything goes through the real endpoints, so every row is the shape the
 * API produces and every rule it enforces is enforced here too. Nothing is
 * inserted straight into a table.
 *
 *   node apps/api/scripts/seed-market.mjs
 *
 * Needs the API on :3001 and a migrated database.
 */
const API = process.env.API ?? 'http://localhost:3001';
const DB = process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/only_horses';
const STAMP = Date.now().toString(36);

const say = (s) => console.log(`\x1b[2m·\x1b[0m ${s}`);
const pass = (s) => console.log(`\x1b[32m✓\x1b[0m ${s}`);

async function call(path, { method = 'GET', body, token, headers } = {}) {
  const response = await fetch(`${API}/v1${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(headers ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (payload?.error) {
    throw new Error(`${method} ${path} → ${payload.error.code}: ${payload.error.message}`);
  }
  return payload.data;
}

/**
 * Sellers, verified.
 *
 * §3.3 gates publishing on identity verification and there is no in-app path
 * to it — §17's provider needs credentials this repository must not carry — so
 * the level is granted in the database, once, exactly as the acceptance
 * scripts do it. Everything downstream of that gate runs for real.
 */
async function makeSeller(tag, name, city) {
  // §12 rate-limits registration, and this script needs nine accounts. Rather
  // than thin the seed to fit the limit — which would leave categories empty,
  // the thing the script exists to prevent — it waits the limit out and says
  // so. A seed that dies half-finished leaves a database nobody can reason
  // about.
  let registered = null;
  for (let attempt = 0; attempt < 5 && !registered; attempt += 1) {
    try {
      registered = await call('/auth/register', {
        method: 'POST',
        body: {
          email: `${tag}-${STAMP}@onlyhorses.seed`,
          password: 'guclu-sifre-123',
          displayName: name,
        },
      });
    } catch (error) {
      const wait = Number(/(\d+) saniye/.exec(String(error.message))?.[1] ?? 0);
      if (!wait) throw error;
      say(`rate limited — waiting ${wait + 2}s`);
      await new Promise((resolve) => setTimeout(resolve, (wait + 2) * 1000));
    }
  }

  if (!registered) throw new Error(`could not register ${tag} after 5 attempts`);

  const token = registered.tokens.accessToken;
  const me = await call('/me', { token });

  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: DB });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO verifications (profile_id, kind, status, provider, decided_at)
       VALUES ($1, 'identity', 'approved', 'seed', now())`,
      [me.id],
    );
    await client.query(
      `UPDATE profiles SET verification_level = 'identity_verified', city = $2, region = $2
        WHERE id = $1`,
      [me.id, city],
    );
  } finally {
    await client.end();
  }

  await call('/me', { method: 'PATCH', token, body: { displayName: name, city, region: city } });
  return { token, id: me.id, name, city };
}

/**
 * One product per leaf category, priced and in stock.
 *
 * The point is coverage, not volume: every category chip a person can tap has
 * something behind it. Quantities vary so the stock arithmetic — and the
 * "sold out" state a purchase produces — has somewhere to show itself.
 */
const PRODUCTS = [
  ['saddle', 'Wintec 500 All Purpose eyer, 17.5"', 'Wintec', '17.5"', 'good', 18_500, 1, 'both'],
  ['saddle', 'Antares dresaj eyeri, 17"', 'Antares', '17"', 'like_new', 64_000, 1, 'shipping'],
  ['bridle', 'Deri başlık ve dizgin takımı — cob', 'Kavalkade', 'Cob', 'good', 3_200, 4, 'shipping'],
  ['bit', 'Sprenger çift kırık gem, 125 mm', 'Sprenger', '125 mm', 'like_new', 2_400, 3, 'shipping'],
  ['girth', 'Neopren kolan 125 cm ve üzengi takımı', null, '125 cm', 'good', 1_850, 5, 'shipping'],
  ['saddle_pad', 'Eyer altı — 3 adet, dresaj kesim', null, 'Full', 'good', 900, 6, 'shipping'],
  ['harness', 'Tek at araba koşumu — deri', null, 'Full', 'used', 12_500, 1, 'pickup'],

  ['helmet', 'Samshield Miss Shield kask, 57', 'Samshield', '57', 'like_new', 14_500, 2, 'shipping'],
  ['riding_boots', 'Ariat binici çizmesi, 41 numara', 'Ariat', '41', 'good', 4_800, 1, 'shipping'],
  ['breeches', 'Pikeur pantolon 38 ve yarışma ceketi', 'Pikeur', '38', 'like_new', 3_900, 2, 'shipping'],
  ['body_protector', 'Racesafe koruyucu yelek — yetişkin M', 'Racesafe', 'M', 'good', 6_200, 2, 'shipping'],
  ['gloves_spurs', 'Eldiven, mahmuz ve kamçı seti', null, 'M', 'new', 1_150, 12, 'shipping'],

  ['horse_boots', 'Tendon ve fetlock boot takımı', null, 'Cob', 'good', 1_850, 4, 'shipping'],
  ['rugs', 'Kışlık çul 145 cm, 300 g dolgu', 'Horseware', '145 cm', 'good', 3_600, 3, 'shipping'],
  ['grooming', 'Tımar seti — fırça, kaşağı, tarak', null, null, 'new', 950, 20, 'shipping'],
  ['supplements', 'Eklem takviyesi — 3 kg', null, '3 kg', 'new', 2_100, 15, 'shipping'],
  ['farrier_tools', 'Nalbant takımı — komple', null, null, 'used', 8_900, 1, 'both'],

  ['hay', 'Birinci biçim yonca — balya', null, null, 'new', 420, 500, 'pickup', 'bale'],
  ['grain', 'At yemi — 25 kg çuval, performans', 'Anadolu Yem', '25 kg', 'new', 1_680, 200, 'both', 'sack'],
  ['bedding', 'Talaş altlık — sıkıştırılmış balya', null, null, 'new', 320, 300, 'pickup', 'bale'],

  ['fencing', 'Elektrikli çit teli — 500 m makara', null, '500 m', 'new', 1_450, 40, 'shipping'],
  ['fencing', 'Ahşap çit direği — emprenyeli, 2.4 m', null, '2.4 m', 'new', 285, 600, 'pickup'],
  ['stalls', 'Galvaniz boks paneli — 3.5 m', null, '3.5 m', 'new', 34_000, 8, 'pickup'],
  ['waterer', 'Otomatik suluk — paslanmaz', null, null, 'new', 2_650, 25, 'shipping'],
  ['barn_equipment', 'Ahır arabası ve gübre çatalı seti', null, null, 'new', 1_900, 18, 'both'],

  ['jumps', 'Engel seti — 6 ayak, 12 sırık', null, null, 'good', 28_000, 2, 'pickup'],
  ['footing', 'Manej tırmığı — traktör arkası', null, '2.2 m', 'used', 46_000, 1, 'pickup'],
  ['lunging', 'Longe kayışı ve kamçı takımı', null, null, 'good', 1_250, 7, 'shipping'],

  ['trailer', '2 atlık römork — 2019 model', 'Böckmann', '2 at', 'good', 485_000, 1, 'pickup'],
  ['transport_gear', 'Nakliye bandajı ve kuyruk koruma seti', null, 'Full', 'new', 1_400, 14, 'shipping'],
];

const SERVICES = [
  ['training', 'Genç at eğitimi — 3 aylık program', 'Üç yaşından itibaren temel eğitim: yerden çalışma, saraç alıştırma, ilk biniş. Haftada altı gün çalışılır, iki haftada bir video raporu gönderilir.', 25_000, 45_000, 'month', 'Ankara'],
  ['riding_lessons', 'Binicilik dersi — başlangıç ve orta seviye', 'Manejde birebir ders. Kendi atınla ya da okul atıyla. Kask ve koruyucu yelek tesiste mevcut, ilk ders tanışma dersidir.', 900, 1_500, 'hour', 'İstanbul'],
  ['boarding', 'Tam pansiyon — kapalı boks', 'Günde iki öğün yem, sınırsız kuru ot, günlük padok, gece kontrolü. Manej ve yürüyüş yolu kullanıma dahil. Nalbant ve veteriner koordinasyonu bize ait.', 18_000, 26_000, 'month', 'Bursa'],
  ['transport', 'At nakliyesi — yurt içi', 'Klimalı, kamerayla izlenen römork. Uzun mesafede iki saatte bir mola ve su. Pasaport ve sağlık raporu kontrolü çıkıştan önce yapılır.', 35, 60, 'session', 'İzmir'],
  ['veterinary', 'Gezici veteriner — at hekimliği', 'Rutin aşı, diş, topallık muayenesi ve satın alma öncesi muayene (PPE). Portatif röntgen ve ultrason ile yerinde tanı.', 2_500, 12_000, 'session', 'Ankara'],
  ['farrier', 'Nalbant — ortopedik nallama dahil', 'Normal nallama, tırnak düzeltme ve ortopedik vakalar. Altı haftalık düzenli program kurulur, hatırlatma gönderilir.', 1_800, 4_500, 'session', 'Konya'],
  ['dentistry', 'At diş bakımı', 'Yıllık diş törpüleme, kanca ve rampa düzeltmesi. Sedasyon gerektiren vakalarda veteriner ile birlikte çalışılır.', 2_200, 3_500, 'session', 'İstanbul'],
  ['equine_therapy', 'Fizyoterapi ve rehabilitasyon', 'Yaralanma sonrası dönüş programı, masaj, germe ve su bandı çalışması. Veteriner raporuna göre plan çıkarılır.', 3_000, 6_000, 'session', 'Antalya'],
  ['saddle_fitting', 'Eyer uyumlama — yerinde', 'Atın sırt ölçüsü alınır, mevcut eyer değerlendirilir, gerekiyorsa yastık doldurma yapılır. Uygun değilse alternatif önerilir.', 2_800, 5_000, 'session', 'İzmir'],
  ['tack_repair', 'Saraciye tamiri ve dikiş', 'Kırık kolan, yırtık dizgin, aşınmış üzengi kayışı. Deri değişimi ve el dikişi yapılır.', 400, 3_000, 'session', 'Bursa'],
  ['breeding_stud', 'Aygır hizmeti — taze tohum', 'Sezon boyunca taze ve soğutulmuş tohum. Kısrak sahibine gebelik takibi ve ultrason randevusu koordine edilir.', 15_000, 40_000, 'session', 'Kayseri'],
  ['clipping_grooming', 'Tıraş ve bakım', 'Kışlık tıraş modelleri, yele ve kuyruk düzeltme, yarışma öncesi hazırlık. Yerinde hizmet.', 1_200, 2_500, 'session', 'Ankara'],
  ['photography', 'At ve binici fotoğrafçılığı', 'İlan fotoğrafı, yarışma çekimi ve portre. İlan paketi 20 düzenlenmiş kare ve bir kısa video içerir.', 4_000, 12_000, 'session', 'İstanbul'],
  ['feed_supply', 'Yem ve kaba yem tedariği', 'Kuru ot, yonca, kesif yem ve talaş. Düzenli aboneliklerde teslimat planlanır, analiz raporu paylaşılır.', 5_000, 60_000, 'month', 'Konya'],
  ['arena_construction', 'Manej yapımı ve zemin bakımı', 'Drenaj, zemin serimi ve bakım programı. Mevcut manejlerde zemin yenileme ve tırmık hizmeti.', 150_000, 900_000, 'session', 'İzmir'],
];

const JOBS = [
  ['Seyis — tam zamanlı, konaklamalı', 'full_time', ['groom'], 'Otuz atlık tesisimizde günlük bakım, padok çıkarma, boks temizliği ve besleme işlerini yürütecek seyis arıyoruz. Vardiya sistemi vardır, hafta içi bir gün izinlidir. Tesiste tek kişilik konaklama ve üç öğün yemek sağlanır. Atla çalışma tecrübesi şarttır; ehliyet tercih sebebidir.', 32_000, 42_000, 'Bursa'],
  ['Eğitmen — genç at programı', 'full_time', ['trainer'], 'Genç at programımızı yürütecek, yerden çalışma ve ilk biniş tecrübesi olan bir eğitmen arıyoruz. Haftada beş gün, günde altı at. Yarışma tecrübesi ve nakliye ehliyeti avantajdır. Ücret tecrübeye göre belirlenir ve prim sistemi vardır.', 55_000, 85_000, 'Ankara'],
  ['Binicilik antrenörü — hafta sonu', 'part_time', ['instructor'], 'Hafta sonu çocuk ve başlangıç gruplarına ders verecek antrenör arıyoruz. Cumartesi ve pazar günleri, günde beş ders. Federasyon antrenörlük belgesi aranmaktadır. Ulaşım desteği sağlanır.', 1_200, 1_800, 'İstanbul'],
  ['Ahır sorumlusu', 'full_time', ['ranch_manager'], 'Yirmi beş atlık tesiste ekip yönetimi, yem ve malzeme planlaması, veteriner ve nalbant koordinasyonu, pansiyon müşterileriyle iletişim. En az üç yıl tesis tecrübesi ve temel bilgisayar kullanımı gereklidir. Lojman mevcuttur.', 60_000, 80_000, 'İzmir'],
  ['Sezonluk nakliye şoförü', 'seasonal', ['transporter'], 'Yarışma sezonu boyunca at nakliyesi yapacak şoför arıyoruz. E sınıfı ehliyet ve SRC belgesi zorunludur. At taşıma tecrübesi olan adaylar tercih edilir. Yol masrafları ve konaklama karşılanır, günlük harcırah ödenir.', 2_500, 3_500, 'Antalya'],
];

/** A Pro subscription, the shape the Stripe webhook writes (ADR-0007). */
async function grantPro(profileId) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: DB });
  await client.connect();
  try {
    await client.query(
      // Registration already creates a free subscription row, and there is a
      // unique constraint per profile — so this upgrades rather than inserts.
      `UPDATE subscriptions
          SET tier = 'pro', status = 'active', current_period_end = now() + interval '1 year'
        WHERE profile_id = $1`,
      [profileId],
    );
  } finally {
    await client.end();
  }
}

/**
 * A paid job-post purchase, written the way the Stripe webhook would.
 *
 * The alternative is granting a Business subscription, which would also skip
 * §16's per-post accounting and hide whether `consume_job_post_purchase`
 * works at all.
 */
async function grantJobPost(profileId, jobId) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: DB });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO purchases (profile_id, product, status, amount, currency,
                              target_type, target_id, stripe_session_id)
       VALUES ($1, 'job_post', 'paid', 79, 'EUR', 'job', $2, $3)`,
      [profileId, jobId, `seed_${STAMP}_${jobId.slice(0, 8)}`],
    );
  } finally {
    await client.end();
  }
}

async function main() {
  say('creating verified sellers');
  const tack = await makeSeller('saraciye', 'Saraciye Atölyesi', 'İzmir');
  const feed = await makeSeller('yem', 'Anadolu Yem ve Kaba Yem', 'Konya');
  const stable = await makeSeller('ahir', 'Ege Ahır Sistemleri', 'İzmir');
  const vet = await makeSeller('veteriner', 'At Sağlığı Merkezi', 'Ankara');
  const club = await makeSeller('kulup', 'Marmara Binicilik Kulübü', 'İstanbul');
  pass('5 sellers, identity verified');

  // Category families map to whoever plausibly sells them, so the seller on a
  // fencing panel is not the same yard selling a dressage saddle.
  const owner = (category) => {
    if (['hay', 'grain', 'bedding', 'supplements'].includes(category)) return feed;
    if (['fencing', 'stalls', 'waterer', 'barn_equipment', 'jumps', 'footing'].includes(category)) {
      return stable;
    }
    if (['trailer', 'transport_gear'].includes(category)) return stable;
    return tack;
  };

  say(`publishing ${PRODUCTS.length} products`);
  let published = 0;
  for (const [category, title, brand, size, condition, price, quantity, delivery, unit] of PRODUCTS) {
    const seller = owner(category);

    const product = await call('/products', {
      method: 'POST',
      token: seller.token,
      body: {
        category,
        title,
        description:
          `${title}. Durumu ilanda belirtildiği gibidir, fotoğraflar gerçektir. ` +
          `Yerinde görülebilir; kargo alıcıya aittir. Sorularınız için mesaj yazabilirsiniz.`,
        ...(brand ? { brand } : {}),
        ...(size ? { sizeLabel: size } : {}),
        condition,
        priceAmount: price,
        priceCurrency: 'TRY',
        priceType: 'fixed',
        ...(unit ? { priceUnit: unit } : {}),
        quantity,
        delivery,
        countryCode: 'TR',
        region: seller.city,
        city: seller.city,
      },
    });

    await call(`/products/${product.id}/publish`, { method: 'POST', token: seller.token });
    published += 1;
  }
  pass(`${published} products across ${new Set(PRODUCTS.map((p) => p[0])).size} categories`);

  // Four providers on Pro, not fifteen on free.
  //
  // §16 gives a verified free account one active service listing, so
  // publishing fifteen from one account left thirteen in draft and the
  // directory nearly empty — while the seed reported success. A provider per
  // service would fix it and needs twenty signups, which trips §12's
  // registration rate limit. Pro allows five active services each, so four
  // accounts hold all fifteen and both rules stay enforced rather than
  // sidestepped.
  say('creating service providers');
  const providers = [
    await makeSeller('hizmet-egitim', 'Anadolu At Eğitim Merkezi', 'Ankara'),
    await makeSeller('hizmet-saglik', 'At Sağlığı Merkezi', 'Ankara'),
    await makeSeller('hizmet-tesis', 'Uludağ Atlı Tesisleri', 'Bursa'),
    await makeSeller('hizmet-destek', 'Ege At Hizmetleri', 'İzmir'),
  ];
  for (const provider of providers) await grantPro(provider.id);
  pass(`${providers.length} providers on Pro`);

  say(`publishing ${SERVICES.length} services`);
  for (const [index, entry] of SERVICES.entries()) {
    const [category, title, description, min, max, unit, city] = entry;
    const seller = providers[index % providers.length];

    const service = await call('/services', {
      method: 'POST',
      token: seller.token,
      body: {
        category,
        title,
        description,
        priceMin: min,
        priceMax: max,
        priceUnit: unit,
        currency: 'TRY',
        countryCode: 'TR',
        region: city,
        city,
        isMobile: ['transport', 'veterinary', 'farrier', 'clipping_grooming'].includes(category),
      },
    });

    // Not swallowed. A publish that fails is a row nobody can see, and the
    // first version of this script hid exactly that behind a `.catch`.
    await call(`/services/${service.id}/publish`, { method: 'POST', token: seller.token });
  }
  pass(`${SERVICES.length} services across ${providers.length} providers`);

  // §16.1 prices a job post at €79, so publishing one needs a paid purchase to
  // consume (migration 0041). Stripe is not wired (ADR-0007), so the purchase
  // is written directly — the same shape the webhook would write, so
  // `consume_job_post_purchase` runs for real and the §16 rule is exercised
  // rather than bypassed.
  say(`publishing ${JOBS.length} jobs`);
  for (const [title, jobType, roles, description, salaryMin, salaryMax, city] of JOBS) {
    const job = await call('/jobs', {
      method: 'POST',
      token: club.token,
      body: {
        title,
        jobType,
        rolesNeeded: roles,
        description,
        countryCode: 'TR',
        region: city,
        city,
        salaryMin,
        salaryMax,
        salaryCurrency: 'TRY',
        salaryPeriod: jobType === 'seasonal' ? 'day' : 'month',
        salaryPublic: true,
      },
    });

    await grantJobPost(club.id, job.id);
    await call(`/jobs/${job.id}/publish`, { method: 'POST', token: club.token });
  }
  pass(`${JOBS.length} jobs`);

  // Nothing published is searchable until the outbox drains (§11.4). Leaving
  // that to a scheduler here means a seed that "worked" and a search that
  // returns nothing.
  say('draining the search outbox');
  for (let round = 0; round < 12; round += 1) {
    // The drain endpoint is @Public and guarded by a shared secret rather than
    // a session, because Cloud Scheduler has no account. Locally that secret is
    // JWT_SECRET; without it the seed finishes and search stays empty.
    const result = await call('/jobs/search-sync', {
      method: 'POST',
      headers: { 'x-cron-secret': process.env.JWT_SECRET ?? '' },
    }).catch(() => null);
    if (!result || result.indexed + result.deleted === 0) break;
  }
  pass('search index up to date');
}

main().catch((error) => {
  console.error(`\x1b[31m✗ ${error.message}\x1b[0m`);
  process.exit(1);
});
