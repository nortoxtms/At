/**
 * Order payments — the sixth seam in this codebase, after identity, storage,
 * push, search, messaging and billing.
 *
 * Not the same thing as `BillingProvider`. That one takes the platform's own
 * money: subscriptions, boosts, job posts, all of it flowing from a user to
 * ONLY HORSES. This one moves a buyer's money to a seller for a saddle, which
 * is a different regulatory animal — a marketplace payout needs the seller
 * onboarded and identified with the processor, and in Türkiye that means a
 * licensed payment institution or a marketplace agreement with one.
 *
 * The seam exists because that agreement does not exist yet, and writing the
 * integration blind is how this repository already ended up with two adapters
 * that have never executed (ADR-0005, ADR-0007). What *can* be built and run
 * today is everything around the payment: the order lifecycle, the stock
 * arithmetic, the idempotent capture, the refund that puts a unit back. So the
 * local provider stands in for the processor and every one of those runs for
 * real against a real database.
 *
 * What `LocalPaymentProvider` does NOT do is pretend to move money. It
 * authorises instantly and hands back a reference. Nothing in it should ever
 * be read as evidence that a card would clear.
 */

export interface PaymentIntentInput {
  orderId: string;
  reference: string;
  buyerProfileId: string;
  sellerProfileId: string;
  amount: number;
  currency: string;
  /** Where the processor sends the buyer back to once they are done. */
  returnUrl: string;
}

export interface PaymentIntent {
  /** The processor's id for this attempt. */
  id: string;
  /**
   * Where to send the buyer.
   *
   * `null` means the provider settled without a redirect — which is what the
   * local one does, and what a saved-card charge would also do. A client that
   * assumes a URL is always present breaks on both.
   */
  redirectUrl: string | null;
  status: 'requires_action' | 'succeeded' | 'failed';
}

export interface PaymentResult {
  status: 'succeeded' | 'failed';
  reference: string;
  failureMessage?: string;
}

export interface RefundInput {
  reference: string;
  amount: number;
  currency: string;
  reason?: string;
}

export interface PaymentProvider {
  readonly name: string;
  createIntent(input: PaymentIntentInput): Promise<PaymentIntent>;
  /**
   * Confirm an attempt.
   *
   * Separate from `createIntent` because a real processor answers twice — once
   * to the browser and once to a webhook — and the second answer is the one
   * that decides. The service treats this as the authority either way, so the
   * flow is the same whether the provider redirects or not.
   */
  confirm(intentId: string): Promise<PaymentResult>;
  refund(input: RefundInput): Promise<PaymentResult>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
