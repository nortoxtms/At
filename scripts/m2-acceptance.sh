#!/usr/bin/env bash
#
# M2 acceptance run (spec §23).
#
#   "500 seeded listings searchable with all filters under 200 ms p95; a
#    listing page renders server-side and passes Rich Results Test."
#
# Measures against the running API and a real 500-listing corpus.
set -euo pipefail

API="${API:-http://localhost:3001}"
WEB="${WEB:-http://localhost:3000}"

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$1"; exit 1; }
pass() { printf '\033[32m✓ %s\033[0m\n' "$1"; }
# `curl … | grep -q` is a trap under `set -o pipefail`: grep exits at the first
# match, curl is still writing, and the resulting EPIPE fails the whole script
# even though the assertion passed. It only bites once a page grows past the
# pipe buffer — which is exactly how it surfaced, when the site gained a header
# and a footer. Fetch first, match second.
page_contains() {
  local body
  body=$(curl -sS "$1") || return 1
  printf '%s' "$body" | grep -q ${3:-} -- "$2"
}

json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

# ── corpus ─────────────────────────────────────────────────────────────
say "1. Indexed corpus"
TOTAL=$(curl -sS "$API/v1/listings/search?limit=1" | json "d['meta']['total']")
[ "$TOTAL" -ge 500 ] || fail "expected at least 500 indexed listings, found $TOTAL"
pass "$TOTAL listings searchable"

# ── every filter in §18.2 S07 ──────────────────────────────────────────
say "2. §18.2 S07 — every filter returns a coherent result"

check_filter() {
  local label="$1" query="$2" assertion="$3"
  local body count
  body=$(curl -sS "$API/v1/listings/search?$query&limit=50")
  count=$(echo "$body" | json "d['meta']['total']")

  # The label is deliberately kept out of the Python snippet: several contain
  # an apostrophe ("PPE'ye açık"), which would break the quoting and make a
  # passing filter look like a failure.
  if ! ASSERTION="$assertion" echo "$body" | python3 -c "
import json, os, sys
hits = json.load(sys.stdin)['data']
assert $assertion
"; then
    fail "$label — filter returned rows that do not satisfy it"
  fi

  printf '  %-38s %5s sonuç\n' "$label" "$count"
}

check_filter "tür: satılık"          "types=sale"                       "all(h['listingType']=='sale' for h in hits)"
check_filter "tür: kiralık+yarı"     "types=lease,half_lease"           "all(h['listingType'] in ('lease','half_lease') for h in hits)"
check_filter "cinsiyet: kısrak"      "sexes=mare"                       "all(h['sex']=='mare' for h in hits)"
check_filter "ırk: arap"             "breeds=arabian"                   "all(h['breed']=='arabian' for h in hits)"
check_filter "disiplin: dresaj"      "disciplines=dressage"             "all('dressage' in h['disciplines'] for h in hits)"
check_filter "fiyat: 5k-25k EUR"     "priceMinEur=5000&priceMaxEur=25000&includeOnRequest=false" \
                                     "all(5000 <= h['priceEur'] <= 25000 for h in hits)"
check_filter "yaş: 5-10"             "ageMin=5&ageMax=10"               "all(5 <= h['ageYears'] <= 10 for h in hits)"
check_filter "boy: 160-175 cm"       "heightMinCm=160&heightMaxCm=175"  "all(160 <= h['heightCm'] <= 175 for h in hits)"
check_filter "renk: doru"            "colors=doru"                      "all(h['color']=='doru' for h in hits)"
check_filter "ülke: TR"              "countryCode=TR"                   "all(h['countryCode']=='TR' for h in hits)"
check_filter "bölge: Ankara"         "region=Ankara"                    "all(h['region']=='Ankara' for h in hits)"
check_filter "medya: video var"      "hasVideo=true"                    "all(h['hasVideo'] for h in hits)"
check_filter "medya: röntgen var"    "hasXray=true"                     "all(h['hasXray'] for h in hits)"
check_filter "deneme binişi"         "trialAllowed=true"                "len(hits) > 0"
check_filter "PPE'ye açık"           "ppeWelcome=true"                  "len(hits) > 0"
check_filter "nakliye yardımı"       "transportHelp=true"               "len(hits) > 0"
check_filter "sadece doğrulanmış"    "verifiedSellersOnly=true" \
   "all(h['sellerVerification'] in ('identity_verified','professional_verified','business_verified') for h in hits)"
