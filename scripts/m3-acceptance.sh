#!/usr/bin/env bash
#
# M3 acceptance run (spec §23).
#
#   "Publishing is blocked without identity verification; a duplicate photo
#    across two accounts lands in the moderation queue automatically; a buyer
#    can request and receive a health file."
#
# Exercises the real HTTP API against a real database and storage provider.
set -euo pipefail

API="${API:-http://localhost:3001}"
STAMP="$(date +%s)"
PASSWORD="guclu-sifre-123"
DB="${DB_URL:-postgresql://postgres@localhost:5432/only_horses}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$1"; exit 1; }
pass() { printf '\033[32m✓ %s\033[0m\n' "$1"; }
json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

register() {
  curl -sS -X POST "$API/v1/auth/register" -H 'content-type: application/json' \
    -d "{\"email\":\"$1-$STAMP@example.com\",\"password\":\"$PASSWORD\",\"displayName\":\"$2\"}" \
    | json "d['data']['tokens']['accessToken']"
}

profile_id_of() {
  curl -sS "$API/v1/me" -H "authorization: Bearer $1" | json "d['data']['id']"
}

# Identity verification is decided by Stripe Identity's webhook, never by a
# client call (§14.1) — so the test drives it the way the webhook will: by
# approving the pending row through the admin decision path.
verify_identity() {
  # Two separate UPDATEs on purpose. compute_trust_score is STABLE and reads
  # the committed row, so calling it in the same statement that raises
  # verification_level would score the *old* level — the same trap
  # VerificationService.decide avoids by ordering its writes.
  psql "$DB" -q -c "
    INSERT INTO verifications (profile_id, kind, status, provider, decided_at)
    VALUES ('$1', 'identity', 'approved', 'stripe_identity', now());
    UPDATE profiles SET verification_level = 'identity_verified' WHERE id = '$1';"
  psql "$DB" -q -c "UPDATE profiles SET trust_score = compute_trust_score(id) WHERE id = '$1';"
}

# ── fixtures ───────────────────────────────────────────────────────────
say "0. Fixtures"
SELLER=$(register seller "Satıcı Test")
BUYER=$(register buyer "Alıcı Test")
THIEF=$(register thief "Hirsiz Test")

SELLER_ID=$(profile_id_of "$SELLER")
BUYER_ID=$(profile_id_of "$BUYER")
THIEF_ID=$(profile_id_of "$THIEF")
pass "three accounts created"

HORSE=$(curl -sS -X POST "$API/v1/horses" -H "authorization: Bearer $SELLER" \
  -H 'content-type: application/json' \
  -d '{"name":"Zümrüt","sex":"mare","breedId":"arabian","color":"kır","heightCm":158,
       "dateOfBirth":"2017-05-10","disciplines":["dressage"],"currentCity":"Ankara",
       "currentCountry":"TR","visibilityHealth":"on_request"}')
HORSE_ID=$(echo "$HORSE" | json "d['data']['id']")
pass "horse $HORSE_ID created"

# Photos, so the listing can clear §13.1's three-image precondition.
WORKDIR=$(mktemp -d); trap 'rm -rf "$WORKDIR"' EXIT

upload_photo() {
  # Separate statements: under `set -u`, bash marks every name in one `local`
  # declaration before assigning, so referencing $index in the same statement
  # that defines it trips the unbound-variable check.
  local token="$1"
  local index="$2"
  local seed="$3"
  local file="$WORKDIR/p$index.jpg"
  # Run from apps/api: sharp is a dependency of the API workspace, and pnpm
  # does not hoist it to the repo root.
  SEED="$seed" OUT="$file" node --input-type=commonjs -e "
    const sharp=require('sharp'); const s=Number(process.env.SEED);
    sharp({create:{width:600,height:400,channels:3,background:{r:s*30%255,g:90,b:s*17%255}}})
      .composite([{input:{create:{width:180,height:120,channels:3,background:{r:200,g:s*40%255,b:70}}},top:40,left:s*20%300}])
      .jpeg().toFile(process.env.OUT).then(()=>process.exit(0));" >/dev/null 2>&1 || {
    (cd "$REPO_ROOT/apps/api" && SEED="$seed" OUT="$file" node -e "
      const sharp=require('sharp'); const s=Number(process.env.SEED);
      sharp({create:{width:600,height:400,channels:3,background:{r:s*30%255,g:90,b:s*17%255}}})
        .composite([{input:{create:{width:180,height:120,channels:3,background:{r:200,g:s*40%255,b:70}}},top:40,left:s*20%300}])
        .jpeg().toFile(process.env.OUT).then(()=>process.exit(0));")
  }

  local size intent media url
  size=$(stat -c%s "$file")
  intent=$(curl -sS -X POST "$API/v1/media/upload-intent" -H "authorization: Bearer $token" \
    -H 'content-type: application/json' \
    -d "{\"type\":\"image\",\"mimeType\":\"image/jpeg\",\"sizeBytes\":$size}")
  media=$(echo "$intent" | json "d['data']['mediaId']")
  url=$(echo "$intent" | json "d['data']['uploadUrl']")
  curl -sS -X POST "$url" -H 'content-type: image/jpeg' --data-binary "@$file" >/dev/null
  curl -sS -X POST "$API/v1/media/$media/complete" -H "authorization: Bearer $token" >/dev/null
  echo "$media"
}

