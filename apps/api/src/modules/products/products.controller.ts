import {
  Body,
  Controller,
  Delete,
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
import {
  createProductSchema,
  productSearchSchema,
  updateProductSchema,
} from '@only-horses/shared-types';
import type { z } from 'zod';

import { CurrentProfileId, OptionalAuth, Public } from '../../common/guards/auth.guard.js';
import { RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { ProductsService } from './products.service.js';

/** §12 "Products" — the equestrian market that is not a horse. */
@Controller()
@UseGuards(RateLimitGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  /**
   * Declared before `products/:idOrSlug`.
   *
   * Nest matches routes in declaration order, so a parameterized route above
   * this one swallows "categories" and answers 404 for the category grid — a
   * mistake this codebase has already made once, and the comment on
   * `services/categories` records it.
   */
  @Get('products/categories')
  @Public()
  async categories() {
    return { data: await this.products.categories() };
  }

  @Get('products/search')
  @OptionalAuth()
  async search(
    @Query() query: Record<string, string>,
    @CurrentProfileId() profileId: string | null,
  ) {
    const parsed = productSearchSchema.parse(query);
    const result = await this.products.search(parsed, profileId);

    return {
      data: result.hits,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        hasMore: result.page * result.limit < result.total,
      },
    };
  }

  @Get('me/products')
  async mine(@CurrentProfileId() profileId: string) {
    return { data: await this.products.listMine(profileId) };
  }

  @Post('products')
  @HttpCode(HttpStatus.CREATED)
  // §12 rate limits: the same 30-per-hour ceiling listings get. A product is
  // cheaper to create than a horse listing, which is exactly why it needs one.
  @RateLimit({ limit: 30, windowSeconds: 3600, per: 'profile' })
  async create(
    @CurrentProfileId() profileId: string,
    @Body(zodBody(createProductSchema)) body: z.infer<typeof createProductSchema>,
  ) {
    return { data: await this.products.create(profileId, body) };
  }

  @Get('products/:idOrSlug')
  @OptionalAuth()
  async detail(
    @Param('idOrSlug') idOrSlug: string,
    @CurrentProfileId() profileId: string | null,
  ) {
    return { data: await this.products.byIdOrSlug(idOrSlug, profileId) };
  }

  @Patch('products/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateProductSchema)) body: z.infer<typeof updateProductSchema>,
  ): Promise<void> {
    await this.products.update(profileId, id, body);
  }

  @Post('products/:id/publish')
  async publish(@CurrentProfileId() profileId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.products.transition(profileId, id, 'publish') };
  }

  @Post('products/:id/pause')
  async pause(@CurrentProfileId() profileId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.products.transition(profileId, id, 'pause') };
  }

  @Post('products/:id/resume')
  async resume(@CurrentProfileId() profileId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.products.transition(profileId, id, 'resume') };
  }

  @Post('products/:id/close')
  async close(@CurrentProfileId() profileId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.products.transition(profileId, id, 'close') };
  }

  @Post('products/:id/renew')
  async renew(@CurrentProfileId() profileId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.products.transition(profileId, id, 'renew') };
  }

  @Get('products/:id/media')
  @OptionalAuth()
  async media(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentProfileId() profileId: string | null,
  ) {
    return { data: await this.products.listMedia(id, profileId) };
  }

  @Post('products/:id/media')
  @HttpCode(HttpStatus.CREATED)
  async attachMedia(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { mediaId: string },
  ) {
    await this.products.attachMedia(profileId, id, body.mediaId);
    return { data: { attached: body.mediaId } };
  }

  @Delete('products/:id/media/:mediaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMedia(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
  ): Promise<void> {
    await this.products.removeMedia(profileId, id, mediaId);
  }

  @Delete('products/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.products.remove(profileId, id);
  }
}
