#!/usr/bin/env bash
#
# M6 acceptance run (spec §23, §24).
#
# M6's Definition of Done is "§24 fully green", so this script covers the
# acceptance criteria that had no home in M0–M5:
#
#   §24.5  — a saved search produces a push within 5 minutes of a match
#   §24.14 — deletion erases the person, anonymizes reviews, keeps the horse
#   §24.26 — legal pages published in tr + en
#   §24.27 — the export is complete
#
# The criteria M6 cannot verify in this environment (§24.17 mobile cold start,
# §24.19 crash-free sessions, §24.20 Sentry, §24.29 store review) are reported
# in docs/ACCEPTANCE.md rather than faked here.
set -euo pipefail

API="${API:-http://localhost:3001}"
WEB="${WEB:-http://localhost:3000}"
STAMP="$(date +%s)"
PASSWORD="guclu-sifre-123"
DB="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:5432/only_horses}"
CRON_SECRET="${CRON_SECRET:-local-dev-secret-only-not-for-production-32chars}"

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$1"; exit 1; }
pass() { printf '\033[32m✓ %s\033[0m\n' "$1"; }
json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

register() {
  local response
  response=$(curl -sS -X POST "$API/v1/auth/register" -H 'content-type: application/json' \
    -d "{\"email\":\"$1-$STAMP@example.com\",\"password\":\"$PASSWORD\",\"displayName\":\"$2\"}")
  case "$response" in
    *RATE_LIMITED*) fail "auth rate limit hit (§12: 10 per 5 min per IP) — wait and re-run" ;;
  esac
  echo "$response" | json "d['data']['tokens']['accessToken']"
}

profile_id_of() {
  curl -sS "$API/v1/me" -H "authorization: Bearer $1" | json "d['data']['id']"
}

verify_identity() {
  psql "$DB" -q -c "
    INSERT INTO verifications (profile_id, kind, status, provider, decided_at)
    VALUES ('$1', 'identity', 'approved', 'stripe_identity', now());
    UPDATE profiles SET verification_level = 'identity_verified' WHERE id = '$1';"
}

cron() { curl -sS -X POST "$API/v1/jobs/$1" -H "x-cron-secret: $CRON_SECRET"; }
drain_index() { cron search-sync > /dev/null; }

# ── fixtures ───────────────────────────────────────────────────────────
say "0. Fixtures"
BUYER=$(register buyer "Alici Test")
SELLER=$(register seller "Satici Test")
BUYER_ID=$(profile_id_of "$BUYER")
SELLER_ID=$(profile_id_of "$SELLER")
verify_identity "$BUYER_ID"
verify_identity "$SELLER_ID"
pass "two identity-verified accounts"

# ── 1. §12 saved items ─────────────────────────────────────────────────
say "1. §18.2 S29 — saved items"

psql "$DB" -q <<SQL
INSERT INTO horses (id, slug, name, sex, owner_profile_id, breed_id, color, height_cm, date_of_birth)
VALUES ('11111111-0000-4000-8000-$(printf '%012d' "$((STAMP % 999999999999))")'::uuid,
        'm6-horse-$STAMP', 'M6 Kısrak', 'mare', '$SELLER_ID', 'arabian', 'doru', 162, DATE '2017-04-01');

INSERT INTO listings (slug, horse_id, seller_profile_id, type, status, title, description,
                      price_amount, price_currency, price_type, country_code, region, city,
                      quality_score, published_at, expires_at)
SELECT 'm6-listing-$STAMP', h.id, '$SELLER_ID', 'sale', 'active',
       'M6-$STAMP Arap kısrak', 'Kayıtlı arama testleri için ilan.',
       18000, 'EUR', 'fixed', 'TR', 'Ankara', 'Ankara', 70, now(), now() + INTERVAL '60 days'
FROM horses h WHERE h.slug = 'm6-horse-$STAMP';
SQL

LISTING_ID=$(psql "$DB" -tAc "SELECT id FROM listings WHERE slug = 'm6-listing-$STAMP'")