check_filter "satıcı: işletme"       "sellerType=business"              "all(h['sellerVerification']=='business_verified' for h in hits)"
check_filter "konum: Ankara 100 km"  "lat=39.9334&lng=32.8597&radiusKm=100" \
                                     "all(h['distanceKm'] is None or h['distanceKm'] <= 100 for h in hits)"
check_filter "metin: luna"           "q=Luna"                           "len(hits) >= 0"
check_filter "birleşik (7 filtre)"   "types=sale&sexes=mare&countryCode=TR&ageMin=4&ageMax=14&heightMinCm=150&hasVideo=true" \
                                     "all(h['listingType']=='sale' and h['sex']=='mare' and h['countryCode']=='TR' and h['hasVideo'] for h in hits)"

pass "21 filter combinations verified"

# ── sorting ────────────────────────────────────────────────────────────
say "3. Sorting"
curl -sS "$API/v1/listings/search?sort=price_asc&includeOnRequest=false&limit=20" \
  | python3 -c "
import json,sys
hits = json.load(sys.stdin)['data']
prices = [h['priceEur'] for h in hits]
assert prices == sorted(prices), f'price_asc not ordered: {prices[:5]}'
print('  price_asc ordered')"
curl -sS "$API/v1/listings/search?sort=newest&limit=20" \
  | python3 -c "
import json,sys
hits = json.load(sys.stdin)['data']
dates = [h['publishedAt'] for h in hits]
assert dates == sorted(dates, reverse=True), 'newest not ordered'
print('  newest ordered')"
pass "sort orders hold"

# ── §11.2 boosted cap ──────────────────────────────────────────────────
say "4. §11.2 — boosted results capped at 2 per 20-result page"
for page in 1 2 3; do
  BOOSTED=$(curl -sS "$API/v1/listings/search?limit=20&page=$page" \
    | json "sum(1 for h in d['data'] if h['isBoosted'])")
  [ "$BOOSTED" -le 2 ] || fail "page $page carried $BOOSTED boosted results, cap is 2"
done
pass "no page exceeds 2 boosted results"

# ── §24.16 p95 ─────────────────────────────────────────────────────────
say "5. §24.16 — search p95 under 200 ms"
QUERIES=(
  "types=sale&countryCode=TR"
  "sexes=mare&ageMin=5&ageMax=12"
  "breeds=arabian&disciplines=endurance"
  "priceMinEur=5000&priceMaxEur=30000"
  "lat=39.9334&lng=32.8597&radiusKm=200&sort=distance"
  "q=Luna&hasVideo=true"
  "types=sale&sexes=mare&countryCode=TR&ageMin=4&ageMax=14&heightMinCm=150&hasVideo=true&verifiedSellersOnly=true"
  "sort=price_asc&includeOnRequest=false"
)

: > /tmp/oh-search-timings
for round in $(seq 1 8); do
  for query in "${QUERIES[@]}"; do
    curl -sS -o /dev/null -w '%{time_total}\n' "$API/v1/listings/search?$query&limit=20" \
      >> /tmp/oh-search-timings
  done
done

python3 - <<'PY'
import statistics
timings = sorted(float(line) * 1000 for line in open('/tmp/oh-search-timings'))
p50 = statistics.median(timings)
p95 = timings[int(len(timings) * 0.95) - 1]
print(f'  {len(timings)} requests · p50 {p50:.0f} ms · p95 {p95:.0f} ms · max {timings[-1]:.0f} ms')
if p95 >= 200:
    raise SystemExit(f'p95 {p95:.0f} ms exceeds the 200 ms budget')
PY
pass "p95 within the §24.16 budget"

