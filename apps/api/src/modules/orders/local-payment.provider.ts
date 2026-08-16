import { createHmac } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type {
  PaymentIntent,
  PaymentIntentInput,
  PaymentProvider,
  PaymentResult,
  RefundInput,
} from './payment.provider.js';

/**
 * The development and demo payment provider.
 *
 * It authorises immediately and returns a reference derived from the order, so
 * every screen after the payment step — confirmation, the buyer's orders, the
 * seller's incoming orders, the refund — runs against real rows for real.
 *
 * The reference is an HMAC of the order id rather than a random string, for
 * one practical reason: replaying a capture must land on the same reference,
 * so the idempotency in `pay_product_order` is exercised by the same input a
 * webhook redelivery would carry. A random reference would make every replay
 * look like a new attempt and quietly hide the bug the idempotency exists for.
 *
 * It is selected whenever no processor is configured, and it says so on the
 * screen: the payment step in both clients is labelled as a simulation. A
 * demo that looks like it took a card is a demo that gets shown to somebody
 * who then expects money to have moved.
 */
@Injectable()
export class LocalPaymentProvider implements PaymentProvider {
  readonly name = 'local';

  private readonly secret =
    process.env.PAYMENT_LOCAL_SECRET ?? 'only-horses-local-payments';

  private reference(orderId: string): string {
    return `local_${createHmac('sha256', this.secret).update(orderId).digest('hex').slice(0, 24)}`;
  }

  async createIntent(input: PaymentIntentInput): Promise<PaymentIntent> {
    return {
      // Derived from the order, not random. Confirming the same order twice
      // has to produce the same reference, or a replayed capture looks like a
      // fresh attempt and the idempotency in `pay_product_order` is never the
      // thing under test.
      id: `pi_local_${input.orderId}`,
      // No redirect: there is no hosted page to send anyone to, and inventing
      // a URL that 404s is worse than admitting there is none.
      redirectUrl: null,
      status: 'succeeded',
    };
  }

  async confirm(intentId: string): Promise<PaymentResult> {
    return { status: 'succeeded', reference: this.reference(intentId) };
  }

  async refund(input: RefundInput): Promise<PaymentResult> {
    return { status: 'succeeded', reference: `${input.reference}_refund` };
  }
}
