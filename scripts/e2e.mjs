#!/usr/bin/env node
/**
 * Browser end-to-end run for §24.22, and the LCP measurement for §24.18.
 *
 *   §24.22 — "E2E covers signup → horse → listing → search → inquiry → reply →
 *             close"
 *   §24.18 — "Web LCP < 2.5 s on 4G for listing detail"
 *
 * The milestone scripts already cover that journey over HTTP, which is
 * stronger than a UI script in some ways: they assert database state and RLS
 * behaviour a browser cannot see. What they cannot tell you is whether the
 * pages a buyer actually looks at render — server-side, without JavaScript,
 * with the right content in them. That is this file's job, and the two halves
 * are complementary rather than redundant.
 *
 * The journey is driven through the API for the steps that need an account
 * (§19 has no signup form yet — the app is where you register, per §18.2) and
 * through the browser for every step a search engine or a logged-out buyer
 * would take. Where a step is done over HTTP rather than in the page, this
 * says so rather than implying a click happened.
 *
 *   node scripts/e2e.mjs
 *
 * Needs the API on :3001 and the web app on :3000.
 */
import { createRequire } from 'node:module';
import path from 'node:path';

import { chromium } from 'playwright';
import pg from 'pg';

// sharp is apps/api's dependency and pnpm does not hoist it to the root.
const require = createRequire(import.meta.url);
const sharp = require(
  path.join(path.dirname(new URL(import.meta.url).pathname), '../apps/api/node_modules/sharp'),
);

const API = process.env.API ?? 'http://localhost:3001';
const WEB = process.env.WEB ?? 'http://localhost:3000';
const CHROME =
  process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const STAMP = Date.now();

const bold = (s) => `\n\x1b[1m${s}\x1b[0m`;
const pass = (s) => console.log(`\x1b[32m✓ ${s}\x1b[0m`);
const fail = (s) => {
  console.error(`\x1b[31m✗ ${s}\x1b[0m`);
  process.exitCode = 1;
  throw new Error(s);
};

const json = (r) => r.json();

const DB =
  process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/only_horses';

