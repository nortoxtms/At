import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { checkoutSchema } from '@only-horses/shared-types';
import type { z } from 'zod';

import { CurrentProfileId, Public } from '../../common/guards/auth.guard.js';
import { RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { BillingService } from './billing.service.js';

/** Spec §12 "Verification & billing". */
@Controller()
@UseGuards(RateLimitGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Public: §18.2 S27 and the web pricing page both render before login. */
  @Get('billing/plans')
  @Public()
  plans() {
    return { data: this.billing.plans() };
  }

  @Get('me/subscription')
  async mine(@CurrentProfileId() profileId: string) {
    return { data: await this.billing.mine(profileId) };
  }

  /**
   * §16.2 step 1. Returns a URL and grants nothing — every entitlement is
   * applied by the webhook, because that is the only message that means the
   * money moved.
   */
  @Post('billing/checkout')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 30, windowSeconds: 3600, per: 'profile' })
  async checkout(
    @CurrentProfileId() profileId: string,
    @Body(zodBody(checkoutSchema)) body: z.infer<typeof checkoutSchema>,
  ) {
    return { data: await this.billing.checkout(profileId, body) };
  }

  @Post('billing/portal')
  @HttpCode(HttpStatus.OK)
  async portal(@CurrentProfileId() profileId: string) {
    return { data: await this.billing.portal(profileId) };
  }

  /** §18.2 S28's before/after illustration needs a number to show. */
  @Get('billing/boost-estimate')
  async boostEstimate(@Query('days') days = '7') {
    return { data: await this.billing.boostEstimate(Number(days)) };
  }

  /**
   * §12 POST /verification/identity/start.
   *
   * Lives on the billing controller because Stripe Identity is the same
   * vendor seam as Checkout (§16.2 handles both webhooks), not because
   * identity is a billing concern.
   */
  @Post('verification/identity/start')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 5, windowSeconds: 3600, per: 'profile' })
  async startIdentity(@CurrentProfileId() profileId: string) {
    return { data: await this.billing.startIdentity(profileId) };
  }

  /** §18.2 S28 — a boost is bought against one listing. */
  @Post('listings/:id/boost')
  @HttpCode(HttpStatus.OK)
  async boost(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(checkoutSchema.innerType().pick({ product: true }))) body: { product: string },
  ) {
    return {
      data: await this.billing.checkout(profileId, {
        product: body.product as 'boost_7d' | 'boost_30d',
        targetId: id,
      }),
    };
  }
}
