#!/usr/bin/env node
/**
 * Screenshots of every web route, signed in and signed out.
 *
 * "It builds" and "it renders" are different claims, and the gap between them
 * is where a page with a broken layout, an empty grid or a section that threw
 * during streaming lives — none of which a typecheck or a status code catches.
 * So this walks the routes a person can reach and writes a PNG of each.
 *
 * It registers its own account and seeds through the API rather than reusing
 * one, because a screenshot of an empty account page proves nothing: every
 * signed-in screen here has something on it.
 *
 *   node scripts/web-shot.mjs [outdir]
 *
 * Needs the API on :3001 and the web app on :3000.
 */
import { existsSync, mkdirSync } from 'node:fs';

import { chromium } from 'playwright';

const API = process.env.API ?? 'http://localhost:3001';
const WEB = process.env.WEB ?? 'http://localhost:3000';
const OUT = process.argv[2] ?? 'artifacts/web-shots';
const CANDIDATE =
  process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const LAUNCH = existsSync(CANDIDATE) ? { executablePath: CANDIDATE } : {};
const DB = process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/only_horses';
const STAMP = Date.now();

const pass = (s) => console.log(`\x1b[32m✓ ${s}\x1b[0m`);
const warn = (s) => console.log(`\x1b[33m! ${s}\x1b[0m`);