curl -sS -X POST "$API/v1/saved" -H "authorization: Bearer $BUYER" -H 'content-type: application/json' \
  -d "{\"itemType\":\"listing\",\"itemId\":\"$LISTING_ID\",\"note\":\"Cuma bak\"}" > /dev/null

SAVED=$(curl -sS "$API/v1/saved" -H "authorization: Bearer $BUYER")
TITLE=$(echo "$SAVED" | json "d['data'][0]['title']")
NOTE=$(echo "$SAVED" | json "d['data'][0]['note']")
[ "$TITLE" = "M6-$STAMP Arap kısrak" ] || fail "the saved list did not resolve the listing title: $SAVED"
[ "$NOTE" = "Cuma bak" ] || fail "the note was lost"

COUNT=$(psql "$DB" -tAc "SELECT save_count FROM listings WHERE id = '$LISTING_ID'")
[ "$COUNT" = "1" ] || fail "save_count is $COUNT, expected 1 (trigger, not the saver)"
pass "saved with a note, title resolved, seller's save_count bumped by the trigger"

curl -sS -X DELETE "$API/v1/saved/listing/$LISTING_ID" -H "authorization: Bearer $BUYER" -o /dev/null
COUNT=$(psql "$DB" -tAc "SELECT save_count FROM listings WHERE id = '$LISTING_ID'")
[ "$COUNT" = "0" ] || fail "unsaving left save_count at $COUNT"
pass "unsaving decrements the counter"

# ── 2. §24.5 saved-search alerts ───────────────────────────────────────
say "2. §24.5 — a saved search notifies within 5 minutes of a match"

SEARCH=$(curl -sS -X POST "$API/v1/saved-searches" -H "authorization: Bearer $BUYER" \
  -H 'content-type: application/json' \
  -d '{"name":"Ankara arap kısrak","entity":"listings",
       "query":{"breeds":["arabian"],"sexes":["mare"],"region":"Ankara"},
       "alertFrequency":"instant","alertChannel":["push","in_app"]}')
SEARCH_ID=$(echo "$SEARCH" | json "d['data']['id']")

# Saving must not notify about what already matched — §24.5 is about listings
# published *after* the search was saved.
drain_index
cron saved-search-alerts > /dev/null
EXISTING=$(psql "$DB" -tAc "SELECT count(*) FROM notifications WHERE profile_id = '$BUYER_ID' AND type = 'saved_search.match'")
[ "$EXISTING" = "0" ] || fail "saving a search immediately notified about $EXISTING existing listings"
pass "saving a search does not notify about listings that already matched"

# A new listing is published. Written directly for the same reason as M5's
# fixtures: the publish path has its own acceptance run, and what §24.5 tests
# is the alert path.
PUBLISHED_AT=$(date +%s)
psql "$DB" -q <<SQL
INSERT INTO horses (id, slug, name, sex, owner_profile_id, breed_id, color, height_cm, date_of_birth)
VALUES (gen_random_uuid(), 'm6-horse-new-$STAMP', 'M6 Yeni Kısrak', 'mare', '$SELLER_ID',
        'arabian', 'kır', 158, DATE '2019-03-01');

INSERT INTO listings (slug, horse_id, seller_profile_id, type, status, title, description,
                      price_amount, price_currency, price_type, country_code, region, city,
                      quality_score, published_at, expires_at)
SELECT 'm6-listing-new-$STAMP', h.id, '$SELLER_ID', 'sale', 'active',
       'M6-$STAMP Yeni Arap kısrak', 'Kayıtlı aramaya uyan yeni ilan.',
       21000, 'EUR', 'fixed', 'TR', 'Ankara', 'Ankara', 70, now(), now() + INTERVAL '60 days'
FROM horses h WHERE h.slug = 'm6-horse-new-$STAMP';
SQL

# The index has to catch up first — §11.4's outbox is the only path from a
# published listing to a searchable one, and the alert replays a search.
drain_index

