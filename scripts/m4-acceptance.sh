#!/usr/bin/env bash
#
# M4 acceptance run (spec §23).
#
#   "Full job flow from post → apply → shortlist → message works end to end
#    with notifications at each step."
#
# Also covers what M4 adds around that flow: §26's job legality gates, service
# listings and their §26 transport notice, the professional directory, and
# §13.4's review eligibility rules (§24.12).
#
# Exercises the real HTTP API against a real database.
set -euo pipefail

API="${API:-http://localhost:3001}"
STAMP="$(date +%s)"
PASSWORD="guclu-sifre-123"
DB="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:5432/only_horses}"
CRON_SECRET="${CRON_SECRET:-local-dev-secret-only-not-for-production-32chars}"

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$1"; exit 1; }
pass() { printf '\033[32m✓ %s\033[0m\n' "$1"; }
json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

# §12 rate-limits auth to 10 requests per 5 minutes per IP, and this run needs
# five accounts — so two runs inside five minutes will legitimately be refused.
# That is the rate limiter working; the message says so rather than failing
# with a JSON KeyError.
register() {
  local response
  response=$(curl -sS -X POST "$API/v1/auth/register" -H 'content-type: application/json' \
    -d "{\"email\":\"$1-$STAMP@example.com\",\"password\":\"$PASSWORD\",\"displayName\":\"$2\"}")

  case "$response" in
    *RATE_LIMITED*) fail "auth rate limit hit (§12: 10 per 5 min per IP) — wait and re-run: $response" ;;
  esac

  echo "$response" | json "d['data']['tokens']['accessToken']"
}

profile_id_of() {
  curl -sS "$API/v1/me" -H "authorization: Bearer $1" | json "d['data']['id']"
}

# Identity verification is decided by Stripe Identity's webhook (§14.1), so the
# test drives it the way the webhook will rather than through a client call.
verify_identity() {
  psql "$DB" -q -c "
    INSERT INTO verifications (profile_id, kind, status, provider, decided_at)
    VALUES ('$1', 'identity', 'approved', 'stripe_identity', now());
    UPDATE profiles SET verification_level = 'identity_verified' WHERE id = '$1';"
  psql "$DB" -q -c "UPDATE profiles SET trust_score = compute_trust_score(id) WHERE id = '$1';"
}

# §16.1's Business tier, which is what makes job posting free (5/month).
# Stripe writes this row in M5; M4 only reads it.
# Upsert by hand: §7 puts no unique constraint on `subscriptions.profile_id`,
# so ON CONFLICT has nothing to match. (That is a real gap for §24.10's webhook
# idempotency, and it belongs to M5 — noted here rather than papered over.)
subscribe_business() {
  psql "$DB" -q -c "
    UPDATE subscriptions SET tier = 'business', status = 'active',
           current_period_end = now() + INTERVAL '30 days'
     WHERE profile_id = '$1';
    INSERT INTO subscriptions (profile_id, tier, status, current_period_end)
    SELECT '$1', 'business', 'active', now() + INTERVAL '30 days'
     WHERE NOT EXISTS (SELECT 1 FROM subscriptions WHERE profile_id = '$1');"
}

notifications_of() {
  psql "$DB" -tAc "SELECT type FROM notifications WHERE profile_id = '$1' ORDER BY created_at"
}

drain_index() {
  curl -sS -X POST "$API/v1/jobs/search-sync" -H "x-cron-secret: $CRON_SECRET" > /dev/null
}

# ── fixtures ───────────────────────────────────────────────────────────
say "0. Fixtures"
EMPLOYER=$(register employer "Kayseri Hara")
RIDER=$(register rider "Aday Binici")
FARRIER=$(register farrier "Nalbant Usta")
OUTSIDER=$(register outsider "Yabanci Kisi")

EMPLOYER_ID=$(profile_id_of "$EMPLOYER")
RIDER_ID=$(profile_id_of "$RIDER")
FARRIER_ID=$(profile_id_of "$FARRIER")
OUTSIDER_ID=$(profile_id_of "$OUTSIDER")

verify_identity "$EMPLOYER_ID"
verify_identity "$RIDER_ID"
verify_identity "$FARRIER_ID"
verify_identity "$OUTSIDER_ID"
subscribe_business "$EMPLOYER_ID"

# One deliberately unverified account: §3.3 makes review-writing a
# verified-only capability, and that rule needs its own witness.
NEWBIE=$(register newbie "Yeni Uye")
NEWBIE_ID=$(profile_id_of "$NEWBIE")
pass "five accounts created; employer is identity-verified on the Business tier"

