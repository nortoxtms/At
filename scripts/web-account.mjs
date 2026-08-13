#!/usr/bin/env node
/**
 * The authenticated web journey, in a browser.
 *
 * §18.2 places signing in, your horses, your listings and messaging in the
 * mobile app. There is no mobile app (README, "known gaps"), so those screens
 * exist on the web instead — and unlike the public pages, nothing about them
 * is exercised by the milestone acceptance scripts, which talk to the API
 * directly and never hold a session.
 *
 * This drives the session the way a person does: register in the browser, own
 * a horse, publish a listing, act on it, and answer a message. It asserts the
 * two things a cookie-session build gets wrong most often — that the token is
 * not reachable from script, and that a signed-out visitor cannot open a
 * signed-in page.
 *
 *   node scripts/web-account.mjs
 *
 * Needs the API on :3001 and the web app on :3000.
 */
import { chromium } from 'playwright';

const API = process.env.API ?? 'http://localhost:3001';
const WEB = process.env.WEB ?? 'http://localhost:3000';
const CHROME =
  process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const DB = process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/only_horses';
const STAMP = Date.now();

const bold = (s) => `\n\x1b[1m${s}\x1b[0m`;
const pass = (s) => console.log(`\x1b[32m✓ ${s}\x1b[0m`);
const fail = (s) => {
  console.error(`\x1b[31m✗ ${s}\x1b[0m`);
  process.exitCode = 1;
  throw new Error(s);
};