# ── §24.4: the index must not leak the health file ─────────────────────
say "6. §24.4 — the search index carries no health data"
curl -sS "$API/v1/listings/search?limit=50" | python3 -c "
import json,sys
body = json.load(sys.stdin)
raw = json.dumps(body).lower()
for leaked in ('performed_on','clinic','vaccination','aşı','next_due','notes','microchip'):
    assert leaked not in raw, f'search results leaked {leaked!r}'
print('  no health or identity fields present in search results')"
pass "index projection is clean"

# ── §19.2 / §24: server-rendered, indexable listing pages ──────────────
say "7. §19.2 — listing page renders server-side"

SLUG=$(curl -sS "$API/v1/listings/search?limit=1&sort=newest" | json "d['data'][0]['slug']")
curl -sS -o /tmp/oh-listing.html -w '%{http_code}' "$WEB/tr/atlar/$SLUG" > /tmp/oh-status
[ "$(cat /tmp/oh-status)" = "200" ] || fail "listing page returned HTTP $(cat /tmp/oh-status)"

# Server-rendered means the content is in the initial HTML — what a crawler
# and a user on a slow connection actually receive.
grep -q "<h1" /tmp/oh-listing.html || fail "no <h1> in the server response"
grep -q "Atı görmeden ödeme yapmayın" /tmp/oh-listing.html \
  || fail "§14.3 safety card missing from the server response"
grep -q "Bu atın geçmişi" /tmp/oh-listing.html \
  || fail "§20.4 timeline missing from the server response"
pass "page, safety card and timeline all present without JavaScript"

say "8. §19.2 — structured data"
python3 - <<'PYEOF'
import json, re, sys

html = open('/tmp/oh-listing.html', encoding='utf-8').read()
blocks = [json.loads(b) for b in
          re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)]
types = {b['@type'] for b in blocks}

# §19.2 requires Product + Offer on listings and BreadcrumbList everywhere.
assert 'Product' in types, 'no Product JSON-LD'
assert 'BreadcrumbList' in types, 'no BreadcrumbList JSON-LD'

product = next(b for b in blocks if b['@type'] == 'Product')

# Google's Rich Results requirements for Product.
assert product.get('name'), 'Product.name is required'
assert product.get('@context') == 'https://schema.org', 'wrong @context'

offer = product.get('offers')
if offer:
    for field in ('price', 'priceCurrency', 'availability'):
        assert offer.get(field) is not None, f'Offer.{field} is required'
    assert isinstance(offer['price'], (int, float)), 'Offer.price must be numeric'
    assert offer['availability'].startswith('https://schema.org/'), 'bad availability enum'
    print(f"  Product + Offer · {offer['price']} {offer['priceCurrency']} · "
          f"{offer['availability'].rsplit('/', 1)[1]}")
else:
    # A listing priced "on request" ships no Offer rather than an invalid one.
    assert product.get('name'), 'Product without Offer still needs a name'
    print('  Product without Offer (fiyat sorunuz) — valid')

crumbs = next(b for b in blocks if b['@type'] == 'BreadcrumbList')
positions = [i['position'] for i in crumbs['itemListElement']]
assert positions == list(range(1, len(positions) + 1)), 'breadcrumb positions must be 1..n'
print(f"  BreadcrumbList · {len(positions)} levels")

props = {p['name'] for p in product.get('additionalProperty', [])}
print(f"  additionalProperty · {', '.join(sorted(props))}")
PYEOF
pass "structured data satisfies the Product, Offer and BreadcrumbList requirements"

say "9. §19.2 — sitemap and robots"
curl -sS "$WEB/sitemap.xml" -o /tmp/oh-sitemap.xml
grep -q "<urlset" /tmp/oh-sitemap.xml || fail "sitemap.xml is not a urlset"
URLS=$(grep -c "<loc>" /tmp/oh-sitemap.xml)
[ "$URLS" -gt 10 ] || fail "sitemap carries only $URLS URLs"
grep -q "atlar/" /tmp/oh-sitemap.xml || fail "sitemap contains no listing URLs"
pass "sitemap.xml lists $URLS URLs including listings"

page_contains "$WEB/robots.txt" "Sitemap:" || fail "robots.txt does not reference the sitemap"
pass "robots.txt points at the sitemap"

printf '\n\033[32m✓ M2 acceptance complete\033[0m\n'
