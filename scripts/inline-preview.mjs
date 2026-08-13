#!/usr/bin/env node
/**
 * Folds a page of the static export into one self-contained HTML file.
 *
 * Why this exists: the export in `apps/web/out` is a real Next.js site — one
 * HTML file per route plus a shared `_next/` directory of CSS and JS. That is
 * exactly right for a web server and useless for anywhere you can only put a
 * single file: opening it from disk, attaching it, publishing it somewhere
 * with no asset hosting.
 *
 * So: inline the stylesheet, drop the scripts. Dropping the scripts is safe
 * here and not a compromise — these pages are server-rendered, and the
 * JavaScript only rehydrates them. What is left is the same markup, the same
 * design system (§20) and the same copy, with no network requests at all.
 *
 *   node scripts/inline-preview.mjs <page.html> <output.html>
 *
 * Runs against `apps/web/out`, so build it first (scripts/build-preview.sh).
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error('usage: node scripts/inline-preview.mjs <page.html> <output.html>');
  process.exit(1);
}

const OUT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../apps/web/out');

let html = await readFile(input, 'utf8');

// Stylesheets are referenced with the Pages base path (/At/_next/...). Strip
// any leading path segments and resolve against the export root, so this works
// whichever base path the bundle was built with.
const links = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)];
for (const [tag] of links) {
  const href = tag.match(/href="([^"]+)"/)?.[1]?.replaceAll('&amp;', '&');
  if (!href) continue;

  const css = href.startsWith('http')
    ? await remoteStylesheet(href)
    : await readFile(path.join(OUT_DIR, href.slice(href.indexOf('/_next/'))), 'utf8');

  html = html.replace(tag, `<style>${css}</style>`);
}

/**
 * Fetches a remote stylesheet and embeds the fonts it points at.
 *
 * §20 names Fraunces and Inter, and the page is loading them from Google
 * Fonts. Dropping the link would leave the layout intact and the typography
 * wrong, which for a design preview is the half that matters — so each
 * `url(...)` is fetched and rewritten as a data URI.
 *
 * Latin and latin-ext only. The full stylesheet also carries Cyrillic, Greek
 * and Vietnamese subsets; embedding those would multiply the file size for
 * glyphs no Turkish or English page renders.
 */
async function remoteStylesheet(url) {
  const response = await fetch(url, {
    // Google serves woff2 only to browsers it recognises; without this it
    // returns the ttf stylesheet, which is several times larger.
    headers: {
      'user-agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    },
  });
  const source = await response.text();

  const blocks = source
    .split('/*')
    .filter((block) => /^\s*(latin|latin-ext)\s*\*\//.test(block))
    .map((block) => block.slice(block.indexOf('*/') + 2));

  let css = blocks.join('\n');

  for (const [, fontUrl] of [...css.matchAll(/url\((https:\/\/[^)]+)\)/g)]) {
    const font = Buffer.from(await (await fetch(fontUrl)).arrayBuffer());
    css = css.replace(fontUrl, `data:font/woff2;base64,${font.toString('base64')}`);
  }

  return css;
}

// Both the external chunks and the inline hydration payload. The payload is
// the larger half — it is a serialized copy of the whole React tree, and with
// nothing left to hydrate it, it is dead weight.
html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
html = html.replace(/<link[^>]+rel="preload"[^>]*>/g, '');
// Nothing is fetched any more, so a preconnect is a DNS lookup for its own
// sake — and the promise this script makes is "no external requests".
html = html.replace(/<link[^>]+rel="preconnect"[^>]*>/g, '');

// Internal links point at routes this single file does not carry. Leaving them
// live would produce a page that looks whole and 404s on every click.
html = html.replace(/href="\/[^"]*"/g, 'href="#"');

await writeFile(output, html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`${output} — ${kb} kB, no external requests`);
