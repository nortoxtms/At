#!/usr/bin/env bash
#
# M5 acceptance run (spec §23).
#
#   "All three tiers purchasable and downgradable; limits enforced
#    server-side; boosted listing verifiably ranks higher and is labeled."
#
# Plus the two acceptance criteria that only exist here:
#   §24.10 — every Stripe webhook is idempotent (replay 3× → one effect)
#   §24.11 — downgrading Pro → Free with 8 active listings pauses the newest 5
#            and notifies; it never silently deletes content.
#
# Runs against the local billing provider (ADR-0007). It does not move money;
# it produces the same signed webhooks Stripe would, and every effect under
# test is applied by the same handler production uses.
set -euo pipefail

API="${API:-http://localhost:3001}"
STAMP="$(date +%s)"
PASSWORD="guclu-sifre-123"
DB="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:5432/only_horses}"
SECRET="${WEBHOOK_SECRET:-local-dev-secret-only-not-for-production-32chars}"
CRON_SECRET="$SECRET"

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

# The local provider signs an HMAC-SHA256 over the raw body with JWT_SECRET and
# reads it from the same `stripe-signature` header Stripe uses, so the webhook
# route's verification path is the production one.
send_webhook() {
  local body="$1"
  local signature
  signature=$(printf '%s' "$body" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.*= //')

  curl -sS -X POST "$API/v1/webhooks/stripe" \
    -H 'content-type: application/json' \
    -H "stripe-signature: $signature" \
    --data-raw "$body"
}

notifications_of() {
  psql "$DB" -tAc "SELECT type FROM notifications WHERE profile_id = '$1' ORDER BY created_at"
}

drain_index() {
  curl -sS -X POST "$API/v1/jobs/search-sync" -H "x-cron-secret: $CRON_SECRET" > /dev/null
}

# ── fixtures ───────────────────────────────────────────────────────────
say "0. Fixtures"
SELLER=$(register seller "Abone Satici")
STRANGER=$(register stranger "Yabanci Kisi")
SELLER_ID=$(profile_id_of "$SELLER")
STRANGER_ID=$(profile_id_of "$STRANGER")
verify_identity "$SELLER_ID"
pass "two accounts; the seller is identity-verified and on the free plan"

# Eight active listings, written directly. Publishing eight through the API
# would re-test M1's media pipeline and M2's publish gate, which have their own
# acceptance runs; what M5 needs is eight rows with staggered publish dates so
# §24.11's "newest 5" has something to be true about.
psql "$DB" -q <<SQL
INSERT INTO horses (id, slug, name, sex, owner_profile_id, breed_id, color, height_cm, date_of_birth)
SELECT gen_random_uuid(), 'm5-horse-$STAMP-' || i, 'M5 At ' || i, 'mare', '$SELLER_ID',
       'arabian', 'doru', 160, DATE '2018-01-01'
FROM generate_series(1, 8) i;

INSERT INTO listings (slug, horse_id, seller_profile_id, type, status, title, description,
                      price_amount, price_currency, price_type, country_code, region, city,
                      quality_score, published_at, expires_at)
SELECT 'm5-listing-$STAMP-' || row_number() OVER (ORDER BY h.slug),
       h.id, '$SELLER_ID', 'sale', 'active',
       'M5-$STAMP ilan ' || row_number() OVER (ORDER BY h.slug),
       'Abonelik testleri için oluşturulmuş ilan.',
       15000, 'EUR', 'fixed', 'TR', 'Ankara', 'Ankara',
       70, now() - (row_number() OVER (ORDER BY h.slug) || ' days')::interval,
       now() + INTERVAL '60 days'
FROM horses h WHERE h.slug LIKE 'm5-horse-$STAMP-%';
SQL
pass "8 active listings created, published 1–8 days ago"

# ── 1. §16.1 plans ─────────────────────────────────────────────────────
say "1. §16.1 — the plan table is configuration, not copy"

PLANS=$(curl -sS "$API/v1/billing/plans")
PRO_MONTHLY=$(echo "$PLANS" | json "[p for p in d['data']['plans'] if p['product']=='pro_monthly'][0]['amountEur']")
BUSINESS_YEARLY=$(echo "$PLANS" | json "[p for p in d['data']['plans'] if p['product']=='business_yearly'][0]['amountEur']")
SAVING=$(echo "$PLANS" | json "[p for p in d['data']['plans'] if p['product']=='pro_yearly'][0]['savingPercent']")
[ "$PRO_MONTHLY" = "19" ] || fail "Pro monthly is $PRO_MONTHLY €, §16.1 says 19"
[ "$BUSINESS_YEARLY" = "990" ] || fail "Business yearly is $BUSINESS_YEARLY €, §16.1 says 990"
[ "$SAVING" = "17" ] || fail "the yearly saving reads $SAVING%, expected 17 (2 months free)"
pass "plans public and priced from §16.1 — Pro 19 €/ay, Business 990 €/yıl, yıllıkta %17 tasarruf"

# ── 2. §16.2 — checkout grants nothing ─────────────────────────────────
say "2. §16.2 — a checkout session changes no entitlement"

CHECKOUT=$(curl -sS -X POST "$API/v1/billing/checkout" -H "authorization: Bearer $SELLER" \
  -H 'content-type: application/json' -d '{"product":"pro_monthly"}')
SESSION_ID=$(echo "$CHECKOUT" | json "d['data']['sessionId']")
echo "$CHECKOUT" | json "d['data']['url']" | grep -q "http" || fail "no checkout URL: $CHECKOUT"

TIER=$(curl -sS "$API/v1/me/subscription" -H "authorization: Bearer $SELLER" | json "d['data']['tier']")
[ "$TIER" = "free" ] || fail "creating a checkout session granted $TIER before any payment"
# A subscription deliberately writes no `purchases` row: §7's
# `purchases_product_check` lists only the four §16.1 one-offs, because a
# subscription is a state (`subscriptions`) rather than a purchase.
ROWS=$(psql "$DB" -tAc "SELECT count(*) FROM purchases WHERE stripe_session_id = '$SESSION_ID'")
[ "$ROWS" = "0" ] || fail "a subscription checkout wrote a purchases row"
pass "session created, tier still free, no purchase row for a subscription"

# ── 3. Signature enforcement ───────────────────────────────────────────
say "3. An unsigned or forged webhook is refused"

UNSIGNED=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$API/v1/webhooks/stripe" \
  -H 'content-type: application/json' --data-raw '{"type":"customer.subscription.created","data":{"profileId":"'$SELLER_ID'","tier":"business"}}')
[ "$UNSIGNED" = "400" ] || fail "an unsigned webhook returned $UNSIGNED"

FORGED=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$API/v1/webhooks/stripe" \
  -H 'content-type: application/json' -H 'stripe-signature: deadbeef' \
  --data-raw '{"type":"customer.subscription.created","data":{"profileId":"'$SELLER_ID'","tier":"business"}}')
[ "$FORGED" = "400" ] || fail "a forged signature returned $FORGED"

TIER=$(curl -sS "$API/v1/me/subscription" -H "authorization: Bearer $SELLER" | json "d['data']['tier']")
[ "$TIER" = "free" ] || fail "a refused webhook still granted $TIER"
pass "both refused with 400, and neither granted anything"

# ── 4. §24.10 idempotency ──────────────────────────────────────────────
say "4. §24.10 — replaying an event three times has one effect"

EVENT_ID="evt_test_${STAMP}_sub"
SUB_EVENT='{"id":"'$EVENT_ID'","type":"customer.subscription.created","data":{"profileId":"'$SELLER_ID'","product":"pro_monthly","customerId":"cus_test_'$STAMP'","subscriptionId":"sub_test_'$STAMP'","status":"active","currentPeriodEnd":"2026-12-31T00:00:00Z"}}'

FIRST=$(send_webhook "$SUB_EVENT")
[ "$(echo "$FIRST" | json "d['duplicate']")" = "False" ] || fail "the first delivery was treated as a replay"
send_webhook "$SUB_EVENT" > /dev/null
THIRD=$(send_webhook "$SUB_EVENT")
[ "$(echo "$THIRD" | json "d['duplicate']")" = "True" ] || fail "a replay was processed again: $THIRD"

ROWS=$(psql "$DB" -tAc "SELECT count(*) FROM subscriptions WHERE profile_id = '$SELLER_ID'")
[ "$ROWS" = "1" ] || fail "3 deliveries produced $ROWS subscription rows"
TIER=$(curl -sS "$API/v1/me/subscription" -H "authorization: Bearer $SELLER" | json "d['data']['tier']")
[ "$TIER" = "pro" ] || fail "the subscription did not apply, tier is $TIER"
pass "3 deliveries → 1 subscription row, tier=pro"

LEDGER=$(psql "$DB" -tAc "SELECT count(*) FROM stripe_events WHERE id = '$EVENT_ID'")
[ "$LEDGER" = "1" ] || fail "the idempotency ledger holds $LEDGER rows for one event"
PROCESSED=$(psql "$DB" -tAc "SELECT processed_at IS NOT NULL FROM stripe_events WHERE id = '$EVENT_ID'")
[ "$PROCESSED" = "t" ] || fail "the event was never marked processed"
pass "the §24.10 ledger holds one row, marked processed"

# ── 5. Limits follow the tier, server-side ─────────────────────────────
say "5. §24.9 — the tier's limits are read from the database, not from a client"

LIMITS=$(curl -sS "$API/v1/me/limits" -H "authorization: Bearer $SELLER")
MAX=$(echo "$LIMITS" | json "d['data']['limits']['maxActiveSaleListings']")
[ "$MAX" = "10" ] || fail "Pro should allow 10 active listings, API says $MAX"
pass "Pro grants 10 active sale listings (§3.3)"

# ── 6. Boost ───────────────────────────────────────────────────────────
say "6. §11.2 / §16.2 — a boost ranks higher and is labelled"

# The oldest of the eight: it ranks last organically, so a jump to the top
# after boosting is unambiguous rather than a coincidence of recency.
LISTING_ID=$(psql "$DB" -tAc "SELECT id FROM listings WHERE seller_profile_id = '$SELLER_ID' ORDER BY published_at LIMIT 1")
drain_index

BEFORE=$(curl -sS "$API/v1/listings/search?q=M5-$STAMP&limit=20&sort=recommended" \
  | python3 -c "
import json,sys
hits=json.load(sys.stdin)['data']
print(next((i for i,h in enumerate(hits) if h['id']=='$LISTING_ID'), -1))")
[ "$BEFORE" != "-1" ] || fail "the test listing is not in the index"

# §3.3 first: boosting is one of the capabilities identity verification gates,
# and an unverified buyer must be sent to the ladder rather than to checkout.
UNVERIFIED=$(curl -sS -X POST "$API/v1/listings/$LISTING_ID/boost" -H "authorization: Bearer $STRANGER" \
  -H 'content-type: application/json' -d '{"product":"boost_7d"}')
[ "$(echo "$UNVERIFIED" | json "d['error']['code']")" = "VERIFICATION_REQUIRED" ] \
  || fail "an unverified account reached boost checkout: $UNVERIFIED"

# Then ownership, checked against a *verified* outsider so the refusal cannot
# be the verification rule firing again (§24.25: NOT_FOUND, not FORBIDDEN).
RIVAL=$(register rival "Rakip Satici")
RIVAL_ID=$(profile_id_of "$RIVAL")
verify_identity "$RIVAL_ID"
NOT_MINE=$(curl -sS -X POST "$API/v1/listings/$LISTING_ID/boost" -H "authorization: Bearer $RIVAL" \
  -H 'content-type: application/json' -d '{"product":"boost_7d"}')
[ "$(echo "$NOT_MINE" | json "d['error']['code']")" = "NOT_FOUND" ] \
  || fail "a verified outsider could buy a boost on someone else's listing: $NOT_MINE"
pass "boosting refuses the unverified and the non-owner, with different codes"

BOOST=$(curl -sS -X POST "$API/v1/listings/$LISTING_ID/boost" -H "authorization: Bearer $SELLER" \
  -H 'content-type: application/json' -d '{"product":"boost_7d"}')
BOOST_SESSION=$(echo "$BOOST" | json "d['data']['sessionId']")

BOOSTED=$(psql "$DB" -tAc "SELECT is_boosted FROM listings WHERE id = '$LISTING_ID'")
[ "$BOOSTED" = "f" ] || fail "the boost applied before payment"
PENDING=$(psql "$DB" -tAc "SELECT status FROM purchases WHERE stripe_session_id = '$BOOST_SESSION'")
[ "$PENDING" = "pending" ] || fail "the one-off purchase was not recorded as pending, got '$PENDING'"

# Delivered three times, as §24.10 requires of every handler.
BOOST_EVENT='{"id":"evt_test_'$STAMP'_boost","type":"checkout.session.completed","data":{"profileId":"'$SELLER_ID'","product":"boost_7d","targetId":"'$LISTING_ID'","sessionId":"'$BOOST_SESSION'","amountEur":19}}'
send_webhook "$BOOST_EVENT" > /dev/null
send_webhook "$BOOST_EVENT" > /dev/null
send_webhook "$BOOST_EVENT" > /dev/null

PURCHASES=$(psql "$DB" -tAc "SELECT count(*) FROM purchases WHERE stripe_session_id = '$BOOST_SESSION'")
[ "$PURCHASES" = "1" ] || fail "3 deliveries produced $PURCHASES purchase rows"
PAID=$(psql "$DB" -tAc "SELECT status FROM purchases WHERE stripe_session_id = '$BOOST_SESSION'")
[ "$PAID" = "paid" ] || fail "the purchase is still $PAID after payment"

BOOSTED=$(psql "$DB" -tAc "SELECT is_boosted FROM listings WHERE id = '$LISTING_ID'")
DAYS=$(psql "$DB" -tAc "SELECT round(EXTRACT(EPOCH FROM (boost_expires_at - now())) / 86400) FROM listings WHERE id = '$LISTING_ID'")
[ "$BOOSTED" = "t" ] || fail "the webhook did not apply the boost"
[ "$DAYS" = "7" ] || fail "the boost runs for $DAYS days, expected 7 (3 deliveries must not extend it)"
pass "payment applied a 7-day boost; nothing happened before it, and replays did not extend it"

drain_index
RESULT=$(curl -sS "$API/v1/listings/search?q=M5-$STAMP&limit=20&sort=recommended")
AFTER=$(echo "$RESULT" | python3 -c "
import json,sys
hits=json.load(sys.stdin)['data']
print(next((i for i,h in enumerate(hits) if h['id']=='$LISTING_ID'), -1))")
LABELLED=$(echo "$RESULT" | python3 -c "
import json,sys
hits=json.load(sys.stdin)['data']
print(next((h['isBoosted'] for h in hits if h['id']=='$LISTING_ID'), None))")

[ "$AFTER" = "0" ] || fail "the boosted listing sits at position $AFTER, expected 0"
[ "$LABELLED" = "True" ] || fail "the boosted listing is not labelled (§11.2 'Öne çıkarılan')"
printf '  position %s → %s, isBoosted=%s\n' "$BEFORE" "$AFTER" "$LABELLED"
pass "the boosted listing ranks first and is labelled"

# §11.2's cap is a promise to buyers: no more than 2 boosted per 20 results.
for OTHER in $(psql "$DB" -tAc "SELECT id FROM listings WHERE seller_profile_id = '$SELLER_ID' AND id <> '$LISTING_ID' LIMIT 4"); do
  psql "$DB" -qtA -c "SELECT apply_boost('$OTHER', 7)" > /dev/null
done
drain_index
BOOSTED_ON_PAGE=$(curl -sS "$API/v1/listings/search?q=M5-$STAMP&limit=20&sort=recommended" \
  | json "sum(1 for h in d['data'] if h['isBoosted'])")
[ "$BOOSTED_ON_PAGE" -le 2 ] || fail "$BOOSTED_ON_PAGE boosted results on one page, §11.2 caps it at 2"
pass "5 boosted listings, at most 2 shown per page"

# ── 7. §24.11 downgrade ────────────────────────────────────────────────
say "7. §24.11 — downgrading pauses the newest, deletes nothing"

ACTIVE_BEFORE=$(psql "$DB" -tAc "SELECT count(*) FROM listings WHERE seller_profile_id = '$SELLER_ID' AND status = 'active'")
[ "$ACTIVE_BEFORE" = "8" ] || fail "expected 8 active listings before the downgrade, found $ACTIVE_BEFORE"

send_webhook '{"id":"evt_test_'$STAMP'_cancel","type":"customer.subscription.deleted","data":{"profileId":"'$SELLER_ID'","customerId":"cus_test_'$STAMP'","subscriptionId":"sub_test_'$STAMP'","status":"canceled"}}' > /dev/null

TIER=$(curl -sS "$API/v1/me/subscription" -H "authorization: Bearer $SELLER" | json "d['data']['tier']")
[ "$TIER" = "free" ] || fail "cancelling left the tier at $TIER"

ACTIVE_AFTER=$(psql "$DB" -tAc "SELECT count(*) FROM listings WHERE seller_profile_id = '$SELLER_ID' AND status = 'active'")
PAUSED=$(psql "$DB" -tAc "SELECT count(*) FROM listings WHERE seller_profile_id = '$SELLER_ID' AND status = 'paused'")
TOTAL=$(psql "$DB" -tAc "SELECT count(*) FROM listings WHERE seller_profile_id = '$SELLER_ID'")

[ "$ACTIVE_AFTER" = "3" ] || fail "Free allows 3 active listings, $ACTIVE_AFTER are still active"
[ "$PAUSED" = "5" ] || fail "expected the newest 5 paused, found $PAUSED"
[ "$TOTAL" = "8" ] || fail "content was deleted — 8 listings became $TOTAL"

# "The newest 5" is the specific claim, so check *which* five.
NEWEST_PAUSED=$(psql "$DB" -tAc "
  SELECT count(*) FROM (
    SELECT status, row_number() OVER (ORDER BY published_at DESC) AS rank
    FROM listings WHERE seller_profile_id = '$SELLER_ID'
  ) ranked WHERE rank <= 5 AND status = 'paused'")
[ "$NEWEST_PAUSED" = "5" ] || fail "the paused listings are not the newest five"
notifications_of "$SELLER_ID" | grep -q "subscription.downgraded" || fail "the user was not told"
pass "8 listings → 3 active + 5 paused (the newest), none deleted, user notified"

# ── 8. Upgrade restores the allowance ──────────────────────────────────
say "8. All three tiers, in both directions"

send_webhook '{"id":"evt_test_'$STAMP'_biz","type":"customer.subscription.created","data":{"profileId":"'$SELLER_ID'","product":"business_monthly","customerId":"cus_test_'$STAMP'","subscriptionId":"sub_test2_'$STAMP'","status":"active"}}' > /dev/null
TIER=$(curl -sS "$API/v1/me/subscription" -H "authorization: Bearer $SELLER" | json "d['data']['tier']")
[ "$TIER" = "business" ] || fail "upgrading to Business left the tier at $TIER"

STILL_PAUSED=$(psql "$DB" -tAc "SELECT count(*) FROM listings WHERE seller_profile_id = '$SELLER_ID' AND status = 'paused'")
[ "$STILL_PAUSED" = "5" ] || fail "the upgrade silently republished listings the seller had not chosen to resume"
pass "free → pro → free → business all applied; upgrading does not auto-republish"

# ── 9. Failed payment ──────────────────────────────────────────────────
say "9. §17 subscription.payment_failed"

send_webhook '{"id":"evt_test_'$STAMP'_fail","type":"invoice.payment_failed","data":{"customerId":"cus_test_'$STAMP'","amountEur":99}}' > /dev/null
STATUS=$(psql "$DB" -tAc "SELECT status FROM subscriptions WHERE profile_id = '$SELLER_ID'")
[ "$STATUS" = "past_due" ] || fail "a failed payment left the subscription $STATUS"
notifications_of "$SELLER_ID" | grep -q "subscription.payment_failed" || fail "no email notification"
pass "the subscription is past_due and the user was emailed"

# ── 10. §14.1 identity through Stripe ──────────────────────────────────
say "10. §14.1 — identity is decided by the webhook, never by a client"

LEVEL=$(psql "$DB" -tAc "SELECT verification_level FROM profiles WHERE id = '$STRANGER_ID'")
[ "$LEVEL" = "none" ] || fail "the stranger starts at $LEVEL"

SESSION=$(curl -sS -X POST "$API/v1/verification/identity/start" -H "authorization: Bearer $STRANGER")
echo "$SESSION" | json "d['data']['url']" | grep -q "http" || fail "no identity session: $SESSION"

send_webhook '{"id":"evt_test_'$STAMP'_id","type":"identity.verification_session.verified","data":{"profileId":"'$STRANGER_ID'","sessionId":"vs_test_'$STAMP'"}}' > /dev/null
LEVEL=$(psql "$DB" -tAc "SELECT verification_level FROM profiles WHERE id = '$STRANGER_ID'")
[ "$LEVEL" = "identity_verified" ] || fail "the webhook did not raise the level, still $LEVEL"
ROW=$(psql "$DB" -tAc "SELECT status FROM verifications WHERE profile_id = '$STRANGER_ID' AND kind = 'identity'")
[ "$ROW" = "approved" ] || fail "no approved verification row was written"
pass "Stripe Identity raised the level through a verifications row, as §14.1 requires"

# ── 11. Boost expiry ───────────────────────────────────────────────────
say "11. §16.1 — a boost ends when it was paid to end"

psql "$DB" -q -c "UPDATE listings SET boost_expires_at = now() - INTERVAL '1 hour' WHERE id = '$LISTING_ID'"
SWEEP=$(curl -sS -X POST "$API/v1/jobs/marketplace-sweeps" -H "x-cron-secret: $CRON_SECRET")
[ "$(echo "$SWEEP" | json "d['data']['expiredBoosts']")" -ge 1 ] || fail "the sweep expired no boosts: $SWEEP"

STILL=$(psql "$DB" -tAc "SELECT is_boosted FROM listings WHERE id = '$LISTING_ID'")
[ "$STILL" = "f" ] || fail "an expired boost is still flagged"
drain_index
INDEXED=$(curl -sS "$API/v1/listings/search?q=M5-$STAMP&limit=20&sort=recommended" | python3 -c "
import json,sys
hits=json.load(sys.stdin)['data']
print(next((h['isBoosted'] for h in hits if h['id']=='$LISTING_ID'), None))")
[ "$INDEXED" = "False" ] || fail "the index still ranks the expired boost"
pass "the boost ended, and the index followed"

say "M5 acceptance: all checks passed"
