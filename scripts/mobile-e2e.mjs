#!/usr/bin/env node
/**
 * End-to-end walk of the mobile app's signed-in flows, in a real browser.
 *
 * The screenshot pass proves screens render; it cannot prove the buttons do
 * anything, and the endpoint paths the app calls were guessed from the spec
 * rather than read from the controllers — four of them were wrong and every
 * one failed silently into an empty state. This drives the actual UI: taps a
 * real button, waits for the screen it should produce, and fails loudly when
 * it does not.
 *
 * It runs against the Expo web export, which is the same React tree the
 * native build renders. What it does not cover is anything native — the
 * keychain, push, the OAuth sheets — and it does not claim to.
 *
 *   node scripts/mobile-e2e.mjs http://localhost:4400
 */
import { existsSync } from 'node:fs';

import { chromium } from 'playwright';

/**
 * Where Chromium is.
 *
 * This container ships one at a fixed path and tells Playwright to skip its
 * own download; CI installs Playwright's instead. So: use CHROME_PATH if it
 * is set and real, otherwise the container's copy if it exists, otherwise let
 * Playwright resolve its own. Passing a path that does not exist fails with
 * ENOENT rather than falling back.
 */
const CANDIDATE =
  process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const LAUNCH = existsSync(CANDIDATE) ? { executablePath: CANDIDATE } : {};

const base = (process.argv[2] ?? 'http://localhost:4400').replace(/\/$/, '');
const DB = process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/only_horses';

/**
 * Approve identity verification for an account, in the database.
 *
 * §17's KYC provider is not wired — it needs credentials this repository must
 * not carry — so there is no in-app path to `identity_verified` and the
 * acceptance scripts all grant it this way. Everything downstream of the gate
 * is exercised for real; only the gate itself is stubbed.
 */
async function verifyIdentity(accountEmail) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: DB });
  await client.connect();
  try {
    const found = await client.query(
      `SELECT p.id FROM profiles p JOIN auth.users u ON u.id = p.id WHERE u.email = $1`,
      [accountEmail],
    );
    const profileId = found.rows[0]?.id;
    if (!profileId) throw new Error(`no profile for ${accountEmail}`);

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
const stamp = Date.now();
const email = `mobile-e2e-${stamp}@onlyhorses.test`;
const password = 'e2e-password-123';
const horseName = `Ekran ${stamp % 100000}`;
const productTitle = `Eyer altı ${stamp % 100000}`;

const browser = await chromium.launch(LAUNCH);
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  colorScheme: 'dark',
});

const page = await context.newPage();

const failures = [];
const errors = [];

page.on('pageerror', (error) => errors.push(error.message));

let stepNumber = 0;

async function step(name, run) {
  stepNumber += 1;
  const label = `${String(stepNumber).padStart(2, '0')} ${name}`;

  try {
    await run();
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
    return true;
  } catch (error) {
    failures.push({ label, message: String(error.message ?? error).split('\n')[0] });
    console.log(`  \x1b[31m✗\x1b[0m ${label}`);
    console.log(`      ${String(error.message ?? error).split('\n')[0]}`);
    return false;
  }
}

/** Wait for the app to leave the splash and settle on a route. */
async function go(path) {
  await page.goto(`${base}${path}`, { waitUntil: 'load', timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1800);
}

const byLabel = (label) => page.getByLabel(label, { exact: false }).first();

/**
 * Press a control by its accessible name, not by page text.
 *
 * Substring text matching picked the wrong node more than once: "Kaydet" also
 * matches the sentence "Kaydettiğinde bu at senin ahırına eklenir", so the
 * walk clicked a paragraph, nothing happened, and the step still passed
 * because the name it then looked for was on screen anyway. A test that
 * silently clicks prose is worse than no test.
 */
async function tap(name, role = 'button') {
  const target = page.getByRole(role, { name, exact: true }).first();
  await target.waitFor({ state: 'visible', timeout: 15_000 });
  await target.click();
  await page.waitForTimeout(900);
}

async function expectText(text, timeout = 15_000) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout });
}

/** Assert on the whole rendered screen, for text split across nodes. */
async function expectScreen(fragment) {
  const body = await page.evaluate(() => document.body.innerText);
  if (!body.includes(fragment)) {
    throw new Error(`screen does not contain ${JSON.stringify(fragment)}`);
  }
}

console.log(`\n\x1b[1mmobile e2e\x1b[0m  ${base}  as ${email}\n`);

// ── browsing, signed out ──────────────────────────────────────────────────
await step('home lists horses from the API', async () => {
  await go('/');
  await expectText('Yeni ilanlar');
  const demo = await page.getByText('örnek veri').count();
  if (demo > 0) throw new Error('fell back to the demo dataset with the API up');
});

await step('search returns live results', async () => {
  await go('/ara');
  await expectText('ilan');
  const rows = await page.getByRole('link').count();
  if (rows < 3) throw new Error(`only ${rows} results rendered`);
});

await step('a listing opens', async () => {
  await go('/ara');
  await page.getByRole('link').first().click();
  await page.waitForTimeout(1500);
  await expectText('Künye');
});

