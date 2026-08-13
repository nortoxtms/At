import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { z } from 'zod';

import { CurrentProfileId } from '../../common/guards/auth.guard.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { VerificationService } from './verification.service.js';

const submitSchema = z.object({
  kind: z.enum(['professional', 'business', 'horse_ownership']),
  evidenceMediaIds: z.array(z.string().uuid()).max(10).default([]),
  horseId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
});

/** Spec §12 "Verification". */
@Controller()
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  /** §18.2 S26 — the ladder. */
  @Get('me/verifications')
  async mine(@CurrentProfileId() profileId: string) {
    return {
      data: {
        ladder: await this.verification.ladder(profileId),
        submissions: await this.verification.mine(profileId),
      },
    };
  }

  /**
   * Manual-review submissions. Identity goes through Stripe Identity and is
   * decided by its webhook (§16.2), never by a client call — which is what
   * keeps §3.3's hard rule from being self-attested.
   */
  @Post('verification/submit')
  @HttpCode(HttpStatus.CREATED)
  async submit(
    @CurrentProfileId() profileId: string,
    @Body(zodBody(submitSchema)) body: z.infer<typeof submitSchema>,
  ) {
    return { data: await this.verification.submit(profileId, body) };
  }
}
