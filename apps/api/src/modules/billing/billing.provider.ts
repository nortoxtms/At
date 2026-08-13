/**
 * Billing abstraction — spec §16, and the fifth seam in this codebase after
 * identity, storage, push, search and messaging.
 *
 * Stripe is the payment processor (§4) and `StripeBillingProvider` is the
 * production implementation. The seam exists for a reason specific to money:
 * §16.2 describes a flow — checkout session, redirect, webhook, effect — where
 * the interesting logic is entirely in what happens *after* the webhook, and
 * none of it can be exercised through a real Stripe account in a test. With
 * the seam, every §24.10 idempotency case and every §24.11 downgrade case runs
 * against the same handler production uses.
 *
 * What the local provider does NOT do is pretend to take money. It issues
 * session ids and signs webhook payloads; §16.3 (no transaction fees, no
 * escrow, no held funds) means there is nothing else to simulate.
 */

export interface CheckoutSessionInput {
  profileId: string;
  product: string;
  /** Stripe price id, resolved from §6's env by the caller. */
  priceId: string | undefined;
  amountEur: number;
  mode: 'payment' | 'subscription';
  targetId?: string;
  customerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

export interface PortalSessionInput {
  customerId: string;
  returnUrl: string;
}

export interface IdentitySessionInput {
  profileId: string;
  returnUrl: string;
}

/** The subset of §16.2's event types this application acts on. */
export type BillingEventType =
  | 'checkout.session.completed'
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'invoice.payment_failed'
  | 'identity.verification_session.verified'
  | 'identity.verification_session.requires_input';

export interface BillingEvent {
  id: string;
  type: BillingEventType | string;
  /** Normalized so the handler never reads a Stripe object shape directly. */
  data: {
    profileId?: string;
    product?: string;
    targetId?: string;
    customerId?: string;
    subscriptionId?: string;
    sessionId?: string;
    paymentIntentId?: string;
    amountEur?: number;
    tier?: string;
    status?: string;
    currentPeriodEnd?: string;
    cancelAtPeriodEnd?: boolean;
  };
  raw: unknown;
}

export interface BillingProvider {
  readonly name: string;

  createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSession>;

  createPortalSession(input: PortalSessionInput): Promise<{ url: string }>;

  /** §12 POST /verification/identity/start — Stripe Identity, not Checkout. */
  createIdentitySession(input: IdentitySessionInput): Promise<{ id: string; url: string }>;

  /**
   * Verifies the signature over the raw body and returns the normalized event.
   * Throws when the signature does not match — an unverified webhook is an
   * anonymous request that can grant subscriptions.
   */
  constructEvent(rawBody: Buffer, signature: string | undefined): BillingEvent;
}

export const BILLING_PROVIDER = Symbol('BILLING_PROVIDER');
