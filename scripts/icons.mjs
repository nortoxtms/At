#!/usr/bin/env node
/**
 * Render every app icon from one SVG.
 *
 * Expo wants five rasters at four sizes, and Android's adaptive icon wants the
 * foreground and the background as separate layers. Producing those by hand
 * means they drift: one gets re-exported, four do not, and the app shows one
 * icon on the home screen and a different one in the app switcher.
 *
 * So `apps/mobile/assets/icon.svg` is the source and this makes the rest.
 *
 *   node scripts/icons.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'apps/mobile/assets');
const WEB = join(ROOT, 'apps/web/public');

const GROUND = '#1A1610';
const CREAM = '#F4EFE6';

const { default: sharp } = await import(
  join(ROOT, 'apps/api/node_modules/sharp/lib/index.js')
).catch(() => import('sharp'));

const { readFileSync } = await import('node:fs');
const source = readFileSync(join(ASSETS, 'icon.svg'));

/**
 * Android draws the adaptive icon's layers separately and masks them to
 * whatever shape the launcher uses, so the foreground must have no background
 * of its own and must keep its subject inside the safe circle — roughly the
 * middle 66%. Handing it the full-bleed icon gets the horse's ears cropped on
 * any round-mask launcher.
 */
const foreground = Buffer.from(
  source
    .toString('utf8')
    .replace(/<rect width="1024" height="1024" fill="url\(#ground\)"\/>/, '')
    .replace(/<circle cx="512"[^>]*\/>/, '')
    // Scaled up rather than padded out. Padding the viewBox left the horse at
    // about a quarter of the frame — technically inside the safe zone and
    // visibly a speck on the launcher. The mark is ~634 units tall, so 1.05
    // puts it at roughly 65% of the layer: the top of the safe circle, which
    // is where an adaptive foreground is meant to sit.
    .replace('scale(0.78)', 'scale(1.05)'),
);

/** The monochrome layer is a mask: one colour, no ground, themed by Android. */
const monochrome = Buffer.from(
  foreground
    .toString('utf8')
    .replace(new RegExp(GROUND, 'gi'), '#000000')
    .replace(new RegExp(CREAM, 'gi'), '#FFFFFF'),
);

async function render(svg, size, out) {
  const png = await sharp(svg, { density: 400 }).resize(size, size).png().toBuffer();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, png);
  console.log(`\x1b[32m✓\x1b[0m ${out.replace(`${ROOT}/`, '')} (${size}px)`);
}

await render(source, 1024, join(ASSETS, 'icon.png'));
await render(source, 1024, join(ASSETS, 'splash-icon.png'));
await render(foreground, 1024, join(ASSETS, 'android-icon-foreground.png'));
await render(monochrome, 1024, join(ASSETS, 'android-icon-monochrome.png'));
await render(source, 64, join(ASSETS, 'favicon.png'));

// A flat background layer, because Android composites the foreground over it.
const background = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="${GROUND}"/></svg>`,
);
await render(background, 1024, join(ASSETS, 'android-icon-background.png'));

// The web app shares the mark; a different favicon there would read as a
// different product.
await render(source, 64, join(WEB, 'favicon.png'));
await render(source, 180, join(WEB, 'apple-touch-icon.png'));