async function api(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${API}/v1${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (payload?.error) {
    throw new Error(`${path} → ${payload.error.code}: ${payload.error.message}`);
  }
  return payload.data;
}

/**
 * A account with something in it.
 *
 * The seeding runs through the API rather than the browser because this script
 * is about what the pages *look* like; whether the forms work is what
 * web-account.mjs is for, and duplicating it here would double the runtime for
 * no extra coverage.
 */
async function seed() {
  const email = `shot-${STAMP}@example.com`;
  const password = 'guclu-sifre-123';
  const horseName = `Şimşek ${STAMP % 10_000}`;

  const registered = await api('/auth/register', {
    method: 'POST',
    body: { email, password, displayName: 'Görsel Tur' },
  });
  const token = registered.tokens.accessToken;

  const horse = await api('/horses', {
    method: 'POST',
    body: {
      name: horseName,
      sex: 'stallion',
      breedId: 'arabian',
      color: 'doru',
      heightCm: 156,
      dateOfBirth: '2019-04-01',
      disciplines: ['endurance', 'dressage'],
      about: 'Uzunyayla hattından, sakin ve dayanıklı.',
      currentCity: 'Kayseri',
      currentCountry: 'TR',
    },
    token,
  });

  // §13.2 refuses to publish a listing with fewer than three photos, so the
  // gallery is seeded here too — an empty photo strip is also the one thing a
  // screenshot of a listing page is least useful without.
  const { default: sharp } = await import(
    new URL('../apps/api/node_modules/sharp/lib/index.js', import.meta.url).pathname
  ).catch(() => import('sharp'));

  for (let index = 0; index < 4; index += 1) {
    const buffer = await sharp({
      create: {
        width: 960,
        height: 640,
        channels: 3,
        background: { r: 40 + index * 30, g: 90 + index * 10, b: 60 + index * 20 },
      },
    })
      .jpeg()
      .toBuffer();

    const intent = await api('/media/upload-intent', {
      method: 'POST',
      body: {
        type: 'image',
        mimeType: 'image/jpeg',
        sizeBytes: buffer.byteLength,
        filename: `shot-${index}.jpg`,
      },
      token,
    });

    await fetch(intent.uploadUrl, {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg' },
      body: buffer,
    });
    await api(`/media/${intent.mediaId}/complete`, { method: 'POST', token });
    await api(`/horses/${horse.id}/media`, {
      method: 'POST',
      body: { mediaId: intent.mediaId, category: 'conformation', sortOrder: index },
      token,
    });
  }

  await api(`/horses/${horse.id}/health`, {
    method: 'POST',
    body: {
      type: 'vaccination',
      title: 'Grip–tetanoz rapel',
      performedOn: new Date().toISOString().slice(0, 10),
      notes: 'Klinikte yapıldı, reaksiyon yok.',
    },
    token,
  });

  await api(`/horses/${horse.id}/competitions`, {
    method: 'POST',
    body: {
      eventDate: '2025-09-14',
      eventName: 'Kapadokya Dayanıklılık Yarışı',
      discipline: 'endurance',
      placing: 2,
      location: 'Nevşehir',
      riderName: 'Deniz Y.',
    },
    token,
  });

  const listing = await api('/listings', {
    method: 'POST',
    body: {
      horseId: horse.id,
      type: 'sale',
      title: `${horseName} — satılık aygır`,
      // §13.2's floor is 120 characters: a listing shorter than that is one
      // the seller will answer the same four questions about by message.
      description:
        'Dayanıklılıkta yarışmış, sakin karakterli bir aygır. Uzun mesafede tempo tutar, ' +
        'nakliyeye ve kalabalığa alışkındır. Nal bakımı altı haftada bir, aşıları güncel. ' +
        'Deneme binişine ve alım öncesi veteriner muayenesine açığız; sağlık dosyası talep ' +
        'üzerine paylaşılır. Orta seviye bir binici için uygundur.',
      priceAmount: 240_000,
      priceCurrency: 'TRY',
      priceType: 'negotiable',
      countryCode: 'TR',
      city: 'Kayseri',
    },
    token,
  });

  const product = await api('/products', {
    method: 'POST',
    body: {
      category: 'saddle',
      title: 'Dayanıklılık eyeri — 17"',
      description:
        'Uzun mesafe için yapılmış, hafif ve geniş oturaklı. İki sezon kullanıldı, sağlam.',
      brand: 'Barefoot',
      sizeLabel: '17"',
      condition: 'good',
      priceAmount: 22_000,
      priceCurrency: 'TRY',
      priceType: 'fixed',
      delivery: 'both',
      countryCode: 'TR',
      region: 'Kayseri',
      city: 'Kayseri',
    },
    token,
  });
  await api(`/products/${product.id}/publish`, { method: 'POST', token });

  // §3.3 gates publishing a horse listing on identity verification, which
  // needs a KYC provider this repository has no credentials for. The listing
  // detail page only serves an active listing, so the level is granted here
  // the way the acceptance scripts grant it: in the database, once, for a
  // fixture account. Nothing in the app can do this.
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: DB });
  await client.connect();
  try {
    const me = await api('/me', { token });
    await client.query(
      `INSERT INTO verifications (profile_id, kind, status, provider, decided_at)
       VALUES ($1, 'identity', 'approved', 'stripe_identity', now())`,
      [me.id],
    );
    await client.query(
      `UPDATE profiles SET verification_level = 'identity_verified' WHERE id = $1`,
      [me.id],
    );
  } finally {
    await client.end();
  }
  await api(`/listings/${listing.id}/publish`, { method: 'POST', token });

  await api('/saved', {
    method: 'POST',
    body: { itemType: 'listing', itemId: listing.id, note: 'Sahibiyle konuşulacak.' },
    token,
  }).catch(() => undefined);

  await api('/saved-searches', {
    method: 'POST',
    body: {
      name: 'Kayseri’de dayanıklılık atları',
      entity: 'listing',
      query: { q: 'dayanıklılık', region: 'Kayseri' },
      alertFrequency: 'daily',
    },
    token,
  }).catch(() => undefined);

  return { email, password, horseId: horse.id, productSlug: product.slug, listing };
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  const fixture = await seed();
  pass(`seeded ${fixture.email} with a horse, a listing and a published product`);

  const browser = await chromium.launch(LAUNCH);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`${page.url()} — ${error.message}`));

  const shot = async (name, path) => {
    // `networkidle` hangs on any page that keeps a connection open, and a
    // screenshot does not need the network to be quiet — it needs the DOM and
    // the fonts. `domcontentloaded` plus a settle is both faster and reliable.
    const response = await page.goto(`${WEB}${path}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    const status = response?.status() ?? 0;
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

    if (status >= 400) {
      warn(`${path} → ${status}`);
      return false;
    }
    pass(`${name} — ${path}`);
    return true;
  };

  const failures = [];
  const record = async (name, path) => {
    if (!(await shot(name, path))) failures.push(path);
  };

  console.log('\n\x1b[1mSigned out\x1b[0m');
  const publicRoutes = [
    ['01-anasayfa', '/'],
    ['02-atlar', '/tr/atlar'],
    ['03-ilan', `/tr/atlar/${fixture.listing.slug}`],
    ['04-urunler', '/tr/urunler'],
    ['05-urun', `/tr/urunler/${fixture.productSlug}`],
    ['06-hizmetler', '/tr/hizmetler'],
    ['07-isler', '/tr/isler'],
    ['08-uzmanlar', '/tr/uzmanlar'],
    ['09-fiyatlandirma', '/tr/fiyatlandirma'],
    ['10-giris', '/tr/giris'],
    ['11-kayit', '/tr/kayit'],
    ['12-kosullar', '/tr/kosullar'],
    ['13-gizlilik', '/tr/gizlilik'],
    ['14-refah', '/tr/refah-politikasi'],
    ['15-guvenli-alim', '/tr/guvenli-alim'],
  ];
  for (const [name, path] of publicRoutes) await record(name, path);

  console.log('\n\x1b[1mSigning in\x1b[0m');
  await page.goto(`${WEB}/tr/giris`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name=email]', fixture.email);
  await page.fill('input[name=password]', fixture.password);
  await page.click('button[type=submit]');
  await page.waitForURL('**/tr/hesap', { timeout: 20_000 });
  pass('signed in');

  console.log('\n\x1b[1mSigned in\x1b[0m');
  const accountRoutes = [
    ['20-hesap', '/tr/hesap'],
    ['21-atlarim', '/tr/hesap/atlarim'],
    ['22-at-kaydi', `/tr/hesap/atlarim/${fixture.horseId}`],
    ['23-saglik', `/tr/hesap/atlarim/${fixture.horseId}/saglik`],
    ['24-saglik-ekle', `/tr/hesap/atlarim/${fixture.horseId}/saglik/yeni`],
    ['25-yarisma-ekle', `/tr/hesap/atlarim/${fixture.horseId}/yarisma`],
    ['26-devret', `/tr/hesap/atlarim/${fixture.horseId}/devret`],
    ['27-at-ekle', '/tr/hesap/atlarim/yeni'],
    ['28-ilan-ver', '/tr/hesap/ilan-ver'],
    ['29-ilanlarim', '/tr/hesap/ilanlarim'],
    ['30-urunlerim', '/tr/hesap/urunlerim'],
    ['31-urun-ekle', '/tr/hesap/urunlerim/yeni'],
    ['32-mesajlar', '/tr/hesap/mesajlar'],
    ['33-kaydedilenler', '/tr/hesap/kaydedilenler'],
    ['34-aramalarim', '/tr/hesap/aramalarim'],
    ['35-bildirimler', '/tr/hesap/bildirimler'],
    ['36-dogrulama', '/tr/hesap/dogrulama'],
    ['37-ayarlar', '/tr/hesap/ayarlar'],
  ];
  for (const [name, path] of accountRoutes) await record(name, path);

  // A profile page is only interesting once the account owns something, so it
  // is shot last — and signed out, because that is who reads it.
  const handle = (await page.locator('main').innerText()).match(/@([a-z0-9-]+)/i)?.[1];
  if (handle) {
    const anon = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const anonPage = await anon.newPage();
    await anonPage.goto(`${WEB}/tr/profil/${handle}`, { waitUntil: 'domcontentloaded' });
    await anonPage.waitForTimeout(500);
    await anonPage.screenshot({ path: `${OUT}/40-profil.png`, fullPage: true });
    await anon.close();
    pass(`40-profil — /tr/profil/${handle}`);
  }

  await browser.close();

  console.log(`\n${publicRoutes.length + accountRoutes.length + 1} screenshots in ${OUT}`);

  if (errors.length > 0) {
    for (const error of errors) warn(error);
    process.exitCode = 1;
  }
  if (failures.length > 0) {
    warn(`${failures.length} route(s) did not answer 2xx: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
  if (errors.length === 0 && failures.length === 0) {
    console.log('\x1b[32m✓ every route rendered, with no page errors\x1b[0m');
  }
}

main().catch((error) => {
  console.error(`\x1b[31m✗ ${error.message}\x1b[0m`);
  process.exit(1);
});
