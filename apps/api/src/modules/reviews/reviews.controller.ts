import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { createReviewSchema, hideReviewSchema, reviewResponseSchema } from '@only-horses/shared-types';
import type { z } from 'zod';

import { CurrentProfileId, Public } from '../../common/guards/auth.guard.js';
import { StaffGuard } from '../../common/guards/staff.guard.js';
import { RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { ReviewsService } from './reviews.service.js';

/** Spec §12 "Reviews". */
@Controller()
@UseGuards(RateLimitGuard)
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post('reviews')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 10, windowSeconds: 86400, per: 'profile' })
  async create(
    @CurrentProfileId() profileId: string,
    @Body(zodBody(createReviewSchema)) body: z.infer<typeof createReviewSchema>,
  ) {
    return { data: await this.reviews.create(profileId, body) };
  }

  /**
   * §13.4 answered before the form opens. Declared before `reviews/:id` so the
   * literal path wins — Nest matches in declaration order.
   */
  @Get('reviews/eligibility')
  async eligibility(
    @CurrentProfileId() profileId: string,
    @Query('conversationId') conversationId?: string,
    @Query('subjectProfileId') subjectProfileId?: string,
    @Query('subjectOrgId') subjectOrgId?: string,
  ) {
    return {
      data: await this.reviews.eligibility(profileId, {
        conversationId,
        subjectProfileId,
        subjectOrgId,
      }),
    };
  }

  /** Public: reviews are the reason §18.2 S23 is worth visiting. */
  @Get('reviews')
  @Public()
  async list(
    @Query('subjectProfileId') subjectProfileId?: string,
    @Query('subjectOrgId') subjectOrgId?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const result = await this.reviews.listFor(
      { profileId: subjectProfileId, orgId: subjectOrgId },
      Number(page),
      Math.min(Number(limit), 50),
    );

    return { data: result.reviews, meta: { summary: result.summary } };
  }

  /**
   * §12 GET /profiles/:id/reviews.
   *
   * The same data as `GET /reviews?subjectProfileId=`, under the path §12
   * names — a profile page asks for "this person's reviews", not for a
   * filtered review collection.
   */
  @Get('profiles/:id/reviews')
  @Public()
  async forProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const result = await this.reviews.listFor({ profileId: id }, Number(page), Math.min(Number(limit), 50));
    return { data: result.reviews, meta: { summary: result.summary } };
  }

  /** §13.4: one response, no threading. */
  @Patch('reviews/:id/response')
  @HttpCode(HttpStatus.NO_CONTENT)
  async respond(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(reviewResponseSchema)) body: z.infer<typeof reviewResponseSchema>,
  ): Promise<void> {
    await this.reviews.respond(profileId, id, body.body);
  }

  /**
   * §13.4: hidden by moderators with a logged reason — and there is no delete
   * route, for the subject or for anyone else.
   */
  @Post('admin/reviews/:id/hide')
  @UseGuards(StaffGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async hide(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(hideReviewSchema)) body: z.infer<typeof hideReviewSchema>,
  ): Promise<void> {
    await this.reviews.hide(profileId, id, body.reason);
  }
}
