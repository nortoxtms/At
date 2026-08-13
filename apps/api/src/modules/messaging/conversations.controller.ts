import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { CurrentProfileId } from '../../common/guards/auth.guard.js';
import { RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { ConversationsService } from './conversations.service.js';

const createSchema = z.object({
  contextType: z.enum(['listing', 'service', 'job', 'horse', 'direct']),
  contextId: z.string().uuid().optional(),
  participantId: z.string().uuid(),
  firstMessage: z.string().trim().min(1, 'Bir mesaj yaz.').max(4000),
});

const sendSchema = z.object({ body: z.string().trim().min(1).max(4000) });

const quickActionSchema = z.object({
  action: z.enum(['request_health', 'propose_viewing', 'propose_ppe', 'share_horse', 'propose_price']),
  payload: z.record(z.unknown()).default({}),
});

/** Spec §12 "Messaging". */
@Controller()
@UseGuards(RateLimitGuard)
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Post('conversations')
  @HttpCode(HttpStatus.CREATED)
  // The §3.3 daily cap is enforced in the service as a plan entitlement; this
  // is the abuse ceiling on top of it, which is a different concern.
  @RateLimit({ limit: 60, windowSeconds: 3600, per: 'profile' })
  async create(
    @CurrentProfileId() profileId: string,
    @Body(zodBody(createSchema)) body: z.infer<typeof createSchema>,
  ) {
    return { data: await this.conversations.create(profileId, body) };
  }

  @Get('conversations')
  async list(
    @CurrentProfileId() profileId: string,
    @Query('filter') filter?: 'buying' | 'selling' | 'job',
  ) {
    return { data: await this.conversations.list(profileId, filter) };
  }

  @Get('conversations/:id')
  async messages(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.conversations.messages(profileId, id) };
  }

  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 300, windowSeconds: 3600, per: 'profile' })
  async send(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(sendSchema)) body: z.infer<typeof sendSchema>,
  ) {
    return { data: await this.conversations.send(profileId, id, body.body) };
  }

  /** §15.1 quick actions — structured, and they actually do the thing. */
  @Post('conversations/:id/quick-action')
  async quickAction(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(quickActionSchema)) body: z.infer<typeof quickActionSchema>,
  ) {
    return { data: await this.conversations.quickAction(profileId, id, body.action, body.payload) };
  }

  @Post('conversations/:id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.conversations.archive(profileId, id);
  }

  @Get('messaging/token')
  async token(@CurrentProfileId() profileId: string) {
    return { data: await this.conversations.issueToken(profileId) };
  }
}
