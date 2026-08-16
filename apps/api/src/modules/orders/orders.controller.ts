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
import { createOrderSchema } from '@only-horses/shared-types';
import type { z } from 'zod';

import { CurrentProfileId } from '../../common/guards/auth.guard.js';
import { RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { OrdersService } from './orders.service.js';

/**
 * §12 "Orders" — buying a product.
 *
 * Every route here needs a session. There is no anonymous checkout, and that
 * is not a convenience decision: an order has two parties who have to be able
 * to reach each other afterwards, and a guest order is a dispute with nobody
 * on one side of it.
 */
@Controller()
@UseGuards(RateLimitGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /**
   * Declared before `orders/:id`, or the parameterized route swallows "mine"
   * and answers 404 for the buyer's own list. Nest matches in declaration
   * order and this codebase has made that mistake twice.
   */
  @Get('orders/mine')
  async mine(
    @CurrentProfileId() profileId: string,
    @Query('side') side?: string,
  ) {
    return {
      data: await this.orders.listMine(profileId, side === 'seller' ? 'seller' : 'buyer'),
    };
  }

  @Post('orders')
  @HttpCode(HttpStatus.CREATED)
  // Ordering is cheap to do and expensive to receive: a seller woken twenty
  // times in an hour by orders nobody intends to pay for is the abuse this
  // stops.
  @RateLimit({ limit: 20, windowSeconds: 3600, per: 'profile' })
  async create(
    @CurrentProfileId() profileId: string,
    @Body(zodBody(createOrderSchema)) body: z.infer<typeof createOrderSchema>,
  ) {
    return { data: await this.orders.create(profileId, body) };
  }

  @Get('orders/:id')
  async detail(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.orders.byId(profileId, id) };
  }

  @Post('orders/:id/accept')
  async accept(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.orders.transition(profileId, id, 'accept') };
  }

  @Post('orders/:id/reject')
  async reject(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.orders.transition(profileId, id, 'reject') };
  }

  /**
   * Pay.
   *
   * Rate limited hard and separately from the rest: this is the route that
   * talks to a payment processor, and a loop hitting it is a loop costing
   * money at somebody's expense.
   */
  @Post('orders/:id/pay')
  @RateLimit({ limit: 10, windowSeconds: 3600, per: 'profile' })
  async pay(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { returnUrl?: string },
  ) {
    return {
      data: await this.orders.pay(profileId, id, body?.returnUrl ?? ''),
    };
  }

  @Post('orders/:id/ship')
  async ship(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { trackingNote?: string },
  ) {
    return {
      data: await this.orders.transition(profileId, id, 'ship', {
        trackingNote: body?.trackingNote,
      }),
    };
  }

  @Post('orders/:id/confirm')
  async confirm(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.orders.transition(profileId, id, 'confirm') };
  }

  @Post('orders/:id/cancel')
  async cancel(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reason?: string },
  ) {
    return { data: await this.orders.cancel(profileId, id, body?.reason) };
  }
}