// ── register ──────────────────────────────────────────────────────────────
const registered = await step('register creates a session', async () => {
  await go('/auth');
  await tap('Kaydol', 'tab');
  await byLabel('Ad soyad').fill('E2E Kullanıcı');
  await byLabel('E-posta').fill(email);
  await byLabel('Parola').fill(password);
  await tap('Hesap oluştur');
  // Registration lands on the role picker.
  await expectText('Atlarla ne yapıyorsun');
});

if (registered) {
  await step('role picker saves and enters the app', async () => {
    await tap('At sahibi', 'checkbox');
    await tap('Devam');
    await expectText('Yeni ilanlar', 20_000);
  });

  await step('profile shows the signed-in account', async () => {
    await go('/profil');
    await expectText('E2E Kullanıcı');
  });

  await step('§3.3 blocks publishing before identity verification', async () => {
    await go('/ilan-ver');
    await expectText('kimliğini doğrula');
  });

  await step('the stable is empty and says so', async () => {
    await go('/ahir');
    await expectText('Ahırın boş');
  });

  await step('the horse wizard creates a horse', async () => {
    await go('/ahir/yeni');
    await byLabel('Adı').fill(horseName);
    await tap('Kısrak');
    await tap('Devam');
    await tap('Devam'); // physical, all optional
    await tap('Devam'); // disciplines
    await tap('Devam'); // documents
    await tap('Kaydet');
    await page.waitForTimeout(2500);
    // The wizard replaces itself with the horse record on success. Still
    // sitting on the composer means the save silently failed.
    if (page.url().includes('/ahir/yeni')) throw new Error('still on the wizard after saving');
    await expectScreen('Geçmiş');
  });

  await step('the new horse appears in the stable', async () => {
    await go('/ahir');
    await expectScreen(horseName);
  });

  await step('the horse record offers its health log', async () => {
    await go('/ahir');
    await tap(horseName);
    await page.waitForTimeout(2500);
    await expectScreen('Geçmiş');
    await tap('Sağlık kaydı');
    await page.waitForTimeout(2500);
    await expectScreen('sağlık kaydı varsayılan olarak gizlidir');

    // A record, entered and read back, with its date. §12 answers this
    // endpoint in camelCase while most list endpoints are snake_cased, and
    // reading it wrong renders a log where nothing says when — which is the
    // one thing a health log is for.
    await tap('Kayıt ekle');
    await page.waitForTimeout(2000);
    await byLabel('Başlık').fill('Grip aşısı');
    await tap('1 yıl');
    await tap('Kaydet');
    await page.waitForTimeout(3000);
    await expectScreen('Grip aşısı');
    await expectScreen('Sıradaki ·');
  });

  await step('uploading a photo attaches it to the horse', async () => {
    await go('/ahir');
    await tap(horseName);
    await page.waitForTimeout(2500);

    // §10.1's picker is native; the file chooser is what stands in for it on
    // web, and the three-step upload behind it is the same code either way.
    const chooser = page.waitForEvent('filechooser', { timeout: 15_000 });
    await tap('Galeri');
    (await chooser).setFiles({
      name: 'at.png',
      mimeType: 'image/png',
      // A 1×1 PNG: the pipeline is what is under test, not the picture.
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
    });

    await page.waitForTimeout(7000);

    // react-native-web's `Image` is not an `<img>` — it paints the source onto
    // a nested element's background — so the check is the labelled frame plus
    // the signed URL behind it, not a tag name.
    const frames = await page.locator('[aria-label="At fotoğrafı"]').count();
    if (frames === 0) throw new Error('no photo frame rendered after the upload');

    const painted = await page.evaluate(() => {
      const frame = document.querySelector('[aria-label="At fotoğrafı"]');
      return frame ? /media\/local-download|storage\.googleapis/.test(frame.innerHTML) : false;
    });
    if (!painted) throw new Error('the photo frame has no image behind it');
  });

  await step('a competition result joins the horse timeline', async () => {
    await go('/ahir');
    await tap(horseName);
    await page.waitForTimeout(2500);
    await tap('Yarışma ekle');
    await page.waitForTimeout(1500);
    await byLabel('Yarışma').fill('Bölgesel Engel Atlama');
    await byLabel('Derece').fill('3');
    await tap('Kaydet');
    await page.waitForTimeout(3000);
    // Back on the record, the result must be in §20.4's timeline.
    await expectScreen('Bölgesel Engel Atlama');
  });

  await step('§6 transfer is reachable and warns before handing the record away', async () => {
    await go('/ahir');
    await tap(horseName);
    await page.waitForTimeout(2500);
    await tap('Yeni sahibine devret');
    await page.waitForTimeout(1500);
    await expectScreen('Kayıt atla birlikte gider');
    await byLabel('Yeni sahibin e-postası').fill('alici@onlyhorses.test');
    await tap('Devri başlat');
    await page.waitForTimeout(800);
    await expectScreen('Emin misin');
  });

  await step('saving a listing persists to the account', async () => {
    await go('/ara');
    await page.getByRole('link').first().click();
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Kaydet', exact: true }).first().click();
    await page.waitForTimeout(1200);
    await go('/kaydedilenler');
    const empty = await page.getByText('Kaydettiğin ilan yok').count();
    if (empty > 0) throw new Error('the save did not reach the account');
  });

  await step('messaging a seller opens a thread', async () => {
    await go('/ara');
    await page.getByRole('link').first().click();
    await page.waitForTimeout(1500);
    await tap('Satıcıya yaz');
    await expectScreen('§16');
    await tap('Gönder');
    await page.waitForTimeout(3000);
    // Landing in the thread means the conversation was created.
    if (!page.url().includes('/mesajlar/')) throw new Error('did not land in a thread');
    // `innerText` does not include placeholder text, so assert on the composer
    // control itself and on the message that was just sent.
    await page.getByLabel('Mesaj', { exact: true }).first().waitFor({ state: 'visible' });
    await expectScreen('ilgileniyorum');
  });

  await step('the inbox shows the thread', async () => {
    await go('/mesajlar');
    const empty = await page.getByText('Kutun boş').count();
    if (empty > 0) throw new Error('the inbox is empty after sending a message');
  });

  await step('a saved search is created and listed with its alert', async () => {
    await go('/ara');
    await page.getByRole('button', { name: 'Aramayı kaydet', exact: true }).first().click();
    await page.waitForTimeout(2500);
    await go('/aramalarim');
    const empty = await page.getByText('Kayıtlı araman yok').count();
    if (empty > 0) throw new Error('the saved search did not reach the account');
    await expectScreen('Her taramada');
  });

  await step('notifications open and can be read', async () => {
    await go('/bildirimler');
    // Either there is something or the empty state says so; a blank screen is
    // the failure this catches.
    await expectScreen('Bildirim');
  });

  await step('a job opens and can be applied to', async () => {
    await go('/isler');
    await page.getByRole('link').first().click();
    await page.waitForTimeout(2500);
    await expectScreen('İş tanımı');
    await byLabel('Ön yazı').fill(
      'Iki yildir nalbant yaninda calisiyorum, saha ziyaretlerine alisigim ve ehliyetim var.',
    );
    await tap('Başvuruyu gönder');
    await page.waitForTimeout(3000);
    await expectScreen('Başvurun gönderildi');
  });

  await step('a service opens and messages its provider', async () => {
    await go('/hizmetler');
    await page.getByRole('link').first().click();
    await page.waitForTimeout(2500);
    await expectScreen('Açıklama');
    await byLabel('Mesaj').fill('Merhaba, önümüzdeki hafta nakliye için uygun musunuz?');
    await tap('Gönder');
    await page.waitForTimeout(3000);
    if (!page.url().includes('/mesajlar/')) throw new Error('the service enquiry opened no thread');
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

    // §3.3 covers products too, on the same terms as horses: this account is
    // unverified (step 07), so the rule is stated here and the button routes
    // to the ladder instead of into a 403 the screen would swallow.
    await expectScreen('Yayınlamak için kimlik doğrulaması gerekiyor');
    await tap('Yayınla');
    await page.waitForTimeout(2000);
    if (!page.url().includes('/dogrulama')) {
      throw new Error('publishing unverified did not route to the verification ladder');
    }

    // Grant the level the way the acceptance scripts do — §17's provider needs
    // credentials this repository must not carry — then publish for real.
    await verifyIdentity(email);
    await go('/urunlerim');
    await tap('Yayınla');
    await page.waitForTimeout(2500);
    await expectScreen('Yayında');
  });

  await step('my listings is empty and points at the stable', async () => {
    await go('/ilanlarim');
    await expectText('Henüz ilanın yok');
  });

  await step('settings can rename the account', async () => {
    await go('/ayarlar');
    await byLabel('Görünen ad').fill('E2E Yeniden');
    await tap('Kaydet');
    await page.waitForTimeout(1500);
    await go('/profil');
    await expectText('E2E Yeniden');
  });

  await step('sign out returns the signed-out profile', async () => {
    await go('/profil');
    await tap('Çıkış yap');
    await expectScreen('Giriş yap veya kaydol');
  });

  await step('sign in restores the session', async () => {
    await go('/auth');
    await byLabel('E-posta').fill(email);
    await byLabel('Parola').fill(password);
    await tap('Giriş yap');
    await page.waitForTimeout(2500);
    await go('/ahir');
    await expectScreen(horseName);
  });
}

await browser.close();

const noisy = errors.filter(
  (line) => !line.includes('ResizeObserver') && !line.includes('Download the React DevTools'),
);

console.log('');
if (noisy.length > 0) {
  console.log(`\x1b[31m${noisy.length} uncaught page error(s)\x1b[0m`);
  for (const line of noisy.slice(0, 8)) console.log(`  ${line}`);
}

if (failures.length === 0 && noisy.length === 0) {
  console.log(`\x1b[32m✓ ${stepNumber} steps passed\x1b[0m`);
} else {
  console.log(`\x1b[31m✗ ${failures.length} of ${stepNumber} steps failed\x1b[0m`);
  process.exitCode = 1;
}