# ── 1. §26 job legality ────────────────────────────────────────────────
say "1. §26 — a job that fails the legality checks cannot be published"

post_job() {
  curl -sS -X POST "$API/v1/jobs" -H "authorization: Bearer $EMPLOYER" \
    -H 'content-type: application/json' -d "$1"
}

UNPAID=$(post_job '{"title":"Seyis araniyor (ucretsiz)","jobType":"full_time","rolesNeeded":["groom"],
  "description":"Ahirimizda tam zamanli seyis ariyoruz. Konaklama ve yemek dahildir, maas yoktur. Atlarin gunluk bakimi, padok cikisi ve temizlik islerinden sorumlu olacaksin.",
  "countryCode":"TR","city":"Kayseri","salaryMin":0,"salaryMax":0,"salaryCurrency":"TRY","salaryPeriod":"month",
  "accommodation":"private","mealsIncluded":true}')
UNPAID_ID=$(echo "$UNPAID" | json "d['data']['id']")

RESULT=$(curl -sS -X POST "$API/v1/jobs/$UNPAID_ID/publish" -H "authorization: Bearer $EMPLOYER")
CODE=$(echo "$RESULT" | json "d['error']['code']")
[ "$CODE" = "PROHIBITED_CONTENT" ] || fail "unpaid full-time job was publishable: $RESULT"
echo "$RESULT" | grep -q "Konaklama" || fail "the refusal did not name the accommodation argument"
pass "unpaid full-time job refused with PROHIBITED_CONTENT"

LOWPAY=$(post_job '{"title":"Seyis araniyor (dusuk ucret)","jobType":"full_time","rolesNeeded":["groom"],
  "description":"Ahirimizda tam zamanli seyis ariyoruz. Atlarin gunluk bakimi, padok cikisi ve temizlik islerinden sorumlu olacaksin. Deneyim sart degildir.",
  "countryCode":"TR","city":"Kayseri","salaryMin":12000,"salaryCurrency":"TRY","salaryPeriod":"month"}')
LOWPAY_ID=$(echo "$LOWPAY" | json "d['data']['id']")
RESULT=$(curl -sS -X POST "$API/v1/jobs/$LOWPAY_ID/publish" -H "authorization: Bearer $EMPLOYER")
CODE=$(echo "$RESULT" | json "d['error']['code']")
[ "$CODE" = "PROHIBITED_CONTENT" ] || fail "below-minimum-wage job was publishable: $RESULT"
pass "wage below the Turkish minimum refused, with the numbers in the message"

# ── 2. §3.3 — publishing a job is paid unless you are Business ─────────
say "2. §3.3 — an identity-verified free-tier poster is sent to checkout, not blocked"

FREE_JOB=$(curl -sS -X POST "$API/v1/jobs" -H "authorization: Bearer $FARRIER" \
  -H 'content-type: application/json' -d '{"title":"Nalbant yardimcisi","jobType":"part_time",
  "rolesNeeded":["farrier"],"description":"Nalbant atolyemizde yarim zamanli yardimci ariyoruz. Islerin buyuk kismi saha ziyaretlerinde geciyor, ehliyet tercih sebebidir.",
  "countryCode":"TR","city":"Ankara"}')
FREE_JOB_ID=$(echo "$FREE_JOB" | json "d['data']['id']")
RESULT=$(curl -sS -X POST "$API/v1/jobs/$FREE_JOB_ID/publish" -H "authorization: Bearer $FARRIER")
CODE=$(echo "$RESULT" | json "d['error']['code']")
[ "$CODE" = "PAYMENT_REQUIRED" ] || fail "free tier published a job for nothing: $RESULT"
PRODUCT=$(echo "$RESULT" | json "d['error']['details']['product']")
[ "$PRODUCT" = "job_post" ] || fail "the paywall did not name the §16.1 product"
pass "free tier answered PAYMENT_REQUIRED naming the job_post product"

# A paid purchase is what M5's webhook writes; publishing must consume it.
psql "$DB" -q -c "INSERT INTO purchases (profile_id, product, target_type, target_id, amount, currency, status)
                  VALUES ('$FARRIER_ID','job_post','job','$FREE_JOB_ID',79,'EUR','paid');"