# `instant` searches are due five minutes after their last run, so the run a
# moment ago has to be aged for this sweep to consider it. That five minutes is
# §24.5's budget, not a delay in the test.
psql "$DB" -q -c "UPDATE saved_searches SET last_run_at = now() - INTERVAL '6 minutes' WHERE id = '$SEARCH_ID'"

RESULT=$(cron saved-search-alerts)
NOTIFIED=$(echo "$RESULT" | json "d['data']['notified']")
[ "$NOTIFIED" = "1" ] || fail "the sweep notified $NOTIFIED users: $RESULT"

ELAPSED=$(( $(date +%s) - PUBLISHED_AT ))
BODY=$(psql "$DB" -tAc "SELECT title FROM notifications WHERE profile_id = '$BUYER_ID' AND type = 'saved_search.match'")
echo "$BODY" | grep -q "Ankara arap kısrak" || fail "the notification does not name the search: $BODY"
[ "$ELAPSED" -lt 300 ] || fail "publish → push took ${ELAPSED}s, §24.5 allows 300"
printf '  publish → push in %ss (budget 300s)\n' "$ELAPSED"
pass "the matching listing produced one push naming the saved search"

# Running again must not re-notify: the watermark moved.
cron saved-search-alerts > /dev/null
AGAIN=$(psql "$DB" -tAc "SELECT count(*) FROM notifications WHERE profile_id = '$BUYER_ID' AND type = 'saved_search.match'")
[ "$AGAIN" = "1" ] || fail "a second sweep sent $AGAIN notifications for the same listing"
pass "the watermark stops the same listing being announced twice"

OFF=$(curl -sS -X PATCH "$API/v1/saved-searches/$SEARCH_ID" -H "authorization: Bearer $BUYER" \
  -H 'content-type: application/json' -d '{"alertFrequency":"off"}' -o /dev/null -w '%{http_code}')
[ "$OFF" = "204" ] || fail "turning alerts off returned $OFF"
DUE=$(psql "$DB" -tAc "SELECT count(*) FROM list_due_saved_searches(500) WHERE id = '$SEARCH_ID'")
[ "$DUE" = "0" ] || fail "a search with alerts off is still due"
pass "alerts can be switched off without deleting the search"

# ── 3. §24.27 export ───────────────────────────────────────────────────
say "3. §24.27 — the export is complete"

EXPORT=$(curl -sS -X POST "$API/v1/me/export" -H "authorization: Bearer $SELLER")
EXPORT_ID=$(echo "$EXPORT" | json "d['data']['id']")
DUE_AT=$(echo "$EXPORT" | json "d['data']['dueAt']")
[ -n "$DUE_AT" ] || fail "no 24-hour deadline recorded: $EXPORT"

DATA=$(curl -sS "$API/v1/me/export/$EXPORT_ID" -H "authorization: Bearer $SELLER")
for SECTION in profile horses listings savedItems savedSearches conversations reviewsWritten \
               verifications subscriptions purchases notifications media; do
  echo "$DATA" | python3 -c "
import json,sys
payload = json.load(sys.stdin)['data']
assert '$SECTION' in payload, 'missing section: $SECTION'
" || fail "the export is missing the '$SECTION' section"
done

HORSES=$(echo "$DATA" | json "len(d['data']['horses'])")
[ "$HORSES" -ge 2 ] || fail "the export lists $HORSES horses, expected the seller's 2"
NAME=$(echo "$DATA" | json "d['data']['profile']['display_name']")
[ "$NAME" = "Satici Test" ] || fail "the export does not contain the profile"
pass "the export carries every section, including the seller's $HORSES horses"

OTHERS=$(curl -sS "$API/v1/me/export/$EXPORT_ID" -H "authorization: Bearer $BUYER")
echo "$OTHERS" | grep -q "bulunamadı" || fail "another user could download someone else's export"
pass "an export belongs to the person who asked for it"

# ── 4. §24.14 erasure ──────────────────────────────────────────────────
say "4. §24.14 — deletion erases the person and keeps the horse"

