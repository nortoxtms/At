#!/usr/bin/env node
/**
 * WCAG contrast audit over rendered pages, in both colour schemes.
 *
 * §20.1 defines the palette but nothing checked that the palette, applied,
 * produces readable text. It did not: the dark theme rendered cream text on a
 * sand ground at 1.27:1, because `bg-sand` compiled to a fixed light hex while
 * the theme switched the body colour. That is a class of bug no amount of
 * reading the token file finds — it only appears once a browser has resolved
 * the cascade.
 *
 * So this asks the browser. Every text node that actually renders, its
 * computed colour against its nearest painted background, checked against
 * WCAG AA: 4.5:1 for body text, 3:1 for large text (>= 24px, or >= 18.66px
 * bold).
 *
 *   node scripts/contrast-audit.mjs http://localhost:4321/At/ [more urls...]
 */
import { chromium } from 'playwright';

const CHROME =
  process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const urls = process.argv.slice(2);
if (urls.length === 0) {
  console.error('usage: node scripts/contrast-audit.mjs <url> [url...]');
  process.exit(1);
}

const AUDIT = () => {
  const parse = (value) => {
    const match = value.match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
  };

  const luminance = ({ r, g, b }) => {
    const channel = (c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };

  const ratio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  // Composite the background the way the browser does: walk up collecting
  // every painted layer, then blend them back down. Treating a semi-opaque
  // layer as "not a background" and skipping to the parent reports the wrong
  // colour — an ink chip at 85 % over white is a dark grey, not white, and
  // flagging cream text on it as 1.12:1 is a false alarm that trains you to
  // ignore the tool.
  const blend = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  });

  const backgroundOf = (element) => {
    const layers = [];
    let node = element;

    while (node && node.nodeType === 1) {
      const background = parse(getComputedStyle(node).backgroundColor);
      if (background && background.a > 0.001) {
        layers.push(background);
        if (background.a >= 0.999) break;
      }
      node = node.parentElement;
    }

    // The page's own ground, under everything.
    let result = layers.length && layers[layers.length - 1].a >= 0.999
      ? layers.pop()
      : { r: 255, g: 255, b: 255, a: 1 };

    for (let index = layers.length - 1; index >= 0; index -= 1) {
      result = blend(layers[index], result);
    }

    return result;
  };

  const findings = [];
  const seen = new Set();

  for (const element of document.querySelectorAll('body *')) {
    const text = Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent.trim())
      .join(' ')
      .trim();

    if (!text) continue;

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.opacity === '0') continue;

    const foreground = parse(style.color);
    if (!foreground || foreground.a < 0.1) continue;

    const background = backgroundOf(element);
    const contrast = ratio(foreground, background);

    const size = parseFloat(style.fontSize);
    const bold = Number(style.fontWeight) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const required = large ? 3 : 4.5;

    if (contrast >= required) continue;

    const key = `${style.color}|${style.backgroundColor}|${text.slice(0, 30)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    findings.push({
      text: text.slice(0, 60),
      color: style.color,
      background: `rgb(${Math.round(background.r)} ${Math.round(background.g)} ${Math.round(background.b)})`,
      contrast: Number(contrast.toFixed(2)),
      required,
      fontSize: size,
      tag: element.tagName.toLowerCase(),
    });
  }

  return findings;
};

const browser = await chromium.launch({ executablePath: CHROME });
let failures = 0;

for (const scheme of ['light', 'dark']) {
  const context = await browser.newContext({ colorScheme: scheme });
  const page = await context.newPage();

  console.log(`\n\x1b[1m${scheme.toUpperCase()}\x1b[0m`);

  for (const url of urls) {
    await page.goto(url, { waitUntil: 'networkidle' });
    const findings = await page.evaluate(AUDIT);

    if (findings.length === 0) {
      console.log(`  \x1b[32m✓\x1b[0m ${url}`);
      continue;
    }

    failures += findings.length;
    console.log(`  \x1b[31m✗\x1b[0m ${url} — ${findings.length} below WCAG AA`);
    for (const finding of findings) {
      console.log(
        `      ${String(finding.contrast).padStart(5)}:1 (needs ${finding.required})  ` +
          `${finding.color} on ${finding.background}  <${finding.tag}> "${finding.text}"`,
      );
    }
  }

  await context.close();
}

await browser.close();

console.log('');
if (failures === 0) {
  console.log('\x1b[32m✓ every rendered text node meets WCAG AA in both schemes\x1b[0m');
} else {
  console.log(`\x1b[31m✗ ${failures} contrast failure(s)\x1b[0m`);
  process.exitCode = 1;
}