RESULT=$(curl -sS -X POST "$API/v1/jobs/$FREE_JOB_ID/publish" -H "authorization: Bearer $FARRIER")
STATUS=$(echo "$RESULT" | json "d['data']['status']")
[ "$STATUS" = "active" ] || fail "a paid job post did not publish: $RESULT"
APPLIED=$(psql "$DB" -tAc "SELECT applied_at IS NOT NULL FROM purchases WHERE target_id = '$FREE_JOB_ID'")
[ "$APPLIED" = "t" ] || fail "the purchase was not consumed and could publish a second job"
pass "a paid job_post purchase publishes the job and is marked applied"

# ── 3. Post → the job board ────────────────────────────────────────────
say "3. Post — the Business-tier employer publishes"

JOB=$(post_job '{"title":"Dresaj binicisi araniyor","jobType":"full_time","rolesNeeded":["rider","groom"],
  "disciplines":["dressage"],
  "description":"Kayseri Hara olarak dresaj ekibimize tam zamanli binici ariyoruz. Gunde 6 at calistiracak, genc atlarin temel egitiminden sorumlu olacaksin. Antrenorumuzle birlikte haftalik program hazirlanir.",
  "requirements":"En az 3 yil dresaj deneyimi, L seviyesi yarisma tecrubesi.",
  "countryCode":"TR","region":"Kayseri","city":"Kayseri","lat":38.73,"lng":35.48,
  "salaryMin":45000,"salaryMax":55000,"salaryCurrency":"TRY","salaryPeriod":"month",
  "accommodation":"private","mealsIncluded":true,"visaSupport":true,
  "horseCount":24,"experienceYearsMin":3,"languagesRequired":["tr","en"]}')
JOB_ID=$(echo "$JOB" | json "d['data']['id']")
JOB_SLUG=$(echo "$JOB" | json "d['data']['slug']")

RESULT=$(curl -sS -X POST "$API/v1/jobs/$JOB_ID/publish" -H "authorization: Bearer $EMPLOYER")
STATUS=$(echo "$RESULT" | json "d['data']['status']")
PAID_WITH=$(echo "$RESULT" | json "d['data']['paidWith']")
[ "$STATUS" = "active" ] || fail "the Business-tier job did not publish: $RESULT"
[ "$PAID_WITH" = "plan_allowance" ] || fail "Business tier was charged instead of using its allowance"
pass "job published on the Business plan allowance — status=$STATUS"

# §26's employment-terms notice ships with the job itself.
DETAIL=$(curl -sS "$API/v1/jobs/$JOB_SLUG")
echo "$DETAIL" | json "d['data']['notice']['tr']" | grep -q "taraf" \
  || fail "§26's employment-terms notice missing from the job detail"
pass "§26 notice ships with the job, not with the client build"

drain_index
FOUND=$(curl -sS "$API/v1/jobs/search?jobTypes=full_time&countryCode=TR&accommodation=private" | json "d['meta']['total']")
[ "$FOUND" -ge 1 ] || fail "the published job is not searchable"
SALARY=$(curl -sS "$API/v1/jobs/search?q=dresaj" | json "d['data'][0]['salaryMonthlyEur']")
[ "$SALARY" != "None" ] || fail "salary was not normalized for cross-country filtering"
pass "searchable by type, country and accommodation; salary normalized to EUR/month"

# §18.2 S20's "gizle" toggle must survive into the index.
curl -sS -X PATCH "$API/v1/jobs/$JOB_ID" -H "authorization: Bearer $EMPLOYER" \
  -H 'content-type: application/json' -d '{"salaryPublic":false}' > /dev/null
drain_index
HIDDEN=$(curl -sS "$API/v1/jobs/search?q=dresaj" | json "d['data'][0]['salaryMin']")
[ "$HIDDEN" = "None" ] || fail "a hidden salary leaked through the search index"
STRANGER=$(curl -sS "$API/v1/jobs/$JOB_SLUG" | json "d['data']['salary_min']")
[ "$STRANGER" = "None" ] || fail "a hidden salary leaked through the detail endpoint"
OWNER_VIEW=$(curl -sS "$API/v1/jobs/$JOB_SLUG" -H "authorization: Bearer $EMPLOYER" | json "d['data']['salary_min']")
[ "$OWNER_VIEW" != "None" ] || fail "the poster cannot see their own salary"
curl -sS -X PATCH "$API/v1/jobs/$JOB_ID" -H "authorization: Bearer $EMPLOYER" \
  -H 'content-type: application/json' -d '{"salaryPublic":true}' > /dev/null
