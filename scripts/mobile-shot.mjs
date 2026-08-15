#!/usr/bin/env node
/**
 * Screenshot the mobile app's web export at phone size, and report anything
 * the page logged on the way.
 *
 * The mobile app is the half of this product nobody in this environment can
 * run: there is no simulator and no device. What there is, is Expo's web
 * target — the same React tree, the same components, the same tokens, rendered
 * by react-native-web. That is not proof the native build works, and it is not
 * claimed to be. What it does catch is everything that is actually wrong most
 * of the time: a screen that throws, a route that does not resolve, text the
 * same colour as its background, a layout that overflows a 390 pt viewport.
 *
 *   node scripts/mobile-shot.mjs <base-url> <route> [more routes...]
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';

const CHROME =
  process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const OUT = process.env.SHOT_DIR ?? '/tmp/mobile-shots';

const [base, ...routes] = process.argv.slice(2);
if (!base || routes.length === 0) {
  console.error('usage: node scripts/mobile-shot.mjs <base-url> <route> [route...]');
  process.exit(1);
}

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({
  // iPhone 14 logical size — §20.3's measurements are drawn for this width.
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  colorScheme: 'dark',
});

let problems = 0;

for (const route of routes) {
  const page = await context.newPage();
  const logs = [];

  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      logs.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => logs.push(`pageerror: ${error.message}`));

  const url = new URL(route, base).toString();
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 });

  // The splash replaces itself after 1.2 s and the fonts have to swap in
  // before a screenshot means anything.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2200);

  const name = route.replace(/[^\w-]+/g, '_') || 'root';
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

  // A screen that rendered nothing is the failure this is here to catch, and
  // it screenshots as a plausible-looking dark rectangle.
  const text = await page.evaluate(() => document.body.innerText.trim().length);

  const noisy = logs.filter(
    (line) =>
      // react-native-web logs these for props it maps to CSS it does not
      // support; they are not defects in the app.
      !line.includes('"shadow*" style props are deprecated') &&
      !line.includes('props.pointerEvents is deprecated') &&
      !line.includes('Download the React DevTools'),
  );

  const bad = text < 10 || noisy.length > 0;
  if (bad) problems += 1;

  console.log(
    `${bad ? '\x1b[31m✗\x1b[0m' : '\x1b[32m✓\x1b[0m'} ${route.padEnd(24)} ${String(text).padStart(5)} chars  ${name}.png`,
  );
  for (const line of noisy.slice(0, 6)) console.log(`      ${line}`);

  await page.close();
}

await browser.close();

console.log(`\nshots in ${OUT}`);
if (problems > 0) process.exitCode = 1;