FIRST_MEDIA=""
for i in 1 2 3; do
  M=$(upload_photo "$SELLER" "$i" "$i")
  [ -z "$FIRST_MEDIA" ] && FIRST_MEDIA="$M"
  curl -sS -X POST "$API/v1/horses/$HORSE_ID/media" -H "authorization: Bearer $SELLER" \
    -H 'content-type: application/json' \
    -d "{\"mediaId\":\"$M\",\"category\":\"conformation\",\"sortOrder\":$i}" >/dev/null
done
pass "3 photos uploaded and attached"

LISTING=$(curl -sS -X POST "$API/v1/listings" -H "authorization: Bearer $SELLER" \
  -H 'content-type: application/json' \
  -d "{\"horseId\":\"$HORSE_ID\",\"type\":\"sale\",\"title\":\"Zümrüt — 9 yaşında Arap kısrak\",
       \"description\":\"Sakin mizaçlı, dresaj ve gezinti için uygun bir kısrak. Düzenli nal bakımı ve aşı takibi yapılıyor, tüm kayıtlar sistemde tutuluyor. Ayak yapısı düzgün, tırnak sağlığı iyi durumda. Manejde ve arazide rahat çalışır, trafiğe ve kalabalığa alışkındır. Deneme binişine açığız; satın alma öncesi veteriner muayenesini (PPE) memnuniyetle karşılarız ve masrafları alıcıya aittir. Nakliye konusunda yardımcı olabiliriz.\",
       \"priceAmount\":18000,\"priceCurrency\":\"EUR\",\"countryCode\":\"TR\",\"city\":\"Ankara\"}")
LISTING_ID=$(echo "$LISTING" | json "d['data']['id']")
pass "draft listing $LISTING_ID created"

# ── DoD 1: publishing blocked without identity verification ────────────
say "1. §24.2 — publishing is blocked without identity verification"

BLOCKED=$(curl -sS -X POST "$API/v1/listings/$LISTING_ID/publish" -H "authorization: Bearer $SELLER")
CODE=$(echo "$BLOCKED" | json "d.get('error',{}).get('code','')")
[ "$CODE" = "VERIFICATION_REQUIRED" ] || fail "publish returned '$CODE', expected VERIFICATION_REQUIRED"
pass "unverified publish refused with VERIFICATION_REQUIRED"

echo "$BLOCKED" | grep -q "kimliğini doğrulaman" || fail "the error does not tell the seller what to do"
pass "the message names the missing step"

LADDER=$(curl -sS "$API/v1/me/verifications" -H "authorization: Bearer $SELLER")
echo "$LADDER" | json "[r['kind']+':'+r['state'] for r in d['data']['ladder']]" \
  | sed 's/^/  /'

verify_identity "$SELLER_ID" >/dev/null
pass "identity verified through the approval path"

PUBLISHED=$(curl -sS -X POST "$API/v1/listings/$LISTING_ID/publish" -H "authorization: Bearer $SELLER")
STATUS=$(echo "$PUBLISHED" | json "d['data']['status']")
QUALITY=$(echo "$PUBLISHED" | json "d['data']['qualityScore']")
# §13.1 auto-approves at quality >= 60 with no open case and no duplicate
# signal. This listing is built to clear that bar, so anything else means the
# gate is miscounting.
[ "$STATUS" = "active" ] || fail "publish returned '$STATUS' (quality $QUALITY); expected active"
pass "publish now succeeds and auto-approves — status=$STATUS quality=$QUALITY"

