import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  boostEstimate,
  type BoostEstimate,
  type CheckoutInput,
  PLAN_FEATURES,
  planOptions,
  PRODUCTS,
  type PurchasableProduct,
  selectListingsToPause,
  SUBSCRIPTION_PRODUCTS,
  type SubscriptionTier,
  type SubscriptionView,
  tierForProduct,
} from '@only-horses/shared-types';

import { ApiException } from '../../common/filters/api-exception.filter.js';
import type { Env } from '../../config/env.js';
import { DatabaseService } from '../../database/database.service.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { BILLING_PROVIDER, type BillingEvent, type BillingProvider } from './billing.provider.js';

/**
 * Monetization — spec §16, §24.10, §24.11.
 *
 * The rule that shapes this file: **nothing is granted by a client call.**
 * `checkout` creates a session and returns a URL; it changes no entitlement.
 * Every effect — a tier, a boost, a consumed job post — is applied by
 * `handleEvent` when the webhook arrives, because that is the only message
 * that says money actually moved (§16.2).
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<Env, true>,
    private readonly entitlements: EntitlementsService,
    private readonly notifications: NotificationsService,
    @Inject(BILLING_PROVIDER) private readonly billing: BillingProvider,
  ) {}

  /** §12 GET /billing/plans. */
  plans() {
    return { plans: planOptions(), features: PLAN_FEATURES, products: PRODUCTS };
  }

  /** §12 GET /me/subscription. */
  async mine(profileId: string): Promise<SubscriptionView> {
    const rows = await this.db.queryAs<{
      tier: SubscriptionTier;
      status: string;
      current_period_end: string | null;
      cancel_at_period_end: boolean;
      stripe_customer_id: string | null;
    }>(
      profileId,
      `SELECT tier, status, current_period_end, cancel_at_period_end, stripe_customer_id
       FROM subscriptions WHERE profile_id = $1`,
      [profileId],
    );

    const subscription = rows[0];

    // No row is the free plan, not an error: §16.1 lists Free as a product.
    return {
      tier: subscription?.tier ?? 'free',
      status: subscription?.status ?? 'active',
      currentPeriodEnd: subscription?.current_period_end ?? null,
      cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
      stripeCustomerId: subscription?.stripe_customer_id ?? null,
    };
  }

  /** §12 POST /billing/checkout {product, targetId?}. */
  async checkout(profileId: string, input: CheckoutInput): Promise<{ url: string; sessionId: string }> {
    const product = PRODUCTS[input.product];
    if (!product) throw ApiException.validation('Geçersiz ürün.');

    if (input.product === 'boost_7d' || input.product === 'boost_30d') {
      await this.assertCanBoost(profileId, input.targetId!);
    }

    const subscription = await this.mine(profileId);
    const mode = SUBSCRIPTION_PRODUCTS.includes(input.product) ? 'subscription' : 'payment';

    const session = await this.billing.createCheckoutSession({
      profileId,
      product: input.product,
      priceId: process.env[product.stripePriceEnvVar],
      amountEur: product.amountEur,
      mode,
      targetId: input.targetId,
      customerId: subscription.stripeCustomerId,
      successUrl: `${this.config.get('APP_URL', { infer: true })}/billing/return?status=success`,
      cancelUrl: `${this.config.get('APP_URL', { infer: true })}/billing/return?status=cancelled`,
    });

    // One-off products only. §7's `purchases_product_check` lists exactly the
    // four §16.1 one-offs, and that is the right shape: a subscription is not
    // a purchase, it is a state — `subscriptions` holds it, and the webhook
    // writes it. Recorded as pending so an abandoned checkout is visible in
    // support rather than invisible until it succeeds.
    if (mode === 'payment') {
      await this.db.query(`SELECT record_purchase($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
        profileId,
        input.product,
        targetTypeFor(input.product),
        input.targetId ?? null,
        product.amountEur,
        'EUR',
        session.id,
        null,
        'pending',
      ]);
    }

    this.logger.log(`Checkout ${session.id} for ${input.product} by ${profileId}`);
    return { url: session.url, sessionId: session.id };
  }

  /** §12 POST /billing/portal — cancellation and card changes live at Stripe. */
  async portal(profileId: string): Promise<{ url: string }> {
    const subscription = await this.mine(profileId);

    if (!subscription.stripeCustomerId) {
      throw ApiException.validation('Henüz bir aboneliğin yok.');
    }

    return this.billing.createPortalSession({
      customerId: subscription.stripeCustomerId,
      returnUrl: `${this.config.get('APP_URL', { infer: true })}/ayarlar/abonelik`,
    });
  }

  /** §12 POST /verification/identity/start. */
  async startIdentity(profileId: string): Promise<{ id: string; url: string }> {
    return this.billing.createIdentitySession({
      profileId,
      returnUrl: `${this.config.get('APP_URL', { infer: true })}/dogrulama`,
    });
  }

  /** §18.2 S28's "expected extra views", labelled as an estimate. */
  async boostEstimate(days: number): Promise<BoostEstimate> {
    const rows = await this.db.query<{ median_views: string | null; sample_size: string }>(
      `SELECT * FROM boost_view_median($1)`,
      [days],
    );

    return boostEstimate(
      days,
      rows[0]?.median_views === null || rows[0]?.median_views === undefined
        ? null
        : Math.round(Number(rows[0].median_views)),
      Number(rows[0]?.sample_size ?? 0),
    );
  }

  /**
   * §24.10: "Every Stripe webhook is idempotent (replay the same event 3× →
   * one effect)."
   *
   * The ledger row is written *before* the effect and checked for
   * `processed_at`. Both halves matter: writing first means a crash mid-effect
   * leaves a record to retry from, and checking `processed_at` rather than mere
   * existence means Stripe's redelivery of a *failed* event still runs, while a
   * redelivery of a succeeded one does not.
   */
  async handleEvent(event: BillingEvent): Promise<{ handled: boolean; duplicate: boolean }> {
    const claimed = await this.db.query<{ processed_at: string | null }>(
      `INSERT INTO stripe_events (id, type, payload)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type
       RETURNING processed_at`,
      [event.id, event.type, JSON.stringify(event.raw ?? event)],
    );

    if (claimed[0]?.processed_at) {
      this.logger.log(`Ignoring replayed ${event.type} (${event.id})`);
      return { handled: false, duplicate: true };
    }

    try {
      const handled = await this.applyEvent(event);

      await this.db.query(
        `UPDATE stripe_events SET processed_at = now(), error = NULL WHERE id = $1`,
        [event.id],
      );

      return { handled, duplicate: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Left unprocessed on purpose: Stripe retries a non-2xx delivery, and
      // the next attempt must be allowed to run.
      await this.db.query(`UPDATE stripe_events SET error = $2 WHERE id = $1`, [
        event.id,
        message,
      ]);

      this.logger.error(`Webhook ${event.type} (${event.id}) failed: ${message}`);
      throw error;
    }
  }

  private async applyEvent(event: BillingEvent): Promise<boolean> {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(event);
        return true;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.onSubscriptionChanged(event);
        return true;

      case 'invoice.payment_failed':
        await this.onPaymentFailed(event);
        return true;

      case 'identity.verification_session.verified':
      case 'identity.verification_session.requires_input':
        await this.onIdentityDecided(event);
        return true;

      default:
        this.logger.debug(`No handler for ${event.type}`);
        return false;
    }
  }

  /** §16.2 step 4, plus the one-off products. */
  private async onCheckoutCompleted(event: BillingEvent): Promise<void> {
    const { profileId, product, targetId, sessionId, paymentIntentId, amountEur } = event.data;
    if (!profileId || !product) throw new Error('checkout.session.completed without attribution');

    const definition = PRODUCTS[product];

    // Subscriptions arrive as their own events (`customer.subscription.*`) and
    // have no `purchases` row to mark paid — §7 reserves that table for the
    // §16.1 one-offs.
    if (!SUBSCRIPTION_PRODUCTS.includes(product as PurchasableProduct)) {
      await this.db.query(`SELECT record_purchase($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
        profileId,
        product,
        targetTypeFor(product as PurchasableProduct),
        targetId ?? null,
        amountEur ?? definition?.amountEur ?? 0,
        'EUR',
        sessionId ?? `local_${event.id}`,
        paymentIntentId ?? null,
        'paid',
      ]);
    }

    if ((product === 'boost_7d' || product === 'boost_30d') && targetId) {
      const days = definition?.durationDays ?? 7;

      // Applying the boost re-enqueues the listing through the §11.4 outbox,
      // so the ranking effect appears on the next drain without this method
      // knowing anything about the index.
      const rows = await this.db.query<{ apply_boost: string | null }>(
        `SELECT apply_boost($1, $2)`,
        [targetId, days],
      );

      await this.notifications.dispatch({
        profileId,
        type: 'purchase.completed',
        title: 'İlanın öne çıkarıldı',
        body: `${days} gün boyunca arama sonuçlarında üstte görünecek.`,
        data: { listingId: targetId, boostExpiresAt: rows[0]?.apply_boost ?? null },
        channels: ['push', 'in_app'],
        dedupeKey: `boost_applied:${sessionId ?? event.id}`,
      });

      this.logger.log(`Boost applied to ${targetId} for ${days} days`);
    }

    // job_post is deliberately not applied here: §3.3 makes it a credit the
    // poster spends when they publish, and `JobsService.publish` consumes it
    // (migration 0041). Applying it at payment time would burn the credit on a
    // job that has not passed §26's legality checks yet.
  }

  /**
   * §24.11's downgrade, and the reason this handler is not a one-liner.
   *
   * "Downgrading from Pro to Free with 8 active listings pauses the newest 5
   * and notifies the user; it never silently deletes content."
   */
  private async onSubscriptionChanged(event: BillingEvent): Promise<void> {
    const { profileId, product, customerId, subscriptionId, status, currentPeriodEnd } = event.data;
    if (!profileId) throw new Error('subscription event without a profile');

    const cancelled = event.type === 'customer.subscription.deleted' || status === 'canceled';
    const tier: SubscriptionTier = cancelled
      ? 'free'
      : (event.data.tier as SubscriptionTier) ??
        tierForProduct(product as PurchasableProduct) ??
        'free';

    const rows = await this.db.query<{ apply_subscription_change: SubscriptionTier }>(
      `SELECT apply_subscription_change($1, $2::subscription_tier, $3::subscription_status, $4::timestamptz, $5, $6, $7)`,
      [
        profileId,
        tier,
        cancelled ? 'canceled' : (status ?? 'active'),
        currentPeriodEnd ?? null,
        event.data.cancelAtPeriodEnd ?? false,
        customerId ?? null,
        subscriptionId ?? null,
      ],
    );

    const previous = rows[0]?.apply_subscription_change ?? 'free';
    await this.enforceLimitsAfterChange(profileId, previous, tier);

    this.logger.log(`Subscription for ${profileId}: ${previous} → ${tier} (${event.type})`);
  }

  /**
   * Server-side limit enforcement after a tier change (§24.9, §24.11).
   *
   * Runs on every change rather than only on downgrades, because "did the
   * allowance shrink" is a question about numbers, not about tier names — a
   * Business subscriber whose payment lapsed to `past_due` loses the same
   * allowance a cancelling Pro subscriber does.
   */
  private async enforceLimitsAfterChange(
    profileId: string,
    previous: SubscriptionTier,
    next: SubscriptionTier,
  ): Promise<void> {
    const entitlements = await this.entitlements.forProfile(profileId);
    const limit = entitlements.limits.maxActiveSaleListings;

    // system: the webhook has no session, and `listings_select` is the
    // seller's. Two columns through a SECURITY DEFINER function (0044).
    const active = await this.db.query<{ id: string; published_at: string | null }>(
      `SELECT * FROM active_listings_of($1)`,
      [profileId],
    );

    const toPause = selectListingsToPause(
      active.map((row) => ({ id: row.id, publishedAt: row.published_at })),
      limit,
    );

    if (toPause.length === 0) return;

    const paused = await this.db.query<{ id: string; title: string }>(
      `SELECT * FROM pause_listings($1::uuid[])`,
      [toPause.map((listing) => listing.id)],
    );

    if (paused.length === 0) return;

    // §24.11: "it never silently deletes content" — so the notification names
    // the count, says they are paused rather than gone, and says what brings
    // them back.
    await this.notifications.dispatch({
      profileId,
      type: 'subscription.downgraded',
      title: `${paused.length} ilanın duraklatıldı`,
      body:
        `${previous} planından ${next} planına geçtiğin için en yeni ${paused.length} ilanın ` +
        'duraklatıldı. İlanlar silinmedi — planını yükseltirsen tek dokunuşla geri açılır.',
      data: {
        pausedListingIds: paused.map((listing) => listing.id),
        pausedTitles: paused.map((listing) => listing.title),
        previousTier: previous,
        tier: next,
      },
      channels: ['push', 'email', 'in_app'],
    });

    this.logger.log(`Paused ${paused.length} listing(s) for ${profileId} after ${previous} → ${next}`);
  }

  /** §17 `subscription.payment_failed`, email only per the table. */
  private async onPaymentFailed(event: BillingEvent): Promise<void> {
    const profileId = event.data.profileId ?? (await this.profileForCustomer(event.data.customerId));
    if (!profileId) return;

    // Only the status changes. NULL means "leave it" (migration 0046) — the
    // earlier version passed subselects for the untouched fields, which ran
    // unscoped against a policy-protected table, read NULL, and downgraded a
    // paying customer to free on a failed-payment notice.
    await this.db.query(
      `SELECT apply_subscription_change($1, NULL, 'past_due'::subscription_status, NULL, NULL, $2, NULL)`,
      [profileId, event.data.customerId ?? null],
    );

    await this.notifications.dispatch({
      profileId,
      type: 'subscription.payment_failed',
      title: 'Ödeme alınamadı',
      body: 'Aboneliğinin ödemesi alınamadı. Kart bilgilerini güncellemezsen planın düşecek.',
      data: { amountEur: event.data.amountEur ?? null },
      channels: ['email'],
      dedupeKey: `payment_failed:${event.id}`,
    });
  }

  /**
   * §14.1: identity is decided by Stripe Identity, never by a client call.
   *
   * The level is raised through the same `verifications` row every other rung
   * uses, so §14.1's "a level is only ever raised by an approved verification"
   * stays literally true.
   */
  private async onIdentityDecided(event: BillingEvent): Promise<void> {
    const profileId = event.data.profileId;
    if (!profileId) throw new Error('identity event without a profile');

    const approved = event.type === 'identity.verification_session.verified';

    await this.db.query(`SELECT decide_identity_verification($1, $2, $3)`, [
      profileId,
      approved,
      event.data.sessionId ?? null,
    ]);

    await this.notifications.dispatch({
      profileId,
      type: 'verification.decided',
      title: approved ? 'Kimliğin doğrulandı' : 'Kimlik doğrulaması tamamlanamadı',
      body: approved
        ? 'Artık ilan yayınlayabilir, satıcı iletişim bilgilerini görebilirsin.'
        : 'Belgen okunamadı. Doğrulamayı tekrar deneyebilirsin.',
      data: { kind: 'identity', approved },
      channels: ['push', 'email'],
      dedupeKey: `identity:${event.id}`,
    });
  }

  private async profileForCustomer(customerId: string | undefined): Promise<string | null> {
    if (!customerId) return null;

    const rows = await this.db.query<{ profile_id: string | null }>(
      // system: the customer id is Stripe's handle for a user who is not
      // making this request. `subscriptions_select` is theirs, not ours.
      `SELECT profile_id_for_stripe_customer($1) AS profile_id`,
      [customerId],
    );

    return rows[0]?.profile_id ?? null;
  }

  /** §3.3: boosting requires identity verification, and owning the listing. */
  private async assertCanBoost(profileId: string, listingId: string): Promise<void> {
    await this.entitlements.requireVerification(profileId, 'identity_verified', 'İlan öne çıkarmak');

    const rows = await this.db.queryAs<{ id: string; status: string }>(
      profileId,
      `SELECT id, status FROM listings WHERE id = $1 AND seller_profile_id = $2`,
      [listingId, profileId],
    );

    const listing = rows[0];
    if (!listing) throw ApiException.notFound('İlan');

    // Paying to boost a paused or draft listing buys nothing: §11.2 only ranks
    // what is in the index.
    if (!['active', 'under_offer'].includes(listing.status)) {
      throw ApiException.validation('Yalnızca yayındaki ilanlar öne çıkarılabilir.');
    }
  }
}

function targetTypeFor(product: PurchasableProduct): string {
  if (product === 'boost_7d' || product === 'boost_30d') return 'listing';
  if (product === 'job_post') return 'job';
  return 'profile';
}
