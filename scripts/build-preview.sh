#!/usr/bin/env bash
#
# Builds the static preview published to GitHub Pages.
#
# What this is: the landing page, the pricing page and the §24.26 policy pages,
# exported as plain HTML so the design system (§20) and the copy can be looked
# at without standing up an API, a database or Stripe.
#
# What this is not: the product. GitHub Pages serves static files, and the
# marketplace is server-rendered against a live API — search, listings,
# messaging and everything behind a login need the Cloud Run deployment
# described in docs/DEPLOY.md. Those routes are removed from the preview build
# rather than shipped as permanently empty pages that would misrepresent it.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${OUT:-$REPO_ROOT/apps/web/out}"
# GitHub Pages serves a project site under /<repo>; override for a user site.
BASE_PATH="${PAGES_BASE_PATH:-}"

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }

say "1. Building shared-types"
pnpm --filter @only-horses/shared-types build

say "2. Removing the API-backed routes from a scratch copy"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cp -r "$REPO_ROOT/apps/web" "$WORK/web"
rm -rf "$WORK/web/node_modules" "$WORK/web/.next" "$WORK/web/out"

# The marketplace pages read `searchParams`, which a static export refuses —
# a page whose whole job is to answer a query cannot be a file. Rather than
# delete them (the first version of this script did, which left a horse
# marketplace where you could read the terms of service and not look at a
# horse), swap in the preview variants from src/preview/routes. They render
# the committed demo dataset and filter it in the browser.
for ROUTE in atlar hizmetler isler; do
  cp "$WORK/web/src/preview/routes/$ROUTE/page.tsx" "$WORK/web/src/app/[locale]/$ROUTE/page.tsx"
done

# "İlan ver" exists only in the preview. §18.2 puts the publish flow in the
# app, and the web app has no such route — but the *decisions* it makes are
# pure functions (§13.2, §14.4), so the preview can run them honestly.
mkdir -p "$WORK/web/src/app/[locale]/ilan-ver"
cp "$WORK/web/src/preview/routes/ilan-ver/page.tsx" "$WORK/web/src/app/[locale]/ilan-ver/page.tsx"

# The listing detail page needs no rewrite: lib/api.ts serves it from the demo
# dataset under NEXT_PUBLIC_STATIC_PREVIEW, so the preview shows the real page,
# with the real components, against the real types. It only needs to be told
# which slugs to emit.
cat >> "$WORK/web/src/app/[locale]/atlar/[slug]/page.tsx" <<'PARAMS'

// Appended by scripts/build-preview.sh — static export only.
import { DEMO_LISTINGS as PREVIEW_LISTINGS } from '@/content/demo';

export function generateStaticParams() {
  return PREVIEW_LISTINGS.flatMap((listing) => [
    { locale: 'tr', slug: listing.slug },
    { locale: 'en', slug: listing.slug },
  ]);
}
PARAMS

# Detail routes with no demo data behind them would export as empty pages.
rm -rf "$WORK/web/src/app/[locale]/hizmetler/[slug]" "$WORK/web/src/app/[locale]/isler/[slug]"
# The sitemap enumerates live listings; a static copy would go stale the moment
# anything is published. robots.txt is a route handler, which a static export
# refuses without `force-static` — and a preview should not be telling crawlers
# anything anyway.
rm -f "$WORK/web/src/app/sitemap.ts" "$WORK/web/src/app/robots.ts"

# Swap the scratch copy into place for the build, then put the real one back.
mv "$REPO_ROOT/apps/web/src" "$WORK/original-src"
cp -r "$WORK/web/src" "$REPO_ROOT/apps/web/src"
restore() {
  rm -rf "$REPO_ROOT/apps/web/src"
  mv "$WORK/original-src" "$REPO_ROOT/apps/web/src"
  rm -rf "$WORK"
}
trap restore EXIT

say "3. Exporting"
(
  cd "$REPO_ROOT/apps/web"
  STATIC_PREVIEW=1 \
  PAGES_BASE_PATH="$BASE_PATH" \
  NEXT_PUBLIC_STATIC_PREVIEW=1 \
  NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-https://example.github.io}" \
    pnpm exec next build
)

say "4. Result"

# Where the export landed.
#
# With the default distDir, `output: 'export'` writes to `out/`. With a custom
# one — and this build uses `.next-preview` so it cannot clobber the production
# `.next` — Next writes the export inside that directory instead. Nothing warns
# about the difference: the build succeeds and `out/` simply is not there,
# which is how a green local run and a red CI run came from the same script.
EXPORTED=""
for CANDIDATE in "$REPO_ROOT/apps/web/out" "$REPO_ROOT/apps/web/.next-preview"; do
  if [ -f "$CANDIDATE/index.html" ]; then EXPORTED="$CANDIDATE"; break; fi
done

if [ -z "$EXPORTED" ]; then
  echo "no static export found — looked for index.html in apps/web/{out,.next-preview}" >&2
  exit 1
fi

rm -rf "$OUT"
mkdir -p "$(dirname "$OUT")"
cp -r "$EXPORTED" "$OUT"

# Jekyll would otherwise swallow Next's _next/ directory on Pages.
touch "$OUT/.nojekyll"

find "$OUT" -name '*.html' | sed "s|$OUT||" | sort
printf '\n\033[32m✓ static preview in %s\033[0m\n' "$OUT"
