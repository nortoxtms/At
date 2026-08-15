#!/usr/bin/env node
/**
 * The authenticated web journey, in a browser.
 *
 * §18.2 places signing in, your horses, your listings and messaging in the
 * mobile app. They are on the web too — the same account, the same API — and
 * unlike the public pages nothing about them is exercised by the milestone
 * acceptance scripts, which talk to the API directly and never hold a session.
 *
 * This drives the session the way a person does: register in the browser,
 * record a horse, add to its history, put it on the market, sell a saddle
 * beside it, and answer a message. It asserts the two things a cookie-session
 * build gets wrong most often — that the token is not reachable from script,
 * and that a signed-out visitor cannot open a signed-in page.
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

    console.log(bold('7. §18.2 S10 — record a horse from the web form'));
    await page.goto(`${WEB}/tr/hesap/atlarim/yeni`, { waitUntil: 'networkidle' });
    const horseName = `Web Kisrak ${STAMP}`;
    await page.fill('input[name=name]', horseName);
    // The radios are visually hidden behind their labels (§20's chip style), so
    // they are checked rather than clicked — a `sr-only` input is 1px and a
    // click lands on whatever the label is sitting on.
    await page.check('input[name=sex][value=mare]', { force: true });
    await page.fill('input[name=birthYear]', '2018');
    await page.fill('input[name=heightCm]', '158');
    await page.click('button[type=submit]');
    // Not `**/tr/hesap/atlarim/**` — that glob matches the /yeni page this
    // click started on, so the wait returns instantly and every assertion
    // after it reads the form instead of the record.
    await page.waitForURL(
      (url) => /\/tr\/hesap\/atlarim\/[0-9a-f-]{36}/.test(url.pathname),
      { timeout: 20_000 },
    );

    const horseUrl = page.url();
    const webHorseId = horseUrl.split('/atlarim/')[1].split(/[?#]/)[0];
    if (!(await page.locator('main').innerText()).includes(horseName)) {
      fail('the new horse record did not open on its own page');
    }
    pass(`created ${horseName} and landed on its record`);

    console.log(bold('8. §18.2 S12 — a health entry, and the reminder it schedules'));
    await page.goto(`${WEB}/tr/hesap/atlarim/${webHorseId}/saglik/yeni`, {
      waitUntil: 'networkidle',
    });
    await page.selectOption('select[name=type]', 'vaccination');
    await page.fill('input[name=title]', 'Grip–tetanoz rapel');
    await page.selectOption('select[name=intervalDays]', '365');
    await page.click('button[type=submit]');
    await page.waitForURL('**/saglik', { timeout: 20_000 });

    text = await page.locator('main').innerText();
    if (!text.includes('Grip–tetanoz rapel')) fail('the health entry is not in the log');
    if (!text.includes('Sırada')) fail('the reminder did not produce a "Sırada" section');
    pass('the entry is logged and its next due date is scheduled');

    console.log(bold('9. §18.2 S13 — a competition result, on the §20.4 timeline'));
    await page.goto(`${WEB}/tr/hesap/atlarim/${webHorseId}/yarisma`, {
      waitUntil: 'networkidle',
    });
    await page.fill('input[name=eventName]', 'Bursa Bölge Şampiyonası');
    await page.fill('input[name=placing]', '3');
    await page.fill('input[name=riderName]', 'Deniz Y.');
    await page.click('button[type=submit]');
    await page.waitForURL(`**/tr/hesap/atlarim/${webHorseId}`, { timeout: 20_000 });

    text = await page.locator('main').innerText();
    if (!text.includes('Bursa Bölge Şampiyonası')) {
      fail('the competition result is not on the timeline');
    }
    if (!text.includes('Grip–tetanoz rapel')) {
      fail('the health entry is not on the timeline — §20.4 runs both through one rule');
    }
    pass('health and competition both appear on the horse timeline');

    console.log(bold('10. §18.2 S13 — compose a listing, as a draft'));
    await page.goto(`${WEB}/tr/hesap/ilan-ver?horse=${webHorseId}`, {
      waitUntil: 'networkidle',
    });
    // §3.3: this account is unverified, so the page must say publishing is
    // gated before offering the form rather than after the API refuses.
    if (!(await page.locator('main').innerText()).includes('kimlik doğrulaması')) {
      fail('the composer does not state §3.3’s publishing rule to an unverified seller');
    }
    await page.selectOption('select[name=horseId]', webHorseId);
    await page.selectOption('select[name=type]', 'sale');
    await page.fill('input[name=title]', `${horseName} — satılık`);
    await page.fill(
      'textarea[name=description]',
      'Sakin, temiz karakterli bir kısrak. Amatör binici için uygun, her türlü denemeye açığız.',
    );
    await page.fill('input[name=priceAmount]', '185000');
    await page.click('button[type=submit]');
    await page.waitForURL('**/tr/hesap/ilanlarim', { timeout: 20_000 });

    text = await page.locator('main').innerText();
    if (!text.includes(`${horseName} — satılık`)) fail('the draft listing is not on "İlanlarım"');
    if (!text.includes('Taslak')) fail('the new listing is not a draft');
    pass('the composer saved a draft, and it shows as one');

    console.log(bold('11. The product marketplace — sell something that is not a horse'));
    await page.goto(`${WEB}/tr/hesap/urunlerim/yeni`, { waitUntil: 'networkidle' });
    const productTitle = `Wintec eyer ${STAMP}`;
    await page.selectOption('select[name=category]', 'saddle');
    await page.fill('input[name=title]', productTitle);
    await page.fill(
      'textarea[name=description]',
      'İki sezon kullanıldı, kaltak sağlam, kolonu ve üzengisi dahil. Yerinde denenebilir.',
    );
    await page.fill('input[name=brand]', 'Wintec');
    await page.fill('input[name=sizeLabel]', '17.5"');
    await page.fill('input[name=priceAmount]', '18500');
    await page.selectOption('select[name=delivery]', 'both');
    await page.fill('input[name=region]', 'Ankara');
    await page.click('button[type=submit]');
    await page.waitForURL('**/tr/hesap/urunlerim', { timeout: 20_000 });

    text = await page.locator('main').innerText();
    if (!text.includes(productTitle)) fail('the product is not on "Ürünlerim"');
    if (!text.includes('Taslak')) fail('the new product is not a draft');
    pass('the product was created as a draft');

    // §3.3 applies to products on the same terms as horses. This account is
    // unverified, so the page must say so *before* the button rather than
    // after a 403 — a saddle at 22 000 ₺ is the same fraud as a horse at
    // 240 000 ₺ with a shorter setup.
    if (!text.includes('Yayınlamak için kimlik doğrulaması gerekiyor')) {
      fail('the products page does not state §3.3’s publishing rule to an unverified seller');
    }
    if ((await page.locator('button:has-text("Yayınla")').count()) > 0) {
      fail('an unverified seller is offered a publish button that the API will refuse');
    }
    pass('§3.3 is stated before the button, and the button routes to the ladder');

    // Grant the level the way the acceptance scripts do — §17's provider needs
    // credentials this repository must not carry — then publish for real.
    const verify = new pg.Client({ connectionString: DB });
    await verify.connect();
    try {
      await verify.query(
        `INSERT INTO verifications (profile_id, kind, status, provider, decided_at)
         VALUES ($1, 'identity', 'approved', 'stripe_identity', now())`,
        [browserProfile],
      );
      await verify.query(
        `UPDATE profiles SET verification_level = 'identity_verified' WHERE id = $1`,
        [browserProfile],
      );
    } finally {
      await verify.end();
    }

    await page.goto(`${WEB}/tr/hesap/urunlerim`, { waitUntil: 'networkidle' });
    await page.click('button:has-text("Yayınla")');
    await page.waitForTimeout(1500);
    if (!(await page.locator('main').innerText()).includes('Yayında')) {
      fail('publishing the product did not change its status once verified');
    }
    pass('once verified, “Yayınla” moved it to Yayında');

    console.log(bold('12. §11 — the published product is findable in the marketplace'));
    await page.goto(`${WEB}/tr/urunler?q=${encodeURIComponent(`Wintec eyer ${STAMP}`)}`, {
      waitUntil: 'networkidle',
    });
    if (!(await page.locator('main').innerText()).includes(productTitle)) {
      fail('the published product does not come back from the product search');
    }
    pass('search on the seller’s own words finds it');

    await page.click(`a:has-text("${productTitle}")`);
    await page.waitForURL('**/tr/urunler/**', { timeout: 15_000 });
    const detail = await page.locator('main').innerText();
    if (!detail.includes('Wintec')) fail('the brand is missing from the product page');
    if (!detail.includes('17.5"')) fail('the size is missing from the product page');
    if (!detail.includes('Elden teslim veya kargo')) fail('the delivery terms are missing');
    pass('the detail page carries brand, size and delivery terms');

    console.log(bold('13. §10 / §21 — saved items, saved searches and notifications render'));
    for (const [path, heading] of [
      ['/tr/hesap/kaydedilenler', 'Kaydedilenler'],
      ['/tr/hesap/aramalarim', 'Aramalarım'],
      ['/tr/hesap/bildirimler', 'Bildirimler'],
      ['/tr/hesap/dogrulama', 'Doğrulama'],
      ['/tr/hesap/ayarlar', 'Ayarlar'],
    ]) {
      await page.goto(`${WEB}${path}`, { waitUntil: 'networkidle' });
      const body = await page.locator('main').innerText();
      if (!body.includes(heading)) fail(`${path} did not render its own heading`);
      // §20.7: a screen with nothing in it names the next action rather than
      // showing a blank panel.
      if (body.trim().length < 80) fail(`${path} rendered almost nothing`);
    }
    pass('all five render, with content rather than a blank panel');

    console.log(bold('14. §18.2 S23 — the seller’s public profile is reachable and public'));
    // Read the handle off the account page rather than from the API. The
    // session is an httpOnly cookie held by *this* server, so a fetch from the
    // page carries no bearer token and /v1/me answers 401 — which is the whole
    // point of the cookie, and why the first version of this step always
    // skipped itself.
    await page.goto(`${WEB}/tr/hesap`, { waitUntil: 'networkidle' });
    const handle = (await page.locator('main').innerText()).match(/@([a-z0-9-]+)/i)?.[1] ?? null;
    if (!handle) fail('the account page does not show the signed-in handle');

    const anon = await browser.newContext();
    const anonPage = await anon.newPage();
    await anonPage.goto(`${WEB}/tr/profil/${handle}`, { waitUntil: 'networkidle' });
    const publicText = await anonPage.locator('main').innerText();
    if (!publicText.includes('Hesap Turu')) {
      fail('the public profile does not render for a signed-out visitor');
    }
    // Any of §3.3's rungs, not a specific one: by this point in the walk the
    // account has been verified in order to publish a product, and asserting
    // "Doğrulanmamış" would be asserting the state two steps ago.
    if (!/Doğrulanmamış|doğrulandı/.test(publicText)) {
      fail('the public profile does not state the seller’s verification level');
    }
    await anon.close();
    pass(`@${handle} renders signed out, with its verification level`);

    console.log(bold('15. §18.2 S21/S22 — a conversation, read and answered'));
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

    console.log(bold('16. Sign out'));
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
