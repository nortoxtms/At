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

say "1. Building the packages the web app depends on"
# `^...` is "everything web depends on, but not web itself", resolved from the
# workspace graph rather than named here. Naming them was the bug: adding
# @only-horses/demo-content did not add it to this line, the package had no
# dist in CI, and the Pages build failed on four unresolved imports while
# `pnpm build` locally was green because dist happened to exist on disk.
pnpm --filter "@only-horses/web^..." build

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
for ROUTE in atlar urunler hizmetler isler uzmanlar; do
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
import { DEMO_LISTINGS as PREVIEW_LISTINGS } from '@only-horses/demo-content';

export function generateStaticParams() {
  return PREVIEW_LISTINGS.flatMap((listing) => [
    { locale: 'tr', slug: listing.slug },
    { locale: 'en', slug: listing.slug },
  ]);
}
PARAMS

# The product detail page needs no rewrite either — lib/api.ts serves it from
# the exported catalogue under NEXT_PUBLIC_STATIC_PREVIEW — only a list of
# slugs to emit.
cat >> "$WORK/web/src/app/[locale]/urunler/[slug]/page.tsx" <<'PARAMS'

// Appended by scripts/build-preview.sh — static export only.
import { DEMO_PRODUCTS as PREVIEW_PRODUCTS } from '@only-horses/demo-content';

export function generateStaticParams() {
  return PREVIEW_PRODUCTS.flatMap((product) => [
    { locale: 'tr', slug: product.slug },
    { locale: 'en', slug: product.slug },
  ]);
}
PARAMS

# Detail routes with no demo data behind them would export as empty pages. The
# public profile is one: the demo carries listings and products, not the people
# behind them, and a profile page for a placeholder yard is a page about nobody.
rm -rf "$WORK/web/src/app/[locale]/hizmetler/[slug]" "$WORK/web/src/app/[locale]/isler/[slug]"

# The public profile does have demo data behind it — DEMO_PROFILES is derived
# from the sellers already in the dataset — so it exports, and the seller link
# on every listing and product card goes somewhere.
cat >> "$WORK/web/src/app/[locale]/profil/[handle]/page.tsx" <<'PARAMS'

// Appended by scripts/build-preview.sh — static export only.
import { DEMO_PROFILES as PREVIEW_PROFILES } from '@only-horses/demo-content';

export function generateStaticParams() {
  return Object.keys(PREVIEW_PROFILES).flatMap((handle) => [
    { locale: 'tr', handle },
    { locale: 'en', handle },
  ]);
}
PARAMS

# The signed-in screens need a server: they read an httpOnly cookie, call the
# API as that person and redirect when there is no session. A static export has
# no request to read a cookie from, so these are removed rather than shipped as
# forms that post into nothing.
rm -rf "$WORK/web/src/app/[locale]/(hesap)"
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
  # Next writes generated route types to .next/types even when distDir points
  # somewhere else, so this build leaves behind a type file for `ilan-ver` — a
  # route that exists only while the scratch copy is swapped in. tsconfig
  # includes .next/types, so the next `pnpm typecheck` then fails on a module
  # that was never in the repository. Three separate red typechecks came from
  # exactly this before anyone traced it here.
  rm -rf "$REPO_ROOT/apps/web/.next/types"
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

# When Next wrote the export straight into `out/`, it is already where it
# needs to be — and `rm -rf "$OUT"` would delete the very directory the next
# line copies from. That is a self-destruct that only fires on the code path
# where everything went right.
if [ "$EXPORTED" != "$OUT" ]; then
  rm -rf "$OUT"
  mkdir -p "$(dirname "$OUT")"
  cp -r "$EXPORTED" "$OUT"
fi

# Jekyll would otherwise swallow Next's _next/ directory on Pages.
touch "$OUT/.nojekyll"

find "$OUT" -name '*.html' | sed "s|$OUT||" | sort
printf '\n\033[32m✓ static preview in %s\033[0m\n' "$OUT"
