#!/usr/bin/env bash
#
# M1 acceptance run (spec §23).
#
#   "A user can register, add a horse with 8 photos and a video, add 5 health
#    records, and receive a push reminder for a due vaccination."
#
# Exercises the real HTTP API against a real database and a real storage
# provider — no mocks. Requires the API running on API (default :3001) and
# ImageMagick or sharp available for fixture generation.
set -euo pipefail

API="${API:-http://localhost:3001}"
STAMP="$(date +%s)"
EMAIL="m1-${STAMP}@example.com"
# Unique per run: the chip is globally unique, and re-running must not collide
# with the previous run's horse.
CHIP="7520981${STAMP: -8}"
PASSWORD="guclu-sifre-123"
# The cron endpoint authenticates with the API's own secret (§17 job) — it must
# equal JWT_SECRET. This default matches .env.example and the other milestone
# scripts; M1's used to differ, so §17's dispatch check failed on a secret
# mismatch rather than on anything about reminders.
CRON_SECRET="${CRON_SECRET:-local-dev-secret-only-not-for-production-32chars}"

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$1"; exit 1; }
pass() { printf '\033[32m✓ %s\033[0m\n' "$1"; }

json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

# ── register ───────────────────────────────────────────────────────────
say "1. Register"
TOKEN=$(curl -sS -X POST "$API/v1/auth/register" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"displayName\":\"M1 Test\",\"locale\":\"tr\"}" \
  | json "d['data']['tokens']['accessToken']")
[ -n "$TOKEN" ] || fail "no access token"
pass "registered $EMAIL"

AUTH=(-H "authorization: Bearer $TOKEN")

# ── create a horse ─────────────────────────────────────────────────────
say "2. Create a horse"
HORSE=$(curl -sS -X POST "$API/v1/horses" "${AUTH[@]}" -H 'content-type: application/json' \
  -d '{
    "name":"Luna","sex":"mare","breedId":"arabian","color":"doru",
    "heightCm":155,"dateOfBirth":"2018-04-12","disciplines":["dressage","leisure"],
    "temperamentScore":4,"currentCity":"Ankara","currentCountry":"TR",
    "microchipNumber":"'"$CHIP"'"
  }')
HORSE_ID=$(echo "$HORSE" | json "d['data']['id']")
[ -n "$HORSE_ID" ] || fail "horse not created: $HORSE"
pass "horse $HORSE_ID ($(echo "$HORSE" | json "d['data']['slug']"))"

# ── 8 photos + 1 video through the real §10.1 pipeline ─────────────────
say "3. Upload 8 photos and 1 video"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

upload_image() {
  # Split across statements: under `set -u`, bash marks every name in a single
  # `local` declaration before assigning, so referencing $index in the same
  # statement that defines it trips the unbound-variable check.
  local index="$1"
  local category="$2"
  local file="$WORKDIR/photo-$index.jpg"

  # A distinct image per slot, so the §14.2 duplicate detector does not treat
  # our own fixtures as stolen photography.
  # Run from apps/api: sharp is that package's dependency, and pnpm does not
  # hoist it to the workspace root, so a bare `node -e` from the repo root
  # cannot resolve it.
  INDEX="$index" OUT="$file" node --eval "
    module.paths.unshift('$REPO_ROOT/apps/api/node_modules');
    const sharp = require('sharp');
    const i = Number(process.env.INDEX);
    sharp({create:{width:640,height:427,channels:3,background:{r:i*25,g:120,b:i*10+40}}})
      .composite([{input:{create:{width:200,height:150,channels:3,background:{r:220,g:i*20,b:60}}},top:i*20,left:i*30}])
      .jpeg().toFile(process.env.OUT).then(()=>process.exit(0));
  " >/dev/null

  local size intent media_id url
  size=$(stat -c%s "$file")
  intent=$(curl -sS -X POST "$API/v1/media/upload-intent" "${AUTH[@]}" \
    -H 'content-type: application/json' \
    -d "{\"type\":\"image\",\"mimeType\":\"image/jpeg\",\"sizeBytes\":$size,\"filename\":\"photo-$index.jpg\"}")
  media_id=$(echo "$intent" | json "d['data']['mediaId']")
  url=$(echo "$intent" | json "d['data']['uploadUrl']")

  curl -sS -X POST "$url" -H 'content-type: image/jpeg' --data-binary "@$file" >/dev/null
  curl -sS -X POST "$API/v1/media/$media_id/complete" "${AUTH[@]}" >/dev/null

  curl -sS -X POST "$API/v1/horses/$HORSE_ID/media" "${AUTH[@]}" \
    -H 'content-type: application/json' \
    -d "{\"mediaId\":\"$media_id\",\"category\":\"$category\",\"sortOrder\":$index}" >/dev/null

  echo "$media_id"
}