async function verifyIdentity(profileId) {
  const client = new pg.Client({ connectionString: DB });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO verifications (profile_id, kind, status, provider, decided_at)
       VALUES ($1, 'identity', 'approved', 'stripe_identity', now())`,
      [profileId],
    );
    await client.query(
      `UPDATE profiles SET verification_level = 'identity_verified' WHERE id = $1`,
      [profileId],
    );
  } finally {
    await client.end();
  }
}

/**
 * Puts one photo through the real §10.1 pipeline: intent → upload → complete →
 * attach. §10.2 requires at least three before a listing can be published, and
 * the publish call refuses without them — so the fixture has to do the real
 * thing rather than assert around it.
 *
 * Each image is visibly different, because §14.2's duplicate detector would
 * otherwise flag our own fixtures as reused photography.
 */
async function uploadPhoto(token, horseId, index) {
  const buffer = await sharp({
    create: {
      width: 640,
      height: 427,
      channels: 3,
      background: { r: 40 + index * 30, g: 120, b: 60 + index * 20 },
    },
  })
    .composite([
      {
        input: {
          create: {
            width: 200,
            height: 150,
            channels: 3,
            background: { r: 220, g: index * 40, b: 60 },
          },
        },
        top: index * 25,
        left: index * 35,
      },
    ])
    .jpeg()
    .toBuffer();

  const auth = { authorization: `Bearer ${token}` };

  const intent = await api('/media/upload-intent', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      type: 'image',
      mimeType: 'image/jpeg',
      sizeBytes: buffer.byteLength,
      filename: `e2e-${index}.jpg`,
    }),
  });

  await fetch(intent.uploadUrl, {
    method: 'POST',
    headers: { 'content-type': 'image/jpeg' },
    body: buffer,
  });
  await fetch(`${API}/v1/media/${intent.mediaId}/complete`, { method: 'POST', headers: auth });

  await api(`/horses/${horseId}/media`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ mediaId: intent.mediaId, category: 'conformation', sortOrder: index }),
  });
}

/** §11.3 gives 20 points for a video — the single largest item in the score. */
async function uploadVideo(token, horseId) {
  const auth = { authorization: `Bearer ${token}` };
  const buffer = Buffer.alloc(2048, 7);

  const intent = await api('/media/upload-intent', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      type: 'video',
      mimeType: 'video/mp4',
      sizeBytes: buffer.byteLength,
      filename: 'e2e-clip.mp4',
    }),
  });

  await fetch(intent.uploadUrl, {
    method: 'POST',
    headers: { 'content-type': 'video/mp4' },
    body: buffer,
  });
  await fetch(`${API}/v1/media/${intent.mediaId}/complete`, { method: 'POST', headers: auth });

  await api(`/horses/${horseId}/media`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ mediaId: intent.mediaId, category: 'trot', sortOrder: 8 }),
  });
}

async function api(path, options = {}) {
  const response = await fetch(`${API}/v1${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
  });
  const body = await json(response);
  if (body?.error) {
    throw new Error(`${path} → ${body.error.code}: ${body.error.message}`);
  }
  return body.data;
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME });

  try {
    // ── fixtures over HTTP ────────────────────────────────────────────
    console.log(bold('0. Signup, horse and a published listing (over the API)'));

    const seller = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: `e2e-seller-${STAMP}@example.com`,
        password: 'guclu-sifre-123',
        displayName: 'E2E Satıcı',
      }),
    });
    const sellerToken = seller.tokens.accessToken;
    const auth = { authorization: `Bearer ${sellerToken}` };

    const buyer = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: `e2e-buyer-${STAMP}@example.com`,
        password: 'guclu-sifre-123',
        displayName: 'E2E Alıcı',
      }),
    });
    const buyerAuth = { authorization: `Bearer ${buyer.tokens.accessToken}` };
    pass('two accounts registered');

    // §3.3: publishing requires identity verification, and §14.1 is explicit
    // that it cannot be granted by an API call — the only routes to it are
    // Stripe Identity and a moderator. So this fixture writes the row directly,
    // exactly as the milestone acceptance scripts do. There is deliberately no
    // endpoint to call here; adding one to make a test easier would be adding
    // the hole the rule exists to prevent.
    for (const profileId of [seller.profile.id, buyer.profile.id]) {
      await verifyIdentity(profileId);
    }

    const horse = await api('/horses', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        name: `Rüzgar ${STAMP}`,
        sex: 'stallion',
        breedId: 'arabian',
        color: 'doru',
        heightCm: 158,
        dateOfBirth: '2017-03-15',
        disciplines: ['dressage'],
        currentCity: 'Ankara',
        currentCountry: 'TR',
      }),
    });
    pass(`horse ${horse.slug}`);

    // §13.1 auto-approves at a quality score of 60 or more; anything less is
    // held for a human. A three-photo listing with a short description scores
    // 50, so the first version of this fixture sat in `pending_review` and the
    // journey stopped — correctly. Eight photos and a video is what §11.3
    // actually rewards, and it is what a seller who wants to be found does.
    for (let index = 0; index < 8; index += 1) {
      await uploadPhoto(sellerToken, horse.id, index);
    }
    await uploadVideo(sellerToken, horse.id);
    pass('8 photos and a video through the real media pipeline');

    const listing = await api('/listings', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        horseId: horse.id,
        type: 'sale',
        title: `E2E ${STAMP} — dresaj için hazır aygır`,
        // §11.3 wants 300 characters before it credits the description, and
        // the threshold is the point: a listing a buyer can assess without
        // asking three questions first.
        description:
          'Sakin mizaçlı, düzenli çalışan, sağlık kayıtları eksiksiz bir aygır. ' +
          'Günlük olarak dresaj çalışıyor, topluluk içinde ve tek başına sorunsuz. ' +
          'Nal bakımı altı haftada bir, aşıları ve paraziter ilaçları güncel. ' +
          'Nakliyeye alışkın, bineği kolay, yeni başlayan bir binici için uygun değil ' +
          'ancak orta seviye bir binici rahatlıkla çalışabilir. ' +
          'Deneme binişine ve alım öncesi veteriner muayenesine (PPE) açığız; ' +
          'röntgenler ve tüm sağlık dosyası talep üzerine paylaşılır.',
        priceAmount: 450000,
        priceCurrency: 'TRY',
        priceType: 'fixed',
        countryCode: 'TR',
        region: 'Ankara',
        city: 'Ankara',
        trialAllowed: true,
        ppeWelcome: true,
      }),
    });

    await api(`/listings/${listing.id}/publish`, { method: 'POST', headers: auth });
    await fetch(`${API}/v1/jobs/search-sync`, {
      method: 'POST',
      headers: {
        'x-cron-secret':
          process.env.CRON_SECRET ?? 'local-dev-secret-only-not-for-production-32chars',
      },
    });
    pass(`listing ${listing.slug} published and indexed`);

    // ── the browser half ──────────────────────────────────────────────
    console.log(bold('1. §19.1 — the landing page renders'));
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto(WEB, { waitUntil: 'networkidle' });
    const heading = await page.locator('h1').first().innerText();
    if (!heading.trim()) fail('landing page has no h1');
    pass(`h1 reads "${heading.replace(/\s+/g, ' ').trim()}"`);

    console.log(bold('2. §19.1 — search finds the listing'));
    await page.goto(`${WEB}/tr/atlar?q=E2E+${STAMP}`, { waitUntil: 'networkidle' });
    const resultLink = page.locator(`a[href*="${listing.slug}"]`).first();
    if ((await resultLink.count()) === 0) {
      fail(`the published listing is not on the search page for "E2E ${STAMP}"`);
    }
    pass('the listing appears in browser search results');

    console.log(bold('3. §19.2 — listing detail, server-rendered'));
    await resultLink.click();
    await page.waitForLoadState('networkidle');

    const url = page.url();
    if (!url.includes(listing.slug)) fail(`clicking the result went to ${url}`);

    for (const [what, needle] of [
      ['the title', `E2E ${STAMP}`],
      ['the price', '450'],
      ['the safety card', 'Güvenli'],
    ]) {
      const body = await page.locator('body').innerText();
      if (!body.includes(needle)) fail(`${what} is missing from the listing page`);
    }
    pass('title, price and the §14.5 safety card are all on the page');

    // §19.2 is explicit that these pages must be indexable. A crawler that
    // does not run JavaScript must see the same page, so this asserts the
    // markup arrives in the HTML rather than after hydration.
    const withoutJs = await browser.newContext({ javaScriptEnabled: false });
    const crawler = await withoutJs.newPage();
    await crawler.goto(url, { waitUntil: 'domcontentloaded' });
    const crawledText = await crawler.locator('body').innerText();
    if (!crawledText.includes(`E2E ${STAMP}`)) {
      fail('the listing title is not in the server-rendered HTML');
    }

    const ldJson = await crawler.locator('script[type="application/ld+json"]').count();
    if (ldJson === 0) fail('no structured data for a crawler to read');
    pass(`renders with JavaScript disabled, and carries ${ldJson} structured-data block(s)`);
    await withoutJs.close();

    console.log(bold('4. §24.18 — LCP on the listing page over throttled 4G'));
    const lcp = await measureLcp(browser, url);
    const budget = 2500;
    console.log(`  LCP ${lcp.toFixed(0)} ms (budget ${budget} ms, 4G: 9 Mbps down, 170 ms RTT)`);
    if (lcp > budget) fail(`LCP ${lcp.toFixed(0)} ms exceeds ${budget} ms`);
    pass('listing detail paints inside §24.18’s budget on 4G');

    console.log(bold('5. §18.2 S08 — inquiry, reply and close (over the API)'));
    // The messaging UI is the mobile app's (§18.2); the web app links to it.
    // The journey is still asserted, over the same endpoints the app calls.
    const conversation = await api('/conversations', {
      method: 'POST',
      headers: buyerAuth,
      body: JSON.stringify({
        contextType: 'listing',
        contextId: listing.id,
        participantId: seller.profile.id,
        firstMessage: 'Merhaba, at hâlâ satılık mı? Deneme binişi mümkün mü?',
      }),
    });
    pass(`buyer opened conversation ${conversation.conversationId}`);

    await api(`/conversations/${conversation.conversationId}/messages`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ body: 'Merhaba, evet satılık. Deneme binişi için müsaitiz.' }),
    });
    pass('seller replied');

    await api(`/listings/${listing.id}/close`, {
      method: 'POST',
      headers: auth,
      // §18.2 S14: closing as sold-on-platform must name the buyer — the
      // schema refuses without it, because that is what makes the sale
      // attributable and what §22's North Star counts.
      body: JSON.stringify({
        reason: 'sold_on_platform',
        soldToProfileId: buyer.profile.id,
        price: 450000,
        pricePublic: true,
      }),
    });

    await fetch(`${API}/v1/jobs/search-sync`, {
      method: 'POST',
      headers: {
        'x-cron-secret':
          process.env.CRON_SECRET ?? 'local-dev-secret-only-not-for-production-32chars',
      },
    });

    const after = await fetch(
      `${API}/v1/listings/search?q=${encodeURIComponent(`E2E ${STAMP}`)}`,
    ).then(json);
    if ((after.meta?.total ?? 0) !== 0) {
      fail(`the closed listing is still searchable (${after.meta.total} results)`);
    }
    pass('listing closed, and it left the index');

    if (errors.length > 0) {
      fail(`the browser reported ${errors.length} page error(s): ${errors[0]}`);
    }
    pass('no uncaught page errors across the run');

    console.log('\n\x1b[32m✓ §24.22 journey complete, §24.18 measured\x1b[0m');
  } finally {
    await browser.close();
  }
}

/**
 * Largest Contentful Paint under §24.18's "4G".
 *
 * CDP throttling rather than a real slow link, which is what Lighthouse does
 * too: 9 Mbps down / 1.5 Mbps up / 170 ms RTT is its "Slow 4G" preset. The
 * cache is disabled so this measures a first visit, which is the visit that
 * matters for a listing arriving from search.
 */
async function measureLcp(browser, url) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const client = await context.newCDPSession(page);

  await client.send('Network.enable');
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (9 * 1024 * 1024) / 8,
    uploadThroughput: (1.5 * 1024 * 1024) / 8,
    latency: 170,
  });

  await page.goto(url, { waitUntil: 'load' });

  const lcp = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let latest = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) latest = entry.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });

        // LCP is only final once the page stops changing. Settle briefly, then
        // report the last candidate — the same shape as web-vitals' own
        // "report on hidden" rule, without needing the tab to be hidden.
        setTimeout(() => resolve(latest), 1500);
      }),
  );

  await context.close();
  return lcp;
}

await main();