async function main() {
  const { default: pg } = await import('pg');
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  try {
    console.log(bold('1. §12 — a signed-out visitor cannot open an account page'));
    for (const path of ['/tr/hesap', '/tr/hesap/atlarim', '/tr/hesap/ilanlarim', '/tr/hesap/mesajlar']) {
      await page.goto(`${WEB}${path}`, { waitUntil: 'domcontentloaded' });
      if (!page.url().includes('/tr/giris')) {
        fail(`${path} rendered for a signed-out visitor (landed on ${page.url()})`);
      }
    }
    pass('all four redirect to sign-in');

    console.log(bold('2. §18.2 S01 — register in the browser'));
    const email = `acct-${STAMP}@example.com`;
    await page.goto(`${WEB}/tr/kayit`, { waitUntil: 'networkidle' });
    await page.fill('input[name=displayName]', 'Hesap Turu');
    await page.fill('input[name=email]', email);
    await page.fill('input[name=password]', 'guclu-sifre-123');
    await page.click('button[type=submit]');
    await page.waitForURL('**/tr/hesap', { timeout: 20_000 });
    pass(`registered and landed on the account page as ${email}`);

    console.log(bold('3. §12 — the session token is not reachable from script'));
    const cookies = (await context.cookies()).filter((cookie) => cookie.name.startsWith('oh_'));
    if (cookies.length !== 2) fail(`expected two session cookies, found ${cookies.length}`);
    if (!cookies.every((cookie) => cookie.httpOnly)) fail('a session cookie is not httpOnly');
    if ((await page.evaluate(() => document.cookie)) !== '') {
      fail('document.cookie is not empty — a token is readable by script');
    }
    pass('two httpOnly cookies, and document.cookie is empty');

    console.log(bold('4. §3.3 — the account page states the publishing rule'));
    const accountText = await page.locator('main').innerText();
    if (!accountText.includes('Doğrulanmamış')) fail('verification level is not shown');
    if (!accountText.includes('kimlik doğrulaması')) {
      fail('the account page does not say publishing needs identity verification');
    }
    pass('verification level and §3.3’s rule are both on the page');

    // The API is the only way to own a horse and a listing; §18.2 puts those
    // forms in the app, and the web has no create screens yet. What the web
    // does have is the management of them, which is what this run checks.
    const profileId = await page.evaluate(async (api) => {
      const response = await fetch(`${api}/v1/me`, { credentials: 'omit' });
      return response.ok ? (await response.json()).data.id : null;
    }, API).catch(() => null);

    const token = await registerApi(`fixture-${STAMP}`);
    const client = new pg.Client({ connectionString: DB });
    await client.connect();
    try {
      const me = await apiGet('/me', token);
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
    void profileId;

    console.log(bold('5. §18.2 S14 — listings you own, and the §5 transitions'));
    const listing = await seedListing(token);

    // Move the seeded listing to the browser's account so the page under test
    // is showing the signed-in person's own rows, which is the whole point of
    // the RLS-scoped read behind it.
    const browserProfile = await profileIdOf(page, email);
    const move = new pg.Client({ connectionString: DB });
    await move.connect();
    try {
      await move.query(`UPDATE horses SET owner_profile_id = $1 WHERE id = $2`, [
        browserProfile,
        listing.horseId,
      ]);
      await move.query(`UPDATE listings SET seller_profile_id = $1 WHERE id = $2`, [
        browserProfile,
        listing.id,
      ]);
    } finally {
      await move.end();
    }

    await page.goto(`${WEB}/tr/hesap/ilanlarim`, { waitUntil: 'networkidle' });
    let text = await page.locator('main').innerText();
    if (!text.includes(listing.title)) fail('the listing is not on "İlanlarım"');
    if (!text.includes('Yayında')) fail(`expected status "Yayında", page reads: ${text.slice(0, 200)}`);
    pass('the published listing appears with its status and counters');

    await page.click('button:has-text("Duraklat")');
    await page.waitForTimeout(1500);
    text = await page.locator('main').innerText();
    if (!text.includes('Duraklatıldı')) fail('pausing did not change the status');
    pass('“Duraklat” moved it to Duraklatıldı');

    await page.click('button:has-text("Yeniden yayınla")');
    await page.waitForTimeout(1500);
    text = await page.locator('main').innerText();
    if (!text.includes('Yayında')) fail('resuming did not restore the status');
    pass('“Yeniden yayınla” moved it back to Yayında');

    console.log(bold('6. §18.2 S05 — the horses you own'));
    await page.goto(`${WEB}/tr/hesap/atlarim`, { waitUntil: 'networkidle' });
    const horses = await page.locator('main li').count();
    if (horses < 1) fail('the transferred horse is not on "Atlarım"');
    pass(`${horses} horse(s) listed`);

    console.log(bold('7. §18.2 S21/S22 — a conversation, read and answered'));
    const buyerToken = await registerApi(`buyer-${STAMP}`);
    const conversation = await apiPost(
      '/conversations',
      {
        contextType: 'listing',
        contextId: listing.id,
        participantId: browserProfile,
        firstMessage: 'Merhaba, at hâlâ satılık mı?',
      },
      buyerToken,
    );

    await page.goto(`${WEB}/tr/hesap/mesajlar`, { waitUntil: 'networkidle' });
    if (!(await page.locator('main').innerText()).includes('Merhaba')) {
      fail('the inbound message is not in the inbox');
    }
    pass('the buyer’s message is in the inbox');

    await page.click(`a[href*="${conversation.conversationId}"]`);
    await page.waitForURL(`**/${conversation.conversationId}`, { timeout: 15_000 });
    await page.fill('input[name=body]', 'Evet, satılık. Deneme binişi için müsaitiz.');
    await page.click('button:has-text("Gönder")');
    await page.waitForTimeout(1500);

    const thread = await page.locator('main').innerText();
    if (!thread.includes('Deneme binişi')) fail('the reply is not in the thread');
    pass('the reply was sent and is in the thread');

    console.log(bold('8. Sign out'));
    await page.goto(`${WEB}/tr/hesap`, { waitUntil: 'networkidle' });
    await page.click('button:has-text("Çıkış yap")');
    await page.waitForURL('**/tr/giris', { timeout: 20_000 });

    await page.goto(`${WEB}/tr/hesap`, { waitUntil: 'domcontentloaded' });
    if (!page.url().includes('/tr/giris')) fail('the account page opened after signing out');
    pass('signing out clears the session');

    if (errors.length > 0) fail(`${errors.length} page error(s): ${errors[0]}`);
    pass('no uncaught page errors');

    console.log('\n\x1b[32m✓ the authenticated web journey works end to end\x1b[0m');
  } finally {
    await browser.close();
  }
}

async function registerApi(tag) {
  const response = await fetch(`${API}/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: `${tag}@example.com`,
      password: 'guclu-sifre-123',
      displayName: `Fixture ${tag}`,
    }),
  });
  const body = await response.json();
  if (!body?.data) throw new Error(`register failed: ${JSON.stringify(body).slice(0, 200)}`);
  return body.data.tokens.accessToken;
}

async function apiGet(path, token) {
  const response = await fetch(`${API}/v1${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = await response.json();
  if (body?.error) throw new Error(`${path} → ${body.error.code}: ${body.error.message}`);
  return body.data;
}

async function apiPost(path, payload, token) {
  const response = await fetch(`${API}/v1${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (body?.error) throw new Error(`${path} → ${body.error.code}: ${body.error.message}`);
  return body.data;
}

/** The web app has no create-horse form yet; §18.2 puts it in the app. */
async function seedListing(token) {
  const { default: sharp } = await import(
    new URL('../apps/api/node_modules/sharp/lib/index.js', import.meta.url).pathname
  ).catch(() => import('sharp'));

  const horse = await apiPost(
    '/horses',
    {
      name: `Hesap ${STAMP}`,
      sex: 'mare',
      breedId: 'arabian',
      color: 'doru',
      heightCm: 162,
      dateOfBirth: '2017-04-01',
      disciplines: ['dressage'],
      currentCity: 'Ankara',
      currentCountry: 'TR',
    },
    token,
  );

  for (let index = 0; index < 8; index += 1) {
    const buffer = await sharp({
      create: {
        width: 640,
        height: 427,
        channels: 3,
        background: { r: 30 + index * 25, g: 110, b: 70 + index * 15 },
      },
    })
      .jpeg()
      .toBuffer();

    const intent = await apiPost(
      '/media/upload-intent',
      {
        type: 'image',
        mimeType: 'image/jpeg',
        sizeBytes: buffer.byteLength,
        filename: `a-${index}.jpg`,
      },
      token,
    );

    await fetch(intent.uploadUrl, {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg' },
      body: buffer,
    });
    await apiPost(`/media/${intent.mediaId}/complete`, undefined, token);
    await apiPost(
      `/horses/${horse.id}/media`,
      { mediaId: intent.mediaId, category: 'conformation', sortOrder: index },
      token,
    );
  }

  const title = `Hesap turu ${STAMP} — dresaj kısrağı`;
  const listing = await apiPost(
    '/listings',
    {
      horseId: horse.id,
      type: 'sale',
      title,
      description:
        'Sakin mizaçlı, düzenli çalışan bir kısrak. Sağlık kayıtları eksiksiz, nal bakımı ' +
        'altı haftada bir yapılıyor, aşıları güncel. Manejde ve arazide rahat çalışır, ' +
        'nakliyeye alışkındır. Deneme binişine ve alım öncesi veteriner muayenesine açığız; ' +
        'röntgenler ve sağlık dosyası talep üzerine paylaşılır. Orta seviye bir binici için uygundur.',
      priceAmount: 320000,
      priceCurrency: 'TRY',
      priceType: 'fixed',
      countryCode: 'TR',
      region: 'Ankara',
      city: 'Ankara',
      trialAllowed: true,
      ppeWelcome: true,
    },
    token,
  );

  await apiPost(`/listings/${listing.id}/publish`, undefined, token);
  return { id: listing.id, horseId: horse.id, title };
}

async function profileIdOf(page, email) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: DB });
  await client.connect();
  try {
    // The credential lives in `auth.users`, the public identity in `profiles`,
    // and they share a primary key — §7 keeps the two apart on purpose, so the
    // email never sits on the row every RLS policy joins against.
    const { rows } = await client.query(
      `SELECT p.id FROM profiles p JOIN auth.users u ON u.id = p.id WHERE u.email = $1`,
      [email],
    );
    if (rows.length === 0) throw new Error(`no profile for ${email}`);
    return rows[0].id;
  } finally {
    await client.end();
  }
}

await main();