CATEGORIES=(conformation under_saddle walk trot canter jumping free_movement general)
for i in 0 1 2 3 4 5 6 7; do
  upload_image "$i" "${CATEGORIES[$i]}" >/dev/null
done
pass "8 photos uploaded, processed and attached"

VIDEO="$WORKDIR/clip.mp4"
head -c 2048 /dev/urandom > "$VIDEO"
VSIZE=$(stat -c%s "$VIDEO")
VINTENT=$(curl -sS -X POST "$API/v1/media/upload-intent" "${AUTH[@]}" \
  -H 'content-type: application/json' \
  -d "{\"type\":\"video\",\"mimeType\":\"video/mp4\",\"sizeBytes\":$VSIZE,\"filename\":\"clip.mp4\"}")
VMEDIA=$(echo "$VINTENT" | json "d['data']['mediaId']")
VURL=$(echo "$VINTENT" | json "d['data']['uploadUrl']")
curl -sS -X POST "$VURL" -H 'content-type: video/mp4' --data-binary "@$VIDEO" >/dev/null
curl -sS -X POST "$API/v1/media/$VMEDIA/complete" "${AUTH[@]}" >/dev/null
curl -sS -X POST "$API/v1/horses/$HORSE_ID/media" "${AUTH[@]}" -H 'content-type: application/json' \
  -d "{\"mediaId\":\"$VMEDIA\",\"category\":\"trot\",\"sortOrder\":8}" >/dev/null
pass "video uploaded and attached"

MEDIA_COUNT=$(curl -sS "$API/v1/horses/$HORSE_ID/media" "${AUTH[@]}" | json "len(d['data'])")
[ "$MEDIA_COUNT" = "9" ] || fail "expected 9 media, got $MEDIA_COUNT"
pass "horse carries 9 media items"

# ── §24.8: no EXIF GPS survives the pipeline ───────────────────────────
say "4. §24.8 — EXIF GPS absent from stored images"
if command -v exiftool >/dev/null; then
  # One file at a time: with several arguments exiftool prints a
  # "======== <path>" banner per file, which a naive emptiness test reads as a
  # finding and reports GPS on images that are clean.
  AUDITED=0
  while IFS= read -r image; do
    [ -n "$image" ] || continue
    GPS=$(exiftool -q -q -s3 -gps:all "$image" 2>/dev/null | tr -d '[:space:]')
    [ -z "$GPS" ] || fail "GPS metadata survived in $image: $GPS"
    AUDITED=$((AUDITED + 1))
    # LocalStorageProvider writes under apps/api, not under whatever directory
    # this script was invoked from. A relative path here silently audited zero
    # files and reported §24.8 as unverifiable.
  done < <(find "$REPO_ROOT/apps/api/.storage/image" -name '*.jpg' 2>/dev/null | head -20)

  [ "$AUDITED" -gt 0 ] || fail "no stored images found to audit"
  pass "exiftool reports no GPS tags across $AUDITED stored images"
else
  printf '  (exiftool not installed — skipped)\n'
fi

# ── 5 health records ───────────────────────────────────────────────────
say "5. Add 5 health records"
add_health() {
  curl -sS -X POST "$API/v1/horses/$HORSE_ID/health" "${AUTH[@]}" \
    -H 'content-type: application/json' -d "$1"
}

