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

# These read `searchParams` or fetch per-request data. Next's static export
# refuses both, and rightly: a page whose whole job is to answer a query cannot
# be a file.
for ROUTE in atlar hizmetler isler; do
  rm -rf "$WORK/web/src/app/[locale]/$ROUTE"
done
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
# Jekyll would otherwise swallow Next's _next/ directory on Pages.
touch "$REPO_ROOT/apps/web/out/.nojekyll"

if [ "$OUT" != "$REPO_ROOT/apps/web/out" ]; then
  rm -rf "$OUT"
  mv "$REPO_ROOT/apps/web/out" "$OUT"
fi

find "$OUT" -name '*.html' | sed "s|$OUT||" | sort
printf '\n\033[32m✓ static preview in %s\033[0m\n' "$OUT"