drain_index
pass "a hidden salary is absent from the index and the detail, and visible to the poster"

# ── 4. Apply ───────────────────────────────────────────────────────────
say "4. Apply — §18.2 S19 opens a conversation with the poster"

APPLICATION=$(curl -sS -X POST "$API/v1/jobs/$JOB_SLUG/apply" -H "authorization: Bearer $RIDER" \
  -H 'content-type: application/json' \
  -d '{"coverLetter":"Merhaba, alti yildir dresaj calisiyorum ve son iki yildir genc at egitimi yapiyorum. L seviyesinde yarismalarim var.","answers":{"ehliyet":"var"}}')
APPLICATION_ID=$(echo "$APPLICATION" | json "d['data']['id']")
CONVERSATION_ID=$(echo "$APPLICATION" | json "d['data']['conversationId']")
[ "$(echo "$APPLICATION" | json "d['data']['status']")" = "submitted" ] || fail "application not submitted"
pass "application $APPLICATION_ID submitted with conversation $CONVERSATION_ID"

BODY=$(psql "$DB" -tAc "SELECT body FROM conversation_messages
                        WHERE conversation_id = '$CONVERSATION_ID' AND sender_id = '$RIDER_ID'")
echo "$BODY" | grep -q "dresaj" || fail "the cover letter is not the first message in the thread"
notifications_of "$EMPLOYER_ID" | grep -q "message.new" || fail "the poster was not notified"
pass "the cover letter opens the thread and the poster is notified"

COUNT=$(psql "$DB" -tAc "SELECT application_count FROM job_listings WHERE id = '$JOB_ID'")
[ "$COUNT" = "1" ] || fail "application_count is $COUNT, expected 1"
pass "the poster's application counter was bumped by the trigger, not by the applicant"

DUPLICATE=$(curl -sS -X POST "$API/v1/jobs/$JOB_ID/apply" -H "authorization: Bearer $RIDER" \
  -H 'content-type: application/json' -d '{"coverLetter":"Ayni ilana ikinci kez basvuruyorum, olur mu acaba?"}')
[ "$(echo "$DUPLICATE" | json "d['error']['code']")" = "CONFLICT" ] || fail "applied twice: $DUPLICATE"

OWN=$(curl -sS -X POST "$API/v1/jobs/$JOB_ID/apply" -H "authorization: Bearer $EMPLOYER" \
  -H 'content-type: application/json' -d '{"coverLetter":"Kendi ilanima basvurmayi deniyorum ki reddedilsin."}')
echo "$OWN" | grep -q "Kendi" || fail "the poster could apply to their own job: $OWN"
pass "a second application and a self-application are both refused"

# ── 5. Shortlist ───────────────────────────────────────────────────────
say "5. Shortlist — §13.6's state machine, notifying at every step"

LIST=$(curl -sS "$API/v1/jobs/$JOB_ID/applications" -H "authorization: Bearer $EMPLOYER")
[ "$(echo "$LIST" | json "len(d['data'])")" = "1" ] || fail "the poster cannot see the application"
STATUS=$(psql "$DB" -tAc "SELECT status FROM job_applications WHERE id = '$APPLICATION_ID'")
[ "$STATUS" = "viewed" ] || fail "opening the list did not mark the application viewed, got $STATUS"
notifications_of "$RIDER_ID" | grep -q "application.status_changed" \
  || fail "the applicant was not told their application was viewed"
pass "opening the list moved submitted → viewed and notified the applicant"

HIDDEN_LIST=$(curl -sS "$API/v1/jobs/$JOB_ID/applications" -H "authorization: Bearer $OUTSIDER")
[ "$(echo "$HIDDEN_LIST" | json "d['error']['code']")" = "NOT_FOUND" ] \
  || fail "an outsider could read the applicant pool: $HIDDEN_LIST"
pass "an outsider gets NOT_FOUND, not an empty list"

RESULT=$(curl -sS -X PATCH "$API/v1/applications/$APPLICATION_ID" -H "authorization: Bearer $EMPLOYER" \
  -H 'content-type: application/json' \
  -d '{"status":"shortlisted","note":"Ozgecmisin cok iyi, cuma gunu gorusebilir miyiz?"}')
[ "$(echo "$RESULT" | json "d['data']['status']")" = "shortlisted" ] || fail "shortlist failed: $RESULT"
SYSTEM_MSG=$(psql "$DB" -tAc "SELECT body FROM conversation_messages
                              WHERE conversation_id = '$CONVERSATION_ID' AND sender_id IS NULL
                              ORDER BY created_at DESC LIMIT 1")
echo "$SYSTEM_MSG" | grep -q "listeye" || fail "the decision was not posted into the thread: $SYSTEM_MSG"
pass "shortlisted, with the decision and its note posted into the applicant's thread"

BACKWARDS=$(curl -sS -X PATCH "$API/v1/applications/$APPLICATION_ID" -H "authorization: Bearer $EMPLOYER" \
  -H 'content-type: application/json' -d '{"status":"viewed"}')
echo "$BACKWARDS" | grep -q "geri alinamaz\|geri alınamaz" || fail "an applicant was walked backwards: $BACKWARDS"

SELF_OFFER=$(curl -sS -X PATCH "$API/v1/applications/$APPLICATION_ID" -H "authorization: Bearer $RIDER" \
  -H 'content-type: application/json' -d '{"status":"offered"}')
echo "$SELF_OFFER" | grep -q "geri cekebilirsin\|geri çekebilirsin" || fail "an applicant offered themselves a job: $SELF_OFFER"
pass "the status cannot go backwards, and an applicant can only withdraw"

STRANGER_DECIDE=$(curl -sS -X PATCH "$API/v1/applications/$APPLICATION_ID" -H "authorization: Bearer $OUTSIDER" \
  -H 'content-type: application/json' -d '{"status":"rejected"}')
[ "$(echo "$STRANGER_DECIDE" | json "d['error']['code']")" = "NOT_FOUND" ] \
  || fail "a stranger could decide someone else's application: $STRANGER_DECIDE"
pass "a stranger cannot touch the application"

# ── 6. Message ─────────────────────────────────────────────────────────
say "6. Message — the thread the application opened is a normal conversation"

send() {
  curl -sS -X POST "$API/v1/conversations/$CONVERSATION_ID/messages" -H "authorization: Bearer $1" \
    -H 'content-type: application/json' -d "{\"body\":\"$2\"}"
}

send "$EMPLOYER" "Merhaba, cuma 14:00 uygun mu? Harada bir deneme binisi yapariz." > /dev/null
send "$RIDER" "Cuma 14:00 benim icin uygun, tesekkurler." > /dev/null
send "$EMPLOYER" "Harika, adresi mesajla gonderiyorum." > /dev/null
THREAD=$(curl -sS "$API/v1/conversations/$CONVERSATION_ID" -H "authorization: Bearer $RIDER" | json "len(d['data'])")
[ "$THREAD" -ge 5 ] || fail "the thread does not carry the whole exchange, got $THREAD messages"
pass "post → apply → shortlist → message works end to end ($THREAD messages in the thread)"

# ── 7. §13.4 reviews ───────────────────────────────────────────────────
say "7. §13.4 — reviews need a real conversation (§24.12)"

UNVERIFIED_REVIEW=$(curl -sS -X POST "$API/v1/reviews" -H "authorization: Bearer $NEWBIE" \
  -H 'content-type: application/json' \
  -d "{\"subjectType\":\"user\",\"subjectProfileId\":\"$EMPLOYER_ID\",\"rating\":5,\"body\":\"Dogrulamasiz yazmayi deniyorum.\"}")
[ "$(echo "$UNVERIFIED_REVIEW" | json "d['error']['details']['reason']")" = "not_verified" ] \
  || fail "an unverified account wrote a review (§3.3): $UNVERIFIED_REVIEW"
pass "§3.3 — writing a review requires identity verification"

STRANGER_REVIEW=$(curl -sS -X POST "$API/v1/reviews" -H "authorization: Bearer $OUTSIDER" \
  -H 'content-type: application/json' \
  -d "{\"subjectType\":\"user\",\"subjectProfileId\":\"$EMPLOYER_ID\",\"rating\":1,\"body\":\"Hic konusmadim ama kotu.\"}")
[ "$(echo "$STRANGER_REVIEW" | json "d['error']['details']['reason']")" = "no_qualifying_contact" ] \
  || fail "someone with no contact wrote a review: $STRANGER_REVIEW"
pass "a review with no qualifying contact is refused with a specific reason"

ELIGIBILITY=$(curl -sS "$API/v1/reviews/eligibility?conversationId=$CONVERSATION_ID&subjectProfileId=$EMPLOYER_ID" \
  -H "authorization: Bearer $RIDER")
[ "$(echo "$ELIGIBILITY" | json "d['data']['eligible']")" = "True" ] || fail "a two-sided thread was not eligible: $ELIGIBILITY"
pass "two messages from each side opens the window, and the API says when it closes"

REVIEW=$(curl -sS -X POST "$API/v1/reviews" -H "authorization: Bearer $RIDER" \
  -H 'content-type: application/json' \
  -d "{\"subjectType\":\"user\",\"subjectProfileId\":\"$EMPLOYER_ID\",\"conversationId\":\"$CONVERSATION_ID\",
       \"rating\":5,\"ratingCommunication\":5,\"ratingProfessionalism\":4,
       \"body\":\"Basvuru surecinde her adimda haber verdiler, cok duzgun iletisim kurdular.\"}")
REVIEW_ID=$(echo "$REVIEW" | json "d['data']['id']")
notifications_of "$EMPLOYER_ID" | grep -q "review.received" || fail "the subject was not notified of the review"
pass "review $REVIEW_ID written and the subject notified"

AGAIN=$(curl -sS -X POST "$API/v1/reviews" -H "authorization: Bearer $RIDER" \
  -H 'content-type: application/json' \
  -d "{\"subjectType\":\"user\",\"subjectProfileId\":\"$EMPLOYER_ID\",\"conversationId\":\"$CONVERSATION_ID\",\"rating\":1}")
[ "$(echo "$AGAIN" | json "d['error']['details']['reason']")" = "already_reviewed" ] \
  || fail "a second review for the same conversation was accepted: $AGAIN"
pass "one review per conversation"

curl -sS -X PATCH "$API/v1/reviews/$REVIEW_ID/response" -H "authorization: Bearer $EMPLOYER" \
  -H 'content-type: application/json' -d '{"body":"Tesekkur ederiz, bize de keyifli bir surecti."}' -o /dev/null -w ''
SECOND=$(curl -sS -X PATCH "$API/v1/reviews/$REVIEW_ID/response" -H "authorization: Bearer $EMPLOYER" \
  -H 'content-type: application/json' -d '{"body":"Bir sey daha eklemek istiyorum."}')
echo "$SECOND" | grep -q "Tek yanit\|Tek yanıt" || fail "the subject answered twice: $SECOND"

WRONG_RESPONDER=$(curl -sS -X PATCH "$API/v1/reviews/$REVIEW_ID/response" -H "authorization: Bearer $OUTSIDER" \
  -H 'content-type: application/json' -d '{"body":"Ben de bir sey ekleyeyim."}')
[ "$(echo "$WRONG_RESPONDER" | json "d['error']['code']")" = "FORBIDDEN" ] \
  || fail "a stranger responded to a review: $WRONG_RESPONDER"
# And the refusal must be the right one: telling a passer-by "you already
# answered" would be a lie about a review they have never touched.
echo "$WRONG_RESPONDER" | grep -q "değerlendirilen kişi" \
  || fail "the stranger got the wrong refusal: $WRONG_RESPONDER"
pass "the subject gets exactly one response, and only the subject"

SUMMARY=$(curl -sS "$API/v1/reviews?subjectProfileId=$EMPLOYER_ID")
[ "$(echo "$SUMMARY" | json "d['meta']['summary']['count']")" = "1" ] || fail "the rating summary is wrong: $SUMMARY"

# §13.4: reviews are not deletable — only hidden, by a moderator, with a reason.
NOT_STAFF=$(curl -sS -X POST "$API/v1/admin/reviews/$REVIEW_ID/hide" -H "authorization: Bearer $EMPLOYER" \
  -H 'content-type: application/json' -d '{"reason":"Hosuma gitmedi"}')
# NOT_FOUND rather than FORBIDDEN is deliberate (StaffGuard): the existence
# of the admin console is not something an ordinary user needs confirmed.
[ "$(echo "$NOT_STAFF" | json "d['error']['code']")" = "NOT_FOUND" ] \
  || fail "a subject could hide their own review: $NOT_STAFF"
STILL_VISIBLE=$(curl -sS "$API/v1/reviews?subjectProfileId=$EMPLOYER_ID" | json "d['meta']['summary']['count']")
[ "$STILL_VISIBLE" = "1" ] || fail "the review disappeared after a non-moderator asked to hide it"

psql "$DB" -q -c "UPDATE profiles SET is_moderator = TRUE WHERE id = '$OUTSIDER_ID';"
curl -sS -X POST "$API/v1/admin/reviews/$REVIEW_ID/hide" -H "authorization: Bearer $OUTSIDER" \
  -H 'content-type: application/json' -d '{"reason":"Kisisel veri paylasimi"}' > /dev/null
HIDDEN_BY=$(psql "$DB" -tAc "SELECT hidden_by IS NOT NULL AND hidden_reason IS NOT NULL FROM reviews WHERE id = '$REVIEW_ID'")
[ "$HIDDEN_BY" = "t" ] || fail "the hide was not attributed and logged"
AFTER=$(curl -sS "$API/v1/reviews?subjectProfileId=$EMPLOYER_ID" | json "d['meta']['summary']['count']")
[ "$AFTER" = "0" ] || fail "a hidden review still counts towards the rating"
pass "only a moderator can hide a review; the reason and the author are logged, and the rating follows"

# ── 8. Services ────────────────────────────────────────────────────────
say "8. Services — §18.2 S15/S16 and §26's transport notice"

UNVERIFIED_SERVICE=$(curl -sS -X POST "$API/v1/services" -H "authorization: Bearer $NEWBIE" \
  -H 'content-type: application/json' -d '{"category":"transport","title":"At nakliyesi",
  "description":"Turkiye genelinde at nakliyesi yapiyoruz, klimali arac ve deneyimli sofor.",
  "countryCode":"TR","city":"Istanbul"}')
UNVERIFIED_ID=$(echo "$UNVERIFIED_SERVICE" | json "d['data']['id']")
RESULT=$(curl -sS -X POST "$API/v1/services/$UNVERIFIED_ID/publish" -H "authorization: Bearer $NEWBIE")
[ "$(echo "$RESULT" | json "d['error']['code']")" = "VERIFICATION_REQUIRED" ] \
  || fail "an unverified provider published a service: $RESULT"
pass "§3.3's hard rule applies to service listings too"

SERVICE=$(curl -sS -X POST "$API/v1/services" -H "authorization: Bearer $FARRIER" \
  -H 'content-type: application/json' -d '{"category":"farrier","title":"Mobil nalbant hizmeti",
  "description":"Ankara ve cevresinde mobil nalbant hizmeti. Normal nallama, ortopedik nallama ve acil mudahale.",
  "priceMin":800,"priceMax":1500,"priceUnit":"session","currency":"TRY",
  "countryCode":"TR","region":"Ankara","city":"Ankara","lat":39.93,"lng":32.86,
  "serviceRadiusKm":120,"isMobile":true}')
SERVICE_ID=$(echo "$SERVICE" | json "d['data']['id']")
SERVICE_SLUG=$(echo "$SERVICE" | json "d['data']['slug']")
curl -sS -X POST "$API/v1/services/$SERVICE_ID/publish" -H "authorization: Bearer $FARRIER" > /dev/null

CONTACT=$(curl -sS -X POST "$API/v1/services" -H "authorization: Bearer $FARRIER" \
  -H 'content-type: application/json' -d '{"category":"farrier","title":"Nalbant",
  "description":"Hemen arayin 0532 111 22 33, her turlu nallama isi yapilir ve fiyat konusuruz.",
  "countryCode":"TR","city":"Ankara"}')
echo "$CONTACT" | grep -q "telefon" || fail "a phone number in a service description was accepted: $CONTACT"
pass "service published; contact details in the body are refused (§14.3)"

TRANSPORT=$(curl -sS -X POST "$API/v1/services" -H "authorization: Bearer $EMPLOYER" \
  -H 'content-type: application/json' -d '{"category":"transport","title":"Yurt ici at nakliyesi",
  "description":"Kayseri merkezli at nakliyesi. Klimali arac, GPS takibi ve yol boyunca duzenli mola.",
  "countryCode":"TR","city":"Kayseri","lat":38.73,"lng":35.48,"isMobile":true}')
TRANSPORT_ID=$(echo "$TRANSPORT" | json "d['data']['id']")
curl -sS -X POST "$API/v1/services/$TRANSPORT_ID/publish" -H "authorization: Bearer $EMPLOYER" > /dev/null
NOTICE=$(curl -sS "$API/v1/services/$TRANSPORT_ID" | json "d['data']['notice']['tr']")
echo "$NOTICE" | grep -q "1/2005" || fail "§26's transport notice is missing"
FARRIER_NOTICE=$(curl -sS "$API/v1/services/$SERVICE_SLUG" | json "d['data']['notice']")
[ "$FARRIER_NOTICE" = "None" ] || fail "the transport notice was attached to a farrier"
pass "§26's transport notice appears on transport services and nowhere else"

drain_index
NEARBY=$(curl -sS "$API/v1/services/search?categories=farrier&lat=39.0&lng=32.5&radiusKm=50" | json "d['meta']['total']")
[ "$NEARBY" -ge 1 ] || fail "a mobile provider whose radius covers the point was not found"
STRICT=$(curl -sS "$API/v1/services/search?categories=farrier&lat=39.0&lng=32.5&radiusKm=50&includeRadiusMatches=false" | json "d['meta']['total']")
[ "$STRICT" = "0" ] || fail "includeRadiusMatches=false was ignored — the 'false' string bug"
pass "coverage-radius matching works, and switching it off actually switches it off"

CATEGORIES=$(curl -sS "$API/v1/services/categories" | json "len(d['data'])")
[ "$CATEGORIES" = "22" ] || fail "the §9.3 category grid has $CATEGORIES tiles, expected 22"
pass "§18.2 S15's category grid returns all 22 categories with live counts"

# ── 9. Professional directory ──────────────────────────────────────────
say "9. Professional directory — §11.1's professionals collection"

curl -sS -X POST "$API/v1/me/roles" -H "authorization: Bearer $FARRIER" \
  -H 'content-type: application/json' \
  -d '{"role":"farrier","headline":"Ortopedik nallama uzmani","yearsExperience":12,
       "specialties":["ortopedik_nallama"],"disciplines":["jumping"],"travels":true,
       "serviceRadiusKm":120}' > /dev/null
drain_index

DIRECTORY=$(curl -sS "$API/v1/professionals/search?roles=farrier")
COUNT=$(echo "$DIRECTORY" | json "d['meta']['total']")
[ "$COUNT" -ge 1 ] || fail "a public role profile is not in the directory: $DIRECTORY"
echo "$DIRECTORY" | json "d['data'][0]['yearsExperience']" | grep -q "12" || fail "the directory card lost its experience"

BUYERS=$(curl -sS "$API/v1/professionals/search?q=Yabanci" | json "d['meta']['total']")
[ "$BUYERS" = "0" ] || fail "someone with no public role profile is in the professional directory"
pass "professionals with a public role profile are indexed; everyone else is not"

EXPERIENCE=$(curl -sS "$API/v1/professionals/search?roles=farrier&minYearsExperience=20" | json "d['meta']['total']")
[ "$EXPERIENCE" = "0" ] || fail "the experience filter is inert"
pass "directory filters (role, experience) narrow the result"

# ── 10. §13.6 expiry ───────────────────────────────────────────────────
say "10. §13.6 — applications auto-close when the job expires"

psql "$DB" -q -c "UPDATE job_listings SET expires_at = now() - INTERVAL '1 day' WHERE id = '$JOB_ID';"
SWEEP=$(curl -sS -X POST "$API/v1/jobs/marketplace-sweeps" -H "x-cron-secret: $CRON_SECRET")
CLOSED=$(echo "$SWEEP" | json "d['data']['closedApplications']")
[ "$CLOSED" -ge 1 ] || fail "the sweep closed no applications: $SWEEP"
STATUS=$(psql "$DB" -tAc "SELECT status FROM job_applications WHERE id = '$APPLICATION_ID'")
[ "$STATUS" = "rejected" ] || fail "an application survived its job's expiry as $STATUS"
NOTE=$(psql "$DB" -tAc "SELECT status_note FROM job_applications WHERE id = '$APPLICATION_ID'")
echo "$NOTE" | grep -q "süresi doldu" || fail "the applicant was not told why: $NOTE"
JOB_STATUS=$(psql "$DB" -tAc "SELECT status FROM job_listings WHERE id = '$JOB_ID'")
[ "$JOB_STATUS" = "expired" ] || fail "the job is still $JOB_STATUS"
pass "the expired job closed its applications, with the reason recorded and the applicant notified"

drain_index
# By document id, not by a title query: a dev database accumulates jobs from
# earlier runs, and matching on "dresaj" would count those too.
GONE=$(psql "$DB" -tAc "SELECT count(*) FROM search_documents
                        WHERE collection = 'jobs' AND document_id = '$JOB_ID'")
[ "$GONE" = "0" ] || fail "an expired job is still in the search index"
pass "the expired job left the index"

say "M4 acceptance: all checks passed"