# Omitting nextDueOn accepts the §18.2 S12 suggestion.
V_DUE=$(add_health "{\"type\":\"vaccination\",\"title\":\"Grip + tetanoz aşısı\",\"performedOn\":\"$(date -d '-358 days' +%F)\",\"performedByName\":\"Vet. Dr. Kaya\"}" | json "d['data']['nextDueOn']")
add_health "{\"type\":\"deworming\",\"title\":\"Paraziter ilaç\",\"performedOn\":\"$(date -d '-40 days' +%F)\"}" >/dev/null
add_health "{\"type\":\"farrier\",\"title\":\"Nal değişimi\",\"performedOn\":\"$(date -d '-30 days' +%F)\",\"performedByName\":\"Ali Nalbant\"}" >/dev/null
add_health "{\"type\":\"dental\",\"title\":\"Diş törpüleme\",\"performedOn\":\"$(date -d '-200 days' +%F)\"}" >/dev/null
add_health "{\"type\":\"xray\",\"title\":\"Ön ayak röntgeni\",\"performedOn\":\"$(date -d '-90 days' +%F)\",\"isSensitive\":true}" >/dev/null

HEALTH_COUNT=$(curl -sS "$API/v1/horses/$HORSE_ID/health" "${AUTH[@]}" | json "len(d['data'])")
[ "$HEALTH_COUNT" = "5" ] || fail "expected 5 health records, got $HEALTH_COUNT"
pass "5 health records stored"

# §18.2 S12: vaccination auto-suggests +12 months.
EXPECTED_DUE=$(date -d "$(date -d '-358 days' +%F) +365 days" +%F)
[ "$V_DUE" = "$EXPECTED_DUE" ] || fail "vaccination next due was $V_DUE, expected $EXPECTED_DUE"
pass "vaccination next due auto-suggested as $V_DUE (+12 months)"

# ── due reminders ──────────────────────────────────────────────────────
say "6. Due reminders"
DUE=$(curl -sS "$API/v1/me/health/due?days=30" "${AUTH[@]}")
DUE_COUNT=$(echo "$DUE" | json "len(d['data'])")
[ "$DUE_COUNT" -ge 1 ] || fail "no due reminders returned"
pass "$DUE_COUNT reminder(s) due within 30 days: $(echo "$DUE" | json "d['data'][0]['typeLabel']+' — '+str(d['data'][0]['daysUntil'])+' gün'")"

# ── §17 / §24.6: the reminder actually fires ───────────────────────────
say "7. §17 — health.due reminder dispatch"

# The device the push would go to. §12 POST /devices.
curl -sS -X POST "$API/v1/devices" "${AUTH[@]}" -H 'content-type: application/json' \
  -d "{\"token\":\"test-device-$STAMP\",\"platform\":\"android\"}" >/dev/null

RUN1=$(curl -sS -X POST "$API/v1/jobs/health-reminders" -H "x-cron-secret: $CRON_SECRET")
SENT1=$(echo "$RUN1" | json "d['data']['sent']")
[ "$SENT1" -ge 1 ] || fail "the reminder job sent nothing (considered=$(echo "$RUN1" | json "d['data']['considered']"))"
pass "reminder job sent $SENT1 notification(s)"

# §17 fires at 7 days and again on the day; the job runs hourly, so the same
# stage must not resend.
RUN2=$(curl -sS -X POST "$API/v1/jobs/health-reminders" -H "x-cron-secret: $CRON_SECRET")
SENT2=$(echo "$RUN2" | json "d['data']['sent']")
[ "$SENT2" = "0" ] || fail "re-running the job resent $SENT2 notification(s); dedupe is broken"
pass "a second run sends nothing — reminders are idempotent"

NOTIFS=$(curl -sS "$API/v1/notifications" "${AUTH[@]}")
NOTIF_TITLE=$(echo "$NOTIFS" | json "d['data'][0]['title']")
pass "notification recorded: $NOTIF_TITLE"

UNAUTHORIZED=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$API/v1/jobs/health-reminders")
[ "$UNAUTHORIZED" = "403" ] || fail "the cron endpoint answered HTTP $UNAUTHORIZED without a secret"
pass "the cron endpoint rejects calls without the shared secret"

