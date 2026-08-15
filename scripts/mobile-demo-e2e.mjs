#!/usr/bin/env node
/**
 * The demo, driven with no server at all.
 *
 * This is the run that matters for demo mode, and it is deliberately hostile:
 * the API is not merely ignored, it is unreachable — the base URL is pointed
 * at a closed port before the app loads. Anything that quietly falls back to
 * the network fails here rather than in front of someone.
 *
 * It walks the same journey as `mobile-e2e.mjs` and then checks the two things
 * a demo is usually wrong about: that what you create is still there after a
 * full reload, and that §5's lifecycle refuses a transition it should refuse
 * rather than saying yes to everything.
 *
 *   node scripts/mobile-demo-e2e.mjs http://localhost:4400
 */
import { existsSync } from 'node:fs';

import { chromium } from 'playwright';

const CANDIDATE =
  process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const LAUNCH = existsSync(CANDIDATE) ? { executablePath: CANDIDATE } : {};

const base = (process.argv[2] ?? 'http://localhost:4400').replace(/\/$/, '');
const stamp = Date.now();
const horseName = `Demo At ${stamp % 100000}`;
const productTitle = `Eyer altı ${stamp % 100000}`;

const browser = await chromium.launch(LAUNCH);
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  colorScheme: 'dark',
});

const page = await context.newPage();

const failures = [];
const errors = [];
const networkAttempts = [];

page.on('pageerror', (error) => errors.push(error.message));

// The whole point: nothing may reach the API. Any attempt is recorded and
// fails the run, whether it succeeds or not.
await context.route('**://*:3001/**', (route) => {
  networkAttempts.push(route.request().url());
  return route.abort();
});

let stepNumber = 0;

async function step(name, run) {
  stepNumber += 1;
  const label = `${String(stepNumber).padStart(2, '0')} ${name}`;

  try {
    await run();
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
    return true;
  } catch (error) {
    failures.push(label);
    console.log(`  \x1b[31m✗\x1b[0m ${label}`);
    console.log(`      ${String(error.message ?? error).split('\n')[0]}`);
    return false;
  }
}

