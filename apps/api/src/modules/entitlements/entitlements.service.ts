import { Injectable } from '@nestjs/common';
import {
  type CapabilityLimits,
  meetsVerification,
  resolveLimits,
  type SubscriptionTier,
  UNLIMITED,
  type VerificationLevel,
} from '@only-horses/shared-types';

import { ApiException } from '../../common/filters/api-exception.filter.js';
import { DatabaseService } from '../../database/database.service.js';

/**
 * Entitlement checks — spec §3.3, §24.9.
 *
 * §4 is explicit that business rules must not be bypassable by a client, and
 * §24.2 requires that publishing without identity verification is impossible
 * "from every client (mobile, web, direct API call)". So the limits are read
 * from the database here and enforced before any write, regardless of what
 * the client believed.
 *
 * The limit *table* lives in shared-types so the UI can predict the answer
 * and explain the block before the user taps. This service is what decides.
 */

export interface Entitlements {
  tier: SubscriptionTier;
  verificationLevel: VerificationLevel;
  limits: CapabilityLimits;
  usage: {
    horses: number;
    activeSaleListings: number;
    activeServiceListings: number;
    messagesToday: number;
    /** §16.1: Business tier includes 5 job posts a month; everyone else pays. */
    jobPostsThisMonth: number;
  };
}

@Injectable()
export class EntitlementsService {
  constructor(private readonly db: DatabaseService) {}

  async forProfile(profileId: string): Promise<Entitlements> {
    // Scoped to the caller: the horse and listing counts read tables that RLS
    // hides from an anonymous connection, and an unscoped query would report
    // zero — quietly granting an unlimited allowance.
    const rows = await this.db.queryAs<{
      verification_level: VerificationLevel;
      tier: SubscriptionTier | null;
      horse_count: string;
      active_sale_listings: string;
      active_service_listings: string;
      messages_today: string;
      job_posts_this_month: string;
    }>(
      profileId,
      `SELECT
         p.verification_level,
         s.tier,
         (SELECT count(*) FROM horses h
           WHERE h.owner_profile_id = p.id AND h.deleted_at IS NULL) AS horse_count,
         (SELECT count(*) FROM listings l
           WHERE l.seller_profile_id = p.id
             AND l.status IN ('active','pending_review','under_offer')) AS active_sale_listings,
         (SELECT count(*) FROM service_listings sl
           WHERE sl.provider_profile_id = p.id AND sl.status = 'active') AS active_service_listings,
         (SELECT count(*) FROM conversations c
           WHERE c.created_by = p.id AND c.created_at > now() - INTERVAL '1 day') AS messages_today,
         -- Calendar month, not a rolling 30 days: §16.1 says "5 job posts/mo",
         -- and a Business subscriber whose allowance resets on a date they
         -- cannot see would read as a broken allowance.
         (SELECT count(*) FROM job_listings j
           WHERE j.poster_profile_id = p.id
             AND j.published_at >= date_trunc('month', now())) AS job_posts_this_month
       FROM profiles p
       LEFT JOIN subscriptions s
         ON s.profile_id = p.id AND s.status IN ('active','trialing')
       WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [profileId],
    );

    const row = rows[0];
    if (!row) throw ApiException.notFound('Profil');

    const tier = row.tier ?? 'free';

    return {
      tier,
      verificationLevel: row.verification_level,
      limits: resolveLimits(tier, row.verification_level),
      usage: {
        horses: Number(row.horse_count),
        activeSaleListings: Number(row.active_sale_listings),
        activeServiceListings: Number(row.active_service_listings),
        messagesToday: Number(row.messages_today),
        jobPostsThisMonth: Number(row.job_posts_this_month),
      },
    };
  }

  /**
   * §3.3's hard rule. Raised as VERIFICATION_REQUIRED rather than FORBIDDEN so
   * the client can route to the verification ladder (§18.2 S26) instead of
   * showing a dead end — the user is not forbidden, they are one step short.
   */
  async requireVerification(
    profileId: string,
    required: VerificationLevel,
    action: string,
  ): Promise<Entitlements> {
    const entitlements = await this.forProfile(profileId);

    if (!meetsVerification(entitlements.verificationLevel, required)) {
      throw ApiException.verificationRequired(
        `${action} için kimliğini doğrulaman gerekiyor.`,
        { required, current: entitlements.verificationLevel },
      );
    }

    return entitlements;
  }

  /**
   * Raised as LIMIT_EXCEEDED with the numbers attached, so the paywall
   * (§18.2 S27) can render its context-aware header — "4. ilanını yayınlamak
   * için Pro'ya geç" — rather than a generic upsell.
   */
  assertUnderLimit(
    entitlements: Entitlements,
    kind: 'horses' | 'activeSaleListings' | 'activeServiceListings',
    messageTr: string,
  ): void {
    const limit = {
      horses: entitlements.limits.maxHorses,
      activeSaleListings: entitlements.limits.maxActiveSaleListings,
      activeServiceListings: entitlements.limits.maxActiveServiceListings,
    }[kind];

    if (limit === UNLIMITED) return;

    const used = entitlements.usage[kind];
    if (used >= limit) {
      throw ApiException.limitExceeded(messageTr, {
        kind,
        used,
        limit,
        tier: entitlements.tier,
      });
    }
  }
}