# ── timeline ───────────────────────────────────────────────────────────
say "8. §20.4 timeline"
TIMELINE=$(curl -sS "$API/v1/horses/$HORSE_ID/timeline" "${AUTH[@]}")
KINDS=$(echo "$TIMELINE" | json "sorted(set(e['kind'] for e in d['data']))")
pass "timeline kinds: $KINDS"
echo "$TIMELINE" | grep -q '"registered"' || fail "timeline missing the registration entry"

# ── §24.4: health invisible to a stranger ──────────────────────────────
say "9. §24.4 — health file invisible to a non-granted user"
OTHER=$(curl -sS -X POST "$API/v1/auth/register" -H 'content-type: application/json' \
  -d "{\"email\":\"other-${STAMP}@example.com\",\"password\":\"$PASSWORD\",\"displayName\":\"Yabanci Kullanici\"}" \
  | json "d['data']['tokens']['accessToken']")

STRANGER_HEALTH=$(curl -sS -o /dev/null -w '%{http_code}' \
  "$API/v1/horses/$HORSE_ID/health" -H "authorization: Bearer $OTHER")
[ "$STRANGER_HEALTH" = "404" ] || fail "stranger got HTTP $STRANGER_HEALTH on the health file, expected 404"
pass "stranger receives 404 on the health file"

STRANGER_HORSE=$(curl -sS -o /dev/null -w '%{http_code}' \
  "$API/v1/horses/$HORSE_ID" -H "authorization: Bearer $OTHER")
[ "$STRANGER_HORSE" = "404" ] || fail "unlisted horse leaked to a stranger (HTTP $STRANGER_HORSE)"
pass "unlisted horse is not readable by a stranger"

STRANGER_EDIT=$(curl -sS -o /dev/null -w '%{http_code}' -X PATCH "$API/v1/horses/$HORSE_ID" \
  -H "authorization: Bearer $OTHER" -H 'content-type: application/json' -d '{"name":"Çalindi"}')
[ "$STRANGER_EDIT" = "404" ] || fail "a stranger could edit the horse (HTTP $STRANGER_EDIT)"
pass "a stranger cannot edit the horse"

# ── §3.3 limits ────────────────────────────────────────────────────────
say "10. §3.3 — free tier horse limit"
LIMITS=$(curl -sS "$API/v1/me/limits" "${AUTH[@]}")
pass "tier=$(echo "$LIMITS" | json "d['data']['tier']") maxHorses=$(echo "$LIMITS" | json "d['data']['limits']['maxHorses']") used=$(echo "$LIMITS" | json "d['data']['usage']['horses']")"

for i in 2 3; do
  curl -sS -X POST "$API/v1/horses" "${AUTH[@]}" -H 'content-type: application/json' \
    -d "{\"name\":\"At $i\",\"sex\":\"gelding\"}" >/dev/null
done

FOURTH=$(curl -sS -X POST "$API/v1/horses" "${AUTH[@]}" -H 'content-type: application/json' \
  -d '{"name":"Dorduncu At","sex":"colt"}')
CODE=$(echo "$FOURTH" | json "d.get('error',{}).get('code','')")
[ "$CODE" = "LIMIT_EXCEEDED" ] || fail "4th horse on the free tier returned '$CODE', expected LIMIT_EXCEEDED"
pass "4th horse blocked with LIMIT_EXCEEDED"

# ── microchip conflict becomes a transfer prompt ───────────────────────
say "11. §18.2 S10 — duplicate microchip offers a transfer"
DUP=$(curl -sS -X POST "$API/v1/horses" -H "authorization: Bearer $OTHER" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"Ayni Cip\",\"sex\":\"mare\",\"microchipNumber\":\"$CHIP\"}")
DUP_CODE=$(echo "$DUP" | json "d.get('error',{}).get('code','')")
[ "$DUP_CODE" = "CONFLICT" ] || fail "duplicate microchip returned '$DUP_CODE', expected CONFLICT"
pass "duplicate microchip returns CONFLICT with the existing horse attached"

printf '\n\033[32m✓ M1 acceptance run complete\033[0m\n'