async function go(path) {
  await page.goto(`${base}${path}`, { waitUntil: 'load', timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1800);
}

const byLabel = (label) => page.getByLabel(label, { exact: false }).first();

async function tap(name, role = 'button') {
  const target = page.getByRole(role, { name, exact: true }).first();
  await target.waitFor({ state: 'visible', timeout: 15_000 });
  await target.click();
  await page.waitForTimeout(900);
}

async function expectScreen(fragment) {
  const body = await page.evaluate(() => document.body.innerText);
  if (!body.includes(fragment)) {
    throw new Error(`screen does not contain ${JSON.stringify(fragment)}`);
  }
}

console.log(`\n\x1b[1mdemo mode\x1b[0m  ${base}  (API blocked)\n`);

await step('the demo starts from the sign-in screen', async () => {
  await go('/auth');
  await expectScreen('Sunucusuz dene');
  await tap('Demo olarak gir');
  await page.waitForTimeout(2500);
  await expectScreen('Demo modu');
});

await step('home shows listings with no server', async () => {
  await go('/');
  await expectScreen('Yeni ilanlar');
  await expectScreen('Demo modu');
});

await step('the seeded stable and its overdue reminder are there', async () => {
  await go('/ahir');
  await expectScreen('Sultan');
  await expectScreen('Nal değişimi');
});

await step('the seeded horse has a timeline', async () => {
  await go('/ahir');
  await tap('Sultan');
  await page.waitForTimeout(2000);
  await expectScreen('Geçmiş');
  await expectScreen('Kapadokya Dayanıklılık Kupası');
});

await step('a horse can be added', async () => {
  await go('/ahir/yeni');
  await byLabel('Adı').fill(horseName);
  await tap('Kısrak');
  for (let index = 0; index < 4; index += 1) await tap('Devam');
  await tap('Kaydet');
  await page.waitForTimeout(2500);
  if (page.url().includes('/ahir/yeni')) throw new Error('still on the wizard after saving');
  await expectScreen(horseName);
});

await step('a health record schedules its reminder', async () => {
  await go('/ahir');
  await tap(horseName);
  await page.waitForTimeout(2000);
  await tap('Sağlık kaydı');
  await page.waitForTimeout(2000);
  await tap('Kayıt ekle');
  await page.waitForTimeout(1500);
  await byLabel('Başlık').fill('Tetanoz aşısı');
  await tap('1 yıl');
  await tap('Kaydet');
  await page.waitForTimeout(2500);
  await expectScreen('Tetanoz aşısı');
  // Not just the title. §12 answers this endpoint in camelCase while most of
  // the list endpoints are snake_cased, and reading it wrong renders every
  // entry with a blank date and no reminder at all — a log that looks fine
  // until you notice none of it says when.
  await expectScreen('Sıradaki ·');
});

let listingSlug = null;

await step('a listing is composed, saved as a draft and published', async () => {
  await go('/ilan-ver');
  await expectScreen('Hangi at');
  await tap(horseName, 'radio');
  await tap('Devam'); // horse
  await tap('Devam'); // type
  await byLabel('Fiyat (TRY)').fill('450000');
  await tap('Devam'); // price
  await byLabel('Başlık').fill(`${horseName} — sahibinden`);
  await byLabel('Açıklama').fill(
    'Sakin mizaçlı, insana alışkın. Düzenli bakımlı, sağlık kaydı uygulamada tutuluyor.',
  );
  await tap('Devam');
  await tap('Taslağı kaydet');
  await page.waitForTimeout(2500);

  await expectScreen('Taslak');
  await tap('Yayınla');
  await page.waitForTimeout(2000);
  await expectScreen('Yayında');
});

await step('the published listing is findable in search', async () => {
  await go('/ara');
  await byLabel('Arama').fill(horseName);
  await page.waitForTimeout(2500);
  await expectScreen(horseName);

  const link = page.getByRole('link').first();
  await link.click();
  await page.waitForTimeout(2000);
  await expectScreen('Künye');
  listingSlug = page.url().split('/ilan/')[1] ?? null;
});

await step('§5 offers only the transitions the state allows', async () => {
  // An active listing pauses and closes; it cannot be published again. Checked
  // through the UI rather than a test hook, because the buttons *are* the rule
  // as far as anyone using the app is concerned.
  await go('/ilanlarim');
  await expectScreen('Yayında');

  if ((await page.getByRole('button', { name: 'Yayınla', exact: true }).count()) > 0) {
    throw new Error('an active listing still offers "Yayınla"');
  }

  for (const label of ['Duraklat', 'Kapat']) {
    if ((await page.getByRole('button', { name: label, exact: true }).count()) === 0) {
      throw new Error(`an active listing does not offer "${label}"`);
    }
  }

  // And pausing must actually move it.
  await tap('Duraklat');
  await page.waitForTimeout(2000);
  await expectScreen('Duraklatıldı');
  await tap('Yeniden yayınla');
  await page.waitForTimeout(2000);
  await expectScreen('Yayında');
});

await step('the equipment marketplace lists, filters and sells', async () => {
  await go('/urunler');
  await expectScreen('Koşum ve saraciye');

  // A group must roll its children up, or the taxonomy looks broken.
  await tap('Koşum ve saraciye');
  await page.waitForTimeout(2000);
  await expectScreen('Eyer');

  await go('/urunler');
  await byLabel('Ürün ara').fill('wintec');
  await page.waitForTimeout(2500);
  await expectScreen('Wintec');
  await page.getByRole('link').first().click();
  await page.waitForTimeout(2000);
  await expectScreen('Künye');
  await expectScreen('Teslimat');
});

await step('a product is listed and published', async () => {
  await go('/urunler/yeni');
  await byLabel('Kategori').fill('Eyer altı');
  await tap('Eyer altı');
  await tap('Devam');
  await byLabel('Başlık').fill(productTitle);
  await byLabel('Açıklama').fill(
    'Az kullanildi, temiz ve yikanmis. Dresaj kesim, beyaz. Kargo alici odemeli.',
  );
  await tap('Devam');
  await byLabel('Fiyat (TRY)').fill('750');
  await tap('Devam');
  await tap('Taslağı kaydet');
  await page.waitForTimeout(3000);

  await expectScreen(productTitle);
  await expectScreen('Taslak');
  await tap('Yayınla');
  await page.waitForTimeout(2500);
  await expectScreen('Yayında');
});

await step('a message gets a reply and lands in the inbox', async () => {
  await go('/ara');
  await page.getByRole('link').first().click();
  await page.waitForTimeout(2000);
  await tap('Satıcıya yaz');
  await page.waitForTimeout(1500);
  await tap('Gönder');
  await page.waitForTimeout(3000);
  if (!page.url().includes('/mesajlar/')) throw new Error('no thread opened');
  await expectScreen('ilgileniyorum');

  await go('/mesajlar');
  const empty = await page.getByText('Kutun boş').count();
  if (empty > 0) throw new Error('the inbox is empty after sending');
});

await step('saving a listing and a search both stick', async () => {
  await go('/ara');
  await page.getByRole('button', { name: 'Aramayı kaydet', exact: true }).first().click();
  await page.waitForTimeout(1500);
  await go('/aramalarim');
  if ((await page.getByText('Kayıtlı araman yok').count()) > 0) {
    throw new Error('the saved search did not stick');
  }

  await go('/ara');
  await page.getByRole('link').first().click();
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Kaydet', exact: true }).first().click();
  await page.waitForTimeout(1500);
  await go('/kaydedilenler');
  if ((await page.getByText('Kaydettiğin ilan yok').count()) > 0) {
    throw new Error('the saved listing did not stick');
  }
});

await step('notifications accumulate from what you did', async () => {
  await go('/bildirimler');
  await expectScreen('yayında');
});

await step('a job application and a service enquiry both go through', async () => {
  await go('/isler');
  await page.getByRole('link').first().click();
  await page.waitForTimeout(2000);
  await byLabel('Ön yazı').fill(
    'Iki yildir at bakiciligi yapiyorum, hafta sonlari dahil tam zamanli calisabilirim.',
  );
  await tap('Başvuruyu gönder');
  await page.waitForTimeout(2500);
  await expectScreen('Başvurun gönderildi');

  await go('/hizmetler');
  await page.getByRole('link').first().click();
  await page.waitForTimeout(2000);
  await byLabel('Mesaj').fill('Merhaba, önümüzdeki hafta için uygun musunuz?');
  await tap('Gönder');
  await page.waitForTimeout(3000);
  if (!page.url().includes('/mesajlar/')) throw new Error('the service enquiry opened no thread');
});

await step('everything survives a full reload', async () => {
  // The test a demo usually fails: close it, open it, and find your work gone.
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await go('/ahir');
  await expectScreen(horseName);
  await go('/ilanlarim');
  await expectScreen('Yayında');
});

await step('leaving the demo puts the sign-in door back', async () => {
  await go('/profil');
  await tap('Demodan çık');
  await page.waitForTimeout(2500);
  await go('/profil');
  await expectScreen('Giriş yap veya kaydol');
});

await browser.close();

const noisy = errors.filter(
  (line) => !line.includes('ResizeObserver') && !line.includes('React DevTools'),
);

console.log('');
if (networkAttempts.length > 0) {
  console.log(`\x1b[31m✗ ${networkAttempts.length} request(s) tried to reach the API\x1b[0m`);
  for (const url of [...new Set(networkAttempts)].slice(0, 8)) console.log(`  ${url}`);
}
for (const line of noisy.slice(0, 6)) console.log(`  pageerror: ${line}`);

if (failures.length === 0 && noisy.length === 0 && networkAttempts.length === 0) {
  console.log(`\x1b[32m✓ ${stepNumber} steps passed with no server\x1b[0m`);
} else {
  console.log(`\x1b[31m✗ ${failures.length} of ${stepNumber} steps failed\x1b[0m`);
  process.exitCode = 1;
}