# ── DoD 2: duplicate photo lands in the moderation queue ───────────────
say "2. §24.7 — a photo reused by another account opens a moderation case"

# The thief uploads a byte-identical copy of the seller's first photo.
cp "$WORKDIR/p1.jpg" "$WORKDIR/stolen.jpg"
SIZE=$(stat -c%s "$WORKDIR/stolen.jpg")
INTENT=$(curl -sS -X POST "$API/v1/media/upload-intent" -H "authorization: Bearer $THIEF" \
  -H 'content-type: application/json' \
  -d "{\"type\":\"image\",\"mimeType\":\"image/jpeg\",\"sizeBytes\":$SIZE}")
STOLEN=$(echo "$INTENT" | json "d['data']['mediaId']")
URL=$(echo "$INTENT" | json "d['data']['uploadUrl']")
curl -sS -X POST "$URL" -H 'content-type: image/jpeg' --data-binary "@$WORKDIR/stolen.jpg" >/dev/null
curl -sS -X POST "$API/v1/media/$STOLEN/complete" -H "authorization: Bearer $THIEF" >/dev/null

CASE_COUNT=$(psql "$DB" -At -c "
  SELECT count(*) FROM moderation_cases
  WHERE target_id = '$STOLEN'
    AND signals->>'phash_duplicate_other_owner' = 'true'")
[ "$CASE_COUNT" = "1" ] || fail "no phash moderation case was opened (found $CASE_COUNT)"

SEVERITY=$(psql "$DB" -At -c "SELECT severity FROM moderation_cases WHERE target_id = '$STOLEN'")
[ "$SEVERITY" = "4" ] || fail "case severity is $SEVERITY, §14.2 says 4"
pass "moderation case opened automatically with severity 4"

FLAG=$(psql "$DB" -At -c "SELECT moderation_flag FROM media WHERE id = '$STOLEN'")
[ "$FLAG" = "phash_duplicate" ] || fail "the media was not flagged (got '$FLAG')"
pass "the copied media is flagged"

# §13.1: a listing carrying flagged media is held for review, never auto-approved.
verify_identity "$THIEF_ID" >/dev/null
THIEF_HORSE=$(curl -sS -X POST "$API/v1/horses" -H "authorization: Bearer $THIEF" \
  -H 'content-type: application/json' \
  -d '{"name":"Kopya","sex":"gelding","breedId":"arabian","heightCm":160,"dateOfBirth":"2018-01-01"}' \
  | json "d['data']['id']")
curl -sS -X POST "$API/v1/horses/$THIEF_HORSE/media" -H "authorization: Bearer $THIEF" \
  -H 'content-type: application/json' \
  -d "{\"mediaId\":\"$STOLEN\",\"category\":\"conformation\",\"sortOrder\":0}" >/dev/null
for i in 4 5; do
  M=$(upload_photo "$THIEF" "$i" "$((i+40))")
  curl -sS -X POST "$API/v1/horses/$THIEF_HORSE/media" -H "authorization: Bearer $THIEF" \
    -H 'content-type: application/json' \
    -d "{\"mediaId\":\"$M\",\"category\":\"conformation\",\"sortOrder\":$i}" >/dev/null
done

THIEF_LISTING=$(curl -sS -X POST "$API/v1/listings" -H "authorization: Bearer $THIEF" \
  -H 'content-type: application/json' \
  -d "{\"horseId\":\"$THIEF_HORSE\",\"type\":\"sale\",\"title\":\"Kopya ilan\",
       \"description\":\"Sakin mizaçlı, dresaj ve gezinti için uygun. Düzenli nal ve aşı takibi yapılıyor. Deneme binişine açığız, satın alma öncesi veteriner muayenesini memnuniyetle karşılarız. Nakliye konusunda yardımcı olabiliriz.\",
       \"priceAmount\":9000,\"priceCurrency\":\"EUR\",\"countryCode\":\"TR\",\"city\":\"Ankara\"}" \
  | json "d['data']['id']")

THIEF_STATUS=$(curl -sS -X POST "$API/v1/listings/$THIEF_LISTING/publish" \
  -H "authorization: Bearer $THIEF" | json "d['data']['status']")
[ "$THIEF_STATUS" = "pending_review" ] || fail "a listing with stolen media published as '$THIEF_STATUS'"
pass "the listing built on it is held in pending_review, not auto-approved"

# The held listing must not be searchable.
psql "$DB" -q -c "UPDATE search_outbox SET attempts = 0 WHERE processed_at IS NULL"
curl -sS -X POST "$API/v1/jobs/search-sync" -H "x-cron-secret: ${JWT_SECRET:-dev-secret-that-is-definitely-long-enough-32}" >/dev/null
INDEXED=$(psql "$DB" -At -c "SELECT count(*) FROM search_documents WHERE document_id = '$THIEF_LISTING'")
[ "$INDEXED" = "0" ] || fail "a listing held for review is searchable"
pass "held listings are not indexed"

# ── moderator queue ────────────────────────────────────────────────────
say "3. §12 — the case reaches the moderation queue"
MODERATOR=$(register mod "Moderatör Test")
MOD_ID=$(profile_id_of "$MODERATOR")
psql "$DB" -q -c "UPDATE profiles SET is_moderator = TRUE WHERE id = '$MOD_ID'"

DENIED=$(curl -sS -o /dev/null -w '%{http_code}' "$API/v1/admin/moderation/queue" \
  -H "authorization: Bearer $BUYER")
[ "$DENIED" = "404" ] || fail "a non-moderator got HTTP $DENIED on the admin queue"
pass "the admin queue is invisible to ordinary users"

QUEUE=$(curl -sS "$API/v1/admin/moderation/queue?status=open" -H "authorization: Bearer $MODERATOR")
FOUND=$(echo "$QUEUE" | json "sum(1 for c in d['data'] if c['target_id']=='$STOLEN')")
[ "$FOUND" = "1" ] || fail "the phash case is not in the moderator's queue"
SEVERITIES=$(echo "$QUEUE" | json "[c['severity'] for c in d['data']][:5]")
pass "case present; queue ordered by severity $SEVERITIES"

# ── DoD 3: a buyer can request and receive a health file ───────────────
say "4. §2 / §24.4 — request and receive a health file"

curl -sS -X POST "$API/v1/horses/$HORSE_ID/health" -H "authorization: Bearer $SELLER" \
  -H 'content-type: application/json' \
  -d "{\"type\":\"vaccination\",\"title\":\"Grip + tetanoz\",\"performedOn\":\"$(date -d '-60 days' +%F)\",\"performedByName\":\"Vet. Dr. Kaya\"}" >/dev/null
curl -sS -X POST "$API/v1/horses/$HORSE_ID/health" -H "authorization: Bearer $SELLER" \
  -H 'content-type: application/json' \
  -d "{\"type\":\"xray\",\"title\":\"Ön ayak röntgeni\",\"performedOn\":\"$(date -d '-30 days' +%F)\",\"isSensitive\":true}" >/dev/null
pass "seller recorded 2 health entries (one marked sensitive)"

BEFORE=$(curl -sS -o /dev/null -w '%{http_code}' "$API/v1/horses/$HORSE_ID/health" \
  -H "authorization: Bearer $BUYER")
[ "$BEFORE" = "404" ] || fail "the buyer read the health file before any grant (HTTP $BEFORE)"
pass "before the request: buyer gets 404"

REQ=$(curl -sS -X POST "$API/v1/horses/$HORSE_ID/access-requests" -H "authorization: Bearer $BUYER" \
  -H 'content-type: application/json' \
  -d '{"scope":["health"],"message":"Merhaba, sağlık dosyasını görebilir miyim?"}')
GRANT_ID=$(echo "$REQ" | json "d['data']['id']")
[ "$(echo "$REQ" | json "d['data']['status']")" = "requested" ] || fail "the request was not recorded"
pass "buyer requested access — grant $GRANT_ID"

INCOMING=$(curl -sS "$API/v1/me/access-requests" -H "authorization: Bearer $SELLER" \
  | json "sum(1 for r in d['data']['incoming'] if r['id']=='$GRANT_ID')")
[ "$INCOMING" = "1" ] || fail "the request does not appear in the owner's incoming list"
pass "the owner sees it in their incoming requests"

STILL=$(curl -sS -o /dev/null -w '%{http_code}' "$API/v1/horses/$HORSE_ID/health" \
  -H "authorization: Bearer $BUYER")
[ "$STILL" = "404" ] || fail "a pending request already granted access (HTTP $STILL)"
pass "a pending request grants nothing"

APPROVED=$(curl -sS -X PATCH "$API/v1/access-requests/$GRANT_ID" -H "authorization: Bearer $SELLER" \
  -H 'content-type: application/json' -d '{"status":"granted","expiresInDays":30}')
[ "$(echo "$APPROVED" | json "d.get('data',{}).get('status','')")" = "granted" ] \
  || fail "approval did not take: $APPROVED"
pass "owner approved for 30 days (expires $(echo "$APPROVED" | json "d['data']['expiresAt'][:10]"))"

FILE=$(curl -sS "$API/v1/horses/$HORSE_ID/health" -H "authorization: Bearer $BUYER")
COUNT=$(echo "$FILE" | json "len(d['data'])")
[ "$COUNT" = "1" ] || fail "the granted buyer sees $COUNT records, expected 1 (the sensitive one is withheld)"
echo "$FILE" | grep -q "Grip" || fail "the vaccination record is missing"
echo "$FILE" | grep -q "röntgen" && fail "a record marked sensitive was shared"
pass "buyer receives the health file; the sensitive entry stays hidden"

curl -sS -X PATCH "$API/v1/access-requests/$GRANT_ID" -H "authorization: Bearer $SELLER" \
  -H 'content-type: application/json' -d '{"status":"revoked"}' >/dev/null
AFTER=$(curl -sS -o /dev/null -w '%{http_code}' "$API/v1/horses/$HORSE_ID/health" \
  -H "authorization: Bearer $BUYER")
[ "$AFTER" = "404" ] || fail "access survived revocation (HTTP $AFTER)"
pass "revoking ends access immediately"

# ── §13.3 trust score responds to moderation ───────────────────────────
say "5. §13.3 — an upheld action costs trust"
BEFORE_SCORE=$(psql "$DB" -At -c "SELECT trust_score FROM profiles WHERE id = '$THIEF_ID'")
CASE_ID=$(psql "$DB" -At -c "SELECT id FROM moderation_cases WHERE target_id = '$STOLEN' LIMIT 1")
curl -sS -X POST "$API/v1/admin/moderation/$CASE_ID/action" -H "authorization: Bearer $MODERATOR" \
  -H 'content-type: application/json' \
  -d '{"action":"remove","note":"Başka bir hesabın fotoğrafı"}' >/dev/null
AFTER_SCORE=$(psql "$DB" -At -c "SELECT trust_score FROM profiles WHERE id = '$THIEF_ID'")
# §13.3: an upheld action costs 20 and forfeits the 5-point clean record, so
# the drop should be 25 for an account with no other upheld actions.
[ "$AFTER_SCORE" -lt "$BEFORE_SCORE" ] \
  || fail "trust score did not fall after an upheld action ($BEFORE_SCORE -> $AFTER_SCORE)"
DROP=$((BEFORE_SCORE - AFTER_SCORE))
[ "$DROP" = "25" ] || fail "trust fell by $DROP; §13.3 says 20 penalty + 5 forfeited clean record"
pass "trust score fell from $BEFORE_SCORE to $AFTER_SCORE (−$DROP, as §13.3 specifies)"

# ── §15 messaging ──────────────────────────────────────────────────────
say "6. §15 — conversations carry context"

CONV=$(curl -sS -X POST "$API/v1/conversations" -H "authorization: Bearer $BUYER" \
  -H 'content-type: application/json' \
  -d "{\"contextType\":\"listing\",\"contextId\":\"$LISTING_ID\",\"participantId\":\"$SELLER_ID\",
       \"firstMessage\":\"Merhaba, at hâlâ satılık mı? Hafta sonu görmeye gelebilir miyim?\"}")
CONV_ID=$(echo "$CONV" | json "d.get('data',{}).get('conversationId','')")
[ -n "$CONV_ID" ] || fail "conversation not created: $CONV"
pass "buyer opened a listing conversation — $CONV_ID"

# §15.1: the context is pinned as a card and sent as the first system message.
MSGS=$(curl -sS "$API/v1/conversations/$CONV_ID" -H "authorization: Bearer $BUYER")
echo "$MSGS" | python3 -c "
import json,sys
msgs = json.load(sys.stdin)['data']
system = [m for m in msgs if m['is_system']]
assert system, 'no system message pinning the context'
card = system[0]['attachment']
assert card and card['type'] == 'context_card', f'first system message is not a context card: {card}'
print(f\"  context card: {card['payload']['title']}\")"
pass "the thread opens with a pinned context card"

# §15.1: the first buyer message creates an inquiries row.
INQ=$(psql "$DB" -At -c "SELECT count(*) FROM inquiries WHERE conversation_id = '$CONV_ID'")
[ "$INQ" = "1" ] || fail "no inquiry row was created (found $INQ)"
pass "an inquiry row was created"

# §13.5: the seller's first reply is what response rate is measured from.
curl -sS -X POST "$API/v1/conversations/$CONV_ID/messages" -H "authorization: Bearer $SELLER" \
  -H 'content-type: application/json' \
  -d '{"body":"Merhaba, evet satılık. Cumartesi uygun."}' >/dev/null
REPLIED=$(psql "$DB" -At -c "SELECT first_reply_at IS NOT NULL FROM inquiries WHERE conversation_id = '$CONV_ID'")
[ "$REPLIED" = "t" ] || fail "the seller reply did not stamp first_reply_at"
pass "the seller's first reply is timestamped for §13.5"

say "7. §14.3 — off-platform payment language is caught"
WARNED=$(curl -sS -X POST "$API/v1/conversations/$CONV_ID/messages" -H "authorization: Bearer $SELLER" \
  -H 'content-type: application/json' \
  -d '{"body":"Kapora olarak western union ile 2000 EUR gönderirsen atı ayırayım."}' \
  | json "d['data']['paymentWarning']")
[ "$WARNED" = "True" ] || fail "off-platform payment language was not flagged"
pass "the message is flagged and the buyer is warned inline"

FLAGGED=$(psql "$DB" -At -c "
  SELECT count(*) FROM moderation_cases
  WHERE target_id = '$CONV_ID' AND signals->>'offsite_payment_language' = 'true'")
[ "$FLAGGED" = "1" ] || fail "the thread was not flagged for review"
pass "the thread is in the moderation queue"

CLEAN=$(curl -sS -X POST "$API/v1/conversations/$CONV_ID/messages" -H "authorization: Bearer $BUYER" \
  -H 'content-type: application/json' \
  -d '{"body":"Cumartesi 14:00 uygun mu? Veteriner muayenesini de ayarlayabilirim."}' \
  | json "d['data']['paymentWarning']")
[ "$CLEAN" = "False" ] || fail "an ordinary message was flagged"
pass "an ordinary message is not flagged"

say "8. §15.1 — a quick action does the thing, not just says it"
QA=$(curl -sS -X POST "$API/v1/conversations/$CONV_ID/quick-action" -H "authorization: Bearer $BUYER" \
  -H 'content-type: application/json' \
  -d '{"action":"request_health","payload":{"message":"Sağlık dosyasını görebilir miyim?"}}')
GRANT2=$(echo "$QA" | json "d['data']['result'].get('id','')")
[ -n "$GRANT2" ] || fail "request_health did not create an access request: $QA"
pass "\"Sağlık dosyası iste\" created a real access request from inside the thread"

say "9. §24.13 — blocking freezes the thread"
curl -sS -X POST "$API/v1/blocks" -H "authorization: Bearer $BUYER" \
  -H 'content-type: application/json' -d "{\"profileId\":\"$SELLER_ID\"}" >/dev/null
BLOCKED_SEND=$(curl -sS -X POST "$API/v1/conversations/$CONV_ID/messages" -H "authorization: Bearer $BUYER" \
  -H 'content-type: application/json' -d '{"body":"test"}' | json "d.get('error',{}).get('code','')")
[ "$BLOCKED_SEND" = "FORBIDDEN" ] || fail "the blocker could still post (got '$BLOCKED_SEND')"
pass "the thread is read-only after a block"

NEW_THREAD=$(curl -sS -X POST "$API/v1/conversations" -H "authorization: Bearer $SELLER" \
  -H 'content-type: application/json' \
  -d "{\"contextType\":\"direct\",\"participantId\":\"$BUYER_ID\",\"firstMessage\":\"tekrar\"}" \
  | json "d.get('error',{}).get('code','')")
[ "$NEW_THREAD" = "FORBIDDEN" ] || fail "a blocked user opened a new conversation (got '$NEW_THREAD')"
pass "a blocked user cannot open a new conversation either"

printf '\n\033[32m✓ M3 acceptance complete\033[0m\n'
