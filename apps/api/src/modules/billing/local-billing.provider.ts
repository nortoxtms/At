import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import type {
  BillingEvent,
  BillingProvider,
  CheckoutSession,
  CheckoutSessionInput,
  IdentitySessionInput,
  PortalSessionInput,
} from './billing.provider.js';

/**
 * Development and test billing provider.
 *
 * It does not take money and does not pretend to. What it reproduces is the
 * *shape* of §16.2: a checkout session with an id and a URL, and a signed
 * webhook that arrives later carrying `{profileId, product, targetId}`. That
 * is enough to run every case §24.10 and §24.11 care about — replayed events,
 * failed payments, downgrades with active listings — none of which can be
 * driven through a real Stripe account in a test.
 *
 * The signature is a real HMAC over the raw body, not a stub: the webhook
 * route's verification path is the same one production uses, so a mistake
 * there fails locally instead of in production.
 *
 * Refused in production (`BillingModule`), where a payment provider that
 * charges nobody would silently give away every subscription.
 */
@Injectable()
export class LocalBillingProvider implements BillingProvider {
  readonly name = 'local';
  private readonly logger = new Logger(LocalBillingProvider.name);

  constructor(
    private readonly signingSecret: string,
    private readonly appUrl: string,
  ) {
    this.logger.warn('Using the local billing provider. Stripe is production (§4).');
  }

  async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSession> {
    const id = `cs_local_${randomUUID().replace(/-/g, '')}`;

    // The URL points at a local page that posts the webhook this session would
    // have produced, so the developer flow matches the production flow:
    // redirect, come back, and find the effect applied by the webhook rather
    // than by the redirect.
    const url = new URL(`${this.appUrl}/dev/checkout`);
    url.searchParams.set('session', id);
    url.searchParams.set('product', input.product);
    url.searchParams.set('profile', input.profileId);
    if (input.targetId) url.searchParams.set('target', input.targetId);

    this.logger.log(`Local checkout ${id} for ${input.product} (${input.amountEur} €)`);
    return { id, url: url.toString() };
  }

  async createPortalSession(input: PortalSessionInput): Promise<{ url: string }> {
    return { url: `${this.appUrl}/dev/portal?customer=${encodeURIComponent(input.customerId)}` };
  }

  async createIdentitySession(input: IdentitySessionInput): Promise<{ id: string; url: string }> {
    const id = `vs_local_${randomUUID().replace(/-/g, '')}`;
    return { id, url: `${this.appUrl}/dev/identity?session=${id}&profile=${input.profileId}` };
  }

  constructEvent(rawBody: Buffer, signature: string | undefined): BillingEvent {
    if (!signature) throw new Error('Missing webhook signature');

    const expected = this.sign(rawBody);
    const provided = Buffer.from(signature);

    if (
      provided.length !== expected.length ||
      !timingSafeEqual(provided, Buffer.from(expected))
    ) {
      throw new Error('Invalid webhook signature');
    }

    const parsed = JSON.parse(rawBody.toString('utf8')) as {
      id?: string;
      type: string;
      data?: BillingEvent['data'];
    };

    return {
      // An event with no id of its own still needs one: §24.10's idempotency
      // key is the event id, and a null key would make every replay unique.
      id: parsed.id ?? `evt_local_${randomUUID().replace(/-/g, '')}`,
      type: parsed.type,
      data: parsed.data ?? {},
      raw: parsed,
    };
  }

  /** Exposed so tests and the dev checkout page can produce valid signatures. */
  sign(rawBody: Buffer): string {
    return createHmac('sha256', this.signingSecret).update(rawBody).digest('hex');
  }
}
