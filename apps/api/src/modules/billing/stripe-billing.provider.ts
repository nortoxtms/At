import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';

import type {
  BillingEvent,
  BillingProvider,
  CheckoutSession,
  CheckoutSessionInput,
  IdentitySessionInput,
  PortalSessionInput,
} from './billing.provider.js';

/**
 * Stripe — the production payment processor (spec §4, §16).
 *
 * §16.2 fixes two details that matter more than they look:
 *
 *   · `client_reference_id = profile_id`, so a completed session can be
 *     attributed without trusting anything the browser sent back;
 *   · `metadata {product, targetId}`, so the webhook knows what was bought
 *     without re-deriving it from a price id.
 *
 * Never run in this environment — see ADR-0007. The event normalization below
 * is written against Stripe's documented shapes and has not answered a real
 * webhook.
 */
@Injectable()
export class StripeBillingProvider implements BillingProvider {
  readonly name = 'stripe';
  private readonly logger = new Logger(StripeBillingProvider.name);
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string,
    private readonly identityWebhookSecret: string | undefined,
  ) {
    this.stripe = new Stripe(secretKey, { apiVersion: '2026-07-29.dahlia' });
  }

  async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSession> {
    if (!input.priceId) {
      // §16.1: prices are configuration. A missing price id is a deployment
      // error, and creating an ad-hoc price here would silently charge an
      // amount nobody configured.
      throw new Error(`No Stripe price configured for product ${input.product}`);
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: input.mode,
      line_items: [{ price: input.priceId, quantity: 1 }],
      client_reference_id: input.profileId,
      customer: input.customerId ?? undefined,
      metadata: { product: input.product, targetId: input.targetId ?? '' },
      // Carried on the subscription too: `customer.subscription.updated`
      // arrives without the session that created it.
      subscription_data:
        input.mode === 'subscription'
          ? { metadata: { profileId: input.profileId, product: input.product } }
          : undefined,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });

    return { id: session.id, url: session.url ?? input.successUrl };
  }

  async createPortalSession(input: PortalSessionInput): Promise<{ url: string }> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
    });

    return { url: session.url };
  }

  async createIdentitySession(input: IdentitySessionInput): Promise<{ id: string; url: string }> {
    const session = await this.stripe.identity.verificationSessions.create({
      type: 'document',
      metadata: { profileId: input.profileId },
      return_url: input.returnUrl,
    });

    return { id: session.id, url: session.url ?? input.returnUrl };
  }

  constructEvent(rawBody: Buffer, signature: string | undefined): BillingEvent {
    if (!signature) throw new Error('Missing Stripe signature');

    // Identity events are delivered to the same endpoint from a different
    // webhook, so both secrets are tried before giving up.
    const event = this.verify(rawBody, signature);
    return this.normalize(event);
  }

  private verify(rawBody: Buffer, signature: string): Stripe.Event {
    try {
      return this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch (error) {
      if (!this.identityWebhookSecret) throw error;
      return this.stripe.webhooks.constructEvent(rawBody, signature, this.identityWebhookSecret);
    }
  }

  /**
   * Flattens Stripe's object graph into the shape the handler works with.
   *
   * Doing it here rather than in the service is what keeps the seam honest:
   * `BillingService` never sees a `Stripe.Subscription`, so the local provider
   * can produce the same events without imitating Stripe's types.
   */
  private normalize(event: Stripe.Event): BillingEvent {
    const base = { id: event.id, type: event.type, raw: event };

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        return {
          ...base,
          data: {
            profileId: session.client_reference_id ?? undefined,
            product: session.metadata?.product,
            targetId: session.metadata?.targetId || undefined,
            customerId: typeof session.customer === 'string' ? session.customer : undefined,
            subscriptionId:
              typeof session.subscription === 'string' ? session.subscription : undefined,
            sessionId: session.id,
            paymentIntentId:
              typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
            amountEur: session.amount_total === null ? undefined : session.amount_total / 100,
          },
        };
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const item = subscription.items.data[0];

        return {
          ...base,
          data: {
            profileId: subscription.metadata?.profileId,
            product: subscription.metadata?.product,
            customerId:
              typeof subscription.customer === 'string' ? subscription.customer : undefined,
            subscriptionId: subscription.id,
            status: subscription.status,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            currentPeriodEnd: item?.current_period_end
              ? new Date(item.current_period_end * 1000).toISOString()
              : undefined,
          },
        };
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        return {
          ...base,
          data: {
            customerId: typeof invoice.customer === 'string' ? invoice.customer : undefined,
            amountEur: invoice.amount_due / 100,
          },
        };
      }

      case 'identity.verification_session.verified':
      case 'identity.verification_session.requires_input': {
        const session = event.data.object as Stripe.Identity.VerificationSession;
        return { ...base, data: { profileId: session.metadata?.profileId, sessionId: session.id } };
      }

      default:
        this.logger.debug(`Ignoring ${event.type}`);
        return { ...base, data: {} };
    }
  }
}