# A review the buyer wrote about the seller: §24.14 says it is anonymized,
# never deleted, when its author leaves.
# -q as well as -tA: psql prints the "INSERT 0 1" command tag to stdout
# alongside the returned row, and it would end up inside the uuid.
CONVERSATION=$(psql "$DB" -tAqc "
  INSERT INTO conversations (stream_channel_id, context_type, context_id, created_by)
  VALUES ('m6-$STAMP', 'listing', '$LISTING_ID', '$BUYER_ID') RETURNING id")
psql "$DB" -q -c "
  INSERT INTO reviews (author_id, subject_type, subject_profile_id, conversation_id, rating, body)
  VALUES ('$BUYER_ID', 'user', '$SELLER_ID', '$CONVERSATION', 5, 'Çok düzgün bir satıcı.');"

psql "$DB" -q -c "UPDATE profiles SET legal_hold = TRUE WHERE id = '$BUYER_ID'"
REFUSED=$(curl -sS -X DELETE "$API/v1/me/account" -H "authorization: Bearer $BUYER")
echo "$REFUSED" | grep -q "uyuşmazlık" || fail "a profile under legal hold could schedule deletion: $REFUSED"
psql "$DB" -q -c "UPDATE profiles SET legal_hold = FALSE WHERE id = '$BUYER_ID'"
pass "§26's legal hold blocks the request, with a reason"

SCHEDULED=$(curl -sS -X DELETE "$API/v1/me/account" -H "authorization: Bearer $BUYER")
REQUEST_ID=$(echo "$SCHEDULED" | json "d['data']['id']")
DAYS=$(psql "$DB" -tAc "SELECT round(EXTRACT(EPOCH FROM (due_at - now())) / 86400) FROM data_requests WHERE id = '$REQUEST_ID'")
[ "$DAYS" = "30" ] || fail "the deletion is due in $DAYS days, §24.14 says 30"

# Nothing happens yet: the 30 days are the user's window to change their mind.
cron marketplace-sweeps > /dev/null
STILL=$(psql "$DB" -tAc "SELECT deleted_at IS NULL FROM profiles WHERE id = '$BUYER_ID'")
[ "$STILL" = "t" ] || fail "the account was erased before its 30 days ran out"

CANCELLED=$(curl -sS -X POST "$API/v1/me/account/restore" -H "authorization: Bearer $BUYER" | json "d['data']['cancelled']")
[ "$CANCELLED" = "True" ] || fail "a scheduled deletion could not be cancelled"
pass "deletion is scheduled for 30 days, does nothing before then, and can be cancelled"

# Now let it run: the clock is moved rather than waited out.
curl -sS -X DELETE "$API/v1/me/account" -H "authorization: Bearer $BUYER" > /dev/null
psql "$DB" -q -c "UPDATE data_requests SET due_at = now() - INTERVAL '1 day'
                  WHERE profile_id = '$BUYER_ID' AND kind = 'delete' AND status = 'pending'"

SWEEP=$(cron marketplace-sweeps)
[ "$(echo "$SWEEP" | json "d['data']['erasures']")" = "1" ] || fail "the sweep erased nobody: $SWEEP"

DELETED=$(psql "$DB" -tAc "SELECT deleted_at IS NOT NULL FROM profiles WHERE id = '$BUYER_ID'")
[ "$DELETED" = "t" ] || fail "the profile is not marked deleted"
PHONE=$(psql "$DB" -tAc "SELECT COALESCE(phone_e164, '-') FROM profiles WHERE id = '$BUYER_ID'")
[ "$PHONE" = "-" ] || fail "the phone number survived erasure"
psql "$DB" -tAc "SELECT display_name FROM profiles WHERE id = '$BUYER_ID'" | grep -q "Silinmiş" \
  || fail "the display name was not erased"
EMAIL=$(psql "$DB" -tAc "SELECT email FROM auth.users WHERE id = '$BUYER_ID'")
echo "$EMAIL" | grep -q "deleted.invalid" || fail "the email address survived: $EMAIL"
pass "name, email and phone are gone; the profile reads 'Silinmiş kullanıcı'"

REVIEW=$(psql "$DB" -tAc "SELECT body, author_name_snapshot FROM reviews WHERE author_id = '$BUYER_ID'")
echo "$REVIEW" | grep -q "Çok düzgün bir satıcı" || fail "the review was deleted rather than anonymized"
echo "$REVIEW" | grep -q "Alici Test" || fail "no author snapshot was preserved: $REVIEW"
pass "the review survives under the name snapshot taken when it was written (§13.4)"

# The other half of §24.14: the horse record survives, with provenance.
# Scoped to this run: a dev database accumulates fixtures from earlier ones.
HORSES=$(psql "$DB" -tAc "SELECT count(*) FROM horses WHERE slug LIKE '%$STAMP'")
[ "$HORSES" = "2" ] || fail "erasing a buyer removed horse records"
pass "horse records are untouched by a buyer's erasure"

# And a seller's erasure keeps the horse but preserves who owned it.
psql "$DB" -q -c "
  INSERT INTO horse_ownership_history (horse_id, owner_profile_id, from_date)
  SELECT id, '$SELLER_ID', CURRENT_DATE - 400 FROM horses WHERE slug = 'm6-horse-$STAMP';"
curl -sS -X DELETE "$API/v1/me/account" -H "authorization: Bearer $SELLER" > /dev/null
psql "$DB" -q -c "UPDATE data_requests SET due_at = now() - INTERVAL '1 day'
                  WHERE profile_id = '$SELLER_ID' AND kind = 'delete' AND status = 'pending'"
cron marketplace-sweeps > /dev/null

PROVENANCE=$(psql "$DB" -tAc "SELECT owner_name_text FROM horse_ownership_history
                              WHERE owner_profile_id = '$SELLER_ID'")
[ "$PROVENANCE" = "Satici Test" ] || fail "owner_name_text was not preserved, got '$PROVENANCE'"
SURVIVES=$(psql "$DB" -tAc "SELECT count(*) FROM horses WHERE slug = 'm6-horse-$STAMP'")
[ "$SURVIVES" = "1" ] || fail "the horse record was deleted with its owner"
WITHDRAWN=$(psql "$DB" -tAc "SELECT status FROM listings WHERE slug = 'm6-listing-$STAMP'")
[ "$WITHDRAWN" = "withdrawn" ] || fail "the seller's live listing is still $WITHDRAWN"
pass "the horse survives its owner's deletion with owner_name_text preserved (§2, §24.14)"

# ── 5. §24.26 legal pages ──────────────────────────────────────────────
say "5. §24.26 — ToS, Privacy, Welfare and Cookies, in tr and en"

if ! curl -sS -o /dev/null --max-time 3 "$WEB" 2>/dev/null; then
  fail "the web app is not running on $WEB — start it with 'pnpm --filter web start'"
fi

for SLUG in kosullar gizlilik refah-politikasi cerezler topluluk-kurallari guvenli-alim itiraz-ve-bildirim; do
  for LOCALE in tr en; do
    CODE=$(curl -sS -o /tmp/legal.html -w '%{http_code}' "$WEB/$LOCALE/$SLUG")
    [ "$CODE" = "200" ] || fail "$LOCALE/$SLUG returned $CODE"
    # A page that renders its heading but no body is a stub, not a policy.
    WORDS=$(python3 -c "
import re,sys
html = open('/tmp/legal.html', encoding='utf-8').read()
text = re.sub(r'<[^>]+>', ' ', html)
print(len(text.split()))")
    [ "$WORDS" -gt 120 ] || fail "$LOCALE/$SLUG has only $WORDS words — that is a stub"
    # Each page must link to its counterpart in the other language.
    OTHER=$([ "$LOCALE" = "tr" ] && echo en || echo tr)
    grep -q "/$OTHER/$SLUG" /tmp/legal.html || fail "$LOCALE/$SLUG does not link to its $OTHER version"
  done
done
pass "7 policy documents × 2 languages, each substantive and cross-linked"

# The four §24.26 requires by name must state what they are actually about.
curl -sS "$WEB/tr/kosullar" | grep -q "komisyon almaz" || fail "the ToS does not state §16.3's no-commission position"
curl -sS "$WEB/en/gizlilik" | grep -q "30 days" || fail "the privacy policy does not state §24.14's deletion window"
curl -sS "$WEB/tr/refah-politikasi" | grep -q "6 aydan küçük" || fail "the welfare policy does not carry §14.4's foal rule"
curl -sS "$WEB/en/cerezler" | grep -qi "no advertising cookies" || fail "the cookie notice is vague about advertising"
pass "each policy states the rule the code actually enforces"

SITEMAP=$(curl -sS "$WEB/sitemap.xml")
echo "$SITEMAP" | grep -q "refah-politikasi" || fail "the policies are missing from the sitemap"
pass "policy pages are in the sitemap, both locales"

# ── 6. §24.13 blocking ─────────────────────────────────────────────────
say "6. §24.13 — a block hides the blocked seller's listings from the blocker"

BLOCKER=$(register blocker "Engelleyen Kisi")
BLOCKER_ID=$(profile_id_of "$BLOCKER")

# A fresh seller: the one above was erased two sections ago, and their
# listings were withdrawn with them.
RIVAL=$(register rival "Engellenen Satici")
RIVAL_ID=$(profile_id_of "$RIVAL")
verify_identity "$RIVAL_ID"

psql "$DB" -q <<SQL
INSERT INTO horses (id, slug, name, sex, owner_profile_id, breed_id, color, height_cm, date_of_birth)
VALUES (gen_random_uuid(), 'm6-horse-block-$STAMP', 'M6 Engel Kısrak', 'mare', '$RIVAL_ID',
        'arabian', 'doru', 160, DATE '2018-06-01');

INSERT INTO listings (slug, horse_id, seller_profile_id, type, status, title, description,
                      price_amount, price_currency, price_type, country_code, region, city,
                      quality_score, published_at, expires_at)
SELECT 'm6-listing-block-$STAMP', h.id, '$RIVAL_ID', 'sale', 'active',
       'M6BLOCK-$STAMP Arap kısrak', 'Engelleme testleri için ilan.',
       17000, 'EUR', 'fixed', 'TR', 'Ankara', 'Ankara', 70, now(), now() + INTERVAL '60 days'
FROM horses h WHERE h.slug = 'm6-horse-block-$STAMP';
SQL
drain_index

# The listing is visible to the blocker before the block.
VISIBLE=$(curl -sS "$API/v1/listings/search?q=M6BLOCK-$STAMP&limit=20" -H "authorization: Bearer $BLOCKER" \
  | json "d['meta']['total']")
[ "$VISIBLE" -ge 1 ] || fail "the seller's listings are not searchable to begin with"

curl -sS -X POST "$API/v1/blocks" -H "authorization: Bearer $BLOCKER" \
  -H 'content-type: application/json' -d "{\"profileId\":\"$RIVAL_ID\"}" > /dev/null

AFTER=$(curl -sS "$API/v1/listings/search?q=M6BLOCK-$STAMP&limit=20" -H "authorization: Bearer $BLOCKER" \
  | json "d['meta']['total']")
[ "$AFTER" = "0" ] || fail "$AFTER of the blocked seller's listings are still visible to the blocker"

# Only for the blocker: a block is not a takedown.
OTHERS=$(curl -sS "$API/v1/listings/search?q=M6BLOCK-$STAMP&limit=20" | json "d['meta']['total']")
[ "$OTHERS" -ge 1 ] || fail "blocking removed the listings for everyone, not just the blocker"
pass "the blocked seller disappears for the blocker and stays visible to everyone else"

say "M6 acceptance: all checks passed"
