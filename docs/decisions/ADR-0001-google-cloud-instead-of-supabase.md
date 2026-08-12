# ADR-0001 — Google Cloud + Cloud SQL instead of Supabase

**Status:** accepted · 2026-08-12
**Supersedes:** spec §4 rows "Database", "Backend/BaaS", "Object storage", "SMS/OTP"

## Context

Spec §4 fixes the stack on Supabase (Auth + Postgres + Storage) with the API on
Fly.io. The product owner asked to host on Google instead.

The swap is shallower than it looks, because §4 already states the important
constraint: *"Supabase is used for Auth + Postgres + Storage-signing only. All
writes go through the NestJS API."* Supabase was never load-bearing for business
logic, so replacing it does not touch §12, §13, or §14.

## Decision

| Concern | Was (§4) | Now |
|---|---|---|
| Database | Supabase Postgres | **Cloud SQL for PostgreSQL 15+** with PostGIS |
| Auth | Supabase Auth | **Firebase Auth** (email/password, Apple, Google, phone OTP) |
| Object storage | Cloudflare R2 | **Cloud Storage (GCS)**, S3-compatible API retained |
| API hosting | Fly.io / Railway | **Cloud Run** |
| Queue backend | Redis | **Memorystore for Redis** |
| SMS/OTP | Twilio Verify | **Firebase Auth phone sign-in** |
| Push | FCM | FCM (unchanged — already Google) |

Unchanged from §4: NestJS, Prisma, Typesense, Next.js, Stripe, Stream Chat,
Mux, Resend, PostHog, Sentry, Cloudflare Images.

## Consequences

**Firestore is explicitly rejected.** "Host on Google" does not mean the
document store. The data model is irreducibly relational: PostGIS radius
search (§7, §11), partial unique indexes (`uq_one_active_listing_per_horse`),
recursive self-joins for the 3-generation pedigree (§18.2 S08), array
containment filters on `disciplines`, and RLS (§8). None of these exist in
Firestore, and rebuilding them in application code would relocate correctness
into the layer §4 deliberately keeps thin.

**RLS survives the move.** Supabase drives `auth.uid()` from PostgREST's JWT
claims. Cloud SQL has no PostgREST, so the NestJS transaction interceptor
issues `SET LOCAL request.jwt.claims = '{"sub":"<profile_id>"}'` at the start
of every request transaction. `auth.uid()` reads that GUC, so every §8 policy
works verbatim. See ADR-0004.

**Twilio drops out of the stack.** Firebase phone sign-in covers §14.1's
`phone_verified` rung, removing one vendor, one DPA (§26), and one set of
credentials. `TWILIO_*` env vars are removed from §6.

**Identity verification still runs on Stripe.** Firebase has no equivalent of
Stripe Identity, and §14.1 makes `identity_verified` the gate for publishing —
the single most important anti-fraud control (§3.3). Keeping Stripe Identity
also keeps it on the same account as Billing (§16).

**EU data residency (§26)** is satisfied by pinning Cloud SQL, Cloud Run, GCS
and Memorystore to `europe-west1`/`europe-west3`. Firebase Auth stores user
records in the US; this is disclosed in the privacy policy and covered by
Google's SCCs. Personal data beyond the auth record lives in Cloud SQL in the
EU.
