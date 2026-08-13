# ADR-0007 — A billing provider seam, with Stripe as production

**Status:** accepted · 2026-08-13
**Relates to:** spec §4 (Payments: Stripe), §16, §24.10, §24.11

## Context

§4 fixes payments on Stripe and §16.2 specifies the flow: create a Checkout
Session with `client_reference_id = profile_id` and `metadata {product,
targetId}`, redirect, then apply the effect from the webhook. §24.10 makes
idempotency an acceptance criterion — "replay the same event 3× → one effect"
— and §24.11 specifies what a downgrade must do to eight active listings.

Everything interesting in that list happens *after* Stripe. The redirect and
the card form are Stripe's; what this codebase owns is the handler, and the
handler is exactly what a real Stripe account cannot exercise in a test. You
cannot ask Stripe to redeliver an event three times on demand, cancel a
subscription at a chosen instant, or fail an invoice, without a fixture layer
of some kind.

The same environment constraint as ADR-0005 also applies: `api.stripe.com` is
unreachable from this build's proxy, so a Stripe-only implementation would have
been written blind and never run.

## Decision

A `BillingProvider` interface with two implementations, and one handler behind
both:

- **`StripeBillingProvider`** — production, selected whenever
  `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set. It creates Checkout,
  Portal and Identity sessions, verifies webhook signatures with Stripe's own
  `constructEvent`, and **normalizes** each event into a flat
  `{profileId, product, targetId, …}` shape.
- **`LocalBillingProvider`** — development and test. It issues session ids and
  URLs, and verifies webhooks with a real HMAC-SHA256 over the raw body. It
  does not simulate money: §16.3 rules out escrow, held funds and transaction
  fees, so there is nothing else to fake.

The normalization step is what makes the seam honest. `BillingService` never
sees a `Stripe.Subscription`, so the local provider does not have to imitate
Stripe's object graph — it produces the same normalized events, and every
§24.10 and §24.11 case runs through the identical handler.

The local provider is refused in production, like storage and messaging before
it. Here the reason is blunt: a billing provider that charges nobody would give
away every subscription in §16.1.

## Consequences

- `scripts/m5-acceptance.sh` exercises the full §16.2 flow — signature refusal,
  triple delivery, subscription changes in both directions, a boost that
  demonstrably moves a listing from position 7 to position 0 and is labelled,
  the §24.11 downgrade, a failed payment, and Stripe Identity raising a
  verification level.
- **The Stripe adapter has never run.** Its session creation and its event
  normalization are written against Stripe's documented shapes. Before launch
  they need one pass against Stripe's test mode and its CLI event forwarder;
  that is a §24 launch item, not something this milestone can claim.
- The API version is pinned (`2026-07-29.dahlia`). An unpinned client silently
  changes event shapes when Stripe rolls a version.

## Decisions where §16 is silent

**A subscription writes no `purchases` row.** §7's `purchases_product_check`
lists only the four one-off products, and that constraint is right: a
subscription is a *state* (`subscriptions`), not a purchase. So a subscription
checkout records nothing until `customer.subscription.created` arrives.

**A `job_post` payment is not applied at payment time.** It becomes a credit
that `JobsService.publish` consumes (migration 0041). Applying it when the
money arrives would burn the credit on a job that has not yet passed §26's
legality checks — the poster would have paid for a listing the API then
refuses.

**Extending a live boost adds to it rather than restarting it.** Someone who
buys 30 days on day 3 of a 7-day boost paid for 37 days of visibility.

**Upgrading does not auto-republish paused listings.** §24.11 says a downgrade
pauses rather than deletes; it does not say an upgrade resumes. Resuming
automatically would republish listings the seller may have since sold
elsewhere, so the allowance is restored and the republish stays a decision.

**Two notification types are not in §17's table.** §24.11 requires the user to
be notified when a downgrade pauses their listings, and §17 lists no type for
it; `subscription.downgraded` fills that gap. `purchase.completed` confirms an
applied boost. Both respect §17's preference and quiet-hour rules like every
other type.

## Bugs this milestone surfaced

**The verification ladder could not be written to.** `verifications` had one
policy — `verifications_own`, FOR SELECT — so `POST /verification/submit`
raised an RLS error for every professional, business and horse-ownership
submission, and `VerificationService.decide` updated zero rows while returning
success. M3's acceptance run drove identity through SQL and never touched
either path. Migration 0045 adds an INSERT policy for self-submission and a
`decide_verification` function for the privileged half.

**A failed payment downgraded a paying customer to free.** The
`invoice.payment_failed` handler passed subselects for the fields it was not
changing; those ran unscoped against `subscriptions`, whose policy is the
owner's, returned NULL, and the upsert took its INSERT branch. The not-null
constraint on `tier` turned it into a loud error instead of a silent
downgrade. Migration 0046 makes NULL mean "leave it as it is", so a partial
update needs no read.

Both are the same failure this codebase keeps producing: a query that is
correct as SQL and wrong about who is asking. The lint rule proposed at the end
of M3 — every `db.query` must either call a SECURITY DEFINER function or carry
an explicit `// system:` comment — would have caught both at review time, and
is now overdue.
