import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { CurrentProfileId } from '../../common/guards/auth.guard.js';
import { StaffGuard } from '../../common/guards/staff.guard.js';
import { RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { ModerationService } from './moderation.service.js';
import { VerificationService } from '../verification/verification.service.js';

const reportSchema = z.object({
  targetType: z.enum(['listing', 'service', 'job', 'profile', 'organization', 'message', 'horse', 'review']),
  targetId: z.string().uuid(),
  reason: z.enum(['scam', 'stolen_photos', 'misrepresentation', 'welfare', 'prohibited_content',
                  'spam', 'harassment', 'duplicate', 'wrong_category', 'other']),
  details: z.string().trim().max(2000).optional(),
  evidenceMediaIds: z.array(z.string().uuid()).max(5).default([]),
});

const actionSchema = z.object({
  action: z.enum(['approve', 'remove', 'suspend', 'dismiss']),
  note: z.string().trim().max(1000).optional(),
});

const decideVerificationSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  note: z.string().trim().max(1000).optional(),
});

/** Spec §12 "reports", "blocks". Available to any signed-in user. */
@Controller()
@UseGuards(RateLimitGuard)
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Post('reports')
  @HttpCode(HttpStatus.CREATED)
  // §12 rate limits: 20 reports per day. A report costs a moderator time, and
  // mass-reporting is itself a harassment vector.
  @RateLimit({ limit: 20, windowSeconds: 86400, per: 'profile' })
  async report(
    @CurrentProfileId() profileId: string,
    @Body(zodBody(reportSchema)) body: z.infer<typeof reportSchema>,
  ) {
    return { data: await this.moderation.report(profileId, body) };
  }

  @Post('blocks')
  @HttpCode(HttpStatus.CREATED)
  async block(
    @CurrentProfileId() profileId: string,
    @Body(zodBody(z.object({ profileId: z.string().uuid() }))) body: { profileId: string },
  ) {
    await this.moderation.block(profileId, body.profileId);
    return { data: { blocked: body.profileId } };
  }

  @Delete('blocks/:profileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unblock(
    @CurrentProfileId() profileId: string,
    @Param('profileId', ParseUUIDPipe) blockedId: string,
  ): Promise<void> {
    await this.moderation.unblock(profileId, blockedId);
  }
}

/** Spec §12 "Admin (role-gated)". */
@Controller('admin')
@UseGuards(StaffGuard)
export class AdminModerationController {
  constructor(
    private readonly moderation: ModerationService,
    private readonly verification: VerificationService,
  ) {}

  /**
   * §23 M6's admin metrics — §22's North Star ("weekly qualified inquiries")
   * and the guardrails listed beside it.
   *
   * Staff-gated twice: `StaffGuard` on the controller, and the function checks
   * again (migration 0051). Deliberate belt and braces — this is the one
   * endpoint that reads every tenant's numbers at once.
   */
  @Get('metrics')
  async metrics(@CurrentProfileId() profileId: string, @Query('days') days = '7') {
    return { data: await this.moderation.metrics(profileId, Number(days)) };
  }

  @Get('moderation/queue')
  async queue(
    @CurrentProfileId() moderatorId: string,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
  ) {
    return {
      data: await this.moderation.queue(moderatorId, {
        status,
        severity: severity ? Number(severity) : undefined,
      }),
    };
  }

  @Post('moderation/:caseId/action')
  async act(
    @CurrentProfileId() moderatorId: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body(zodBody(actionSchema)) body: z.infer<typeof actionSchema>,
  ) {
    return { data: await this.moderation.act(caseId, moderatorId, body) };
  }

  @Get('verifications/queue')
  async verificationQueue(@Query('status') status?: string) {
    return { data: await this.verification.queue(status ?? 'pending') };
  }

  @Post('verifications/:id/decide')
  async decideVerification(
    @CurrentProfileId() reviewerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(decideVerificationSchema)) body: z.infer<typeof decideVerificationSchema>,
  ) {
    return { data: await this.verification.decide(id, { ...body, reviewerId }) };
  }
}
