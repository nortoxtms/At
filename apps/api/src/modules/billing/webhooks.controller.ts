import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { Public } from '../../common/guards/auth.guard.js';
import { BILLING_PROVIDER, type BillingProvider } from './billing.provider.js';
import { BillingService } from './billing.service.js';

/** Express only exposes the untouched body when a raw parser stored it. */
interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

/**
 * §16.2 step 3 — `POST /webhooks/stripe`.
 *
 * Public in the routing sense and authenticated by signature: there is no
 * session behind a webhook, and the signature over the *raw* body is the only
 * thing separating Stripe from anyone who can guess the URL. That is why
 * `main.ts` keeps the raw buffer for this path — a JSON round-trip re-serializes
 * key order and whitespace, and the signature no longer matches.
 *
 * Always answers 200 for an event it verified, even one it does not handle.
 * A non-2xx tells Stripe to retry, and retrying an event nobody will ever
 * handle is a queue that never drains.
 */
@Controller()
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly billing: BillingService,
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
  ) {}

  @Post('webhooks/stripe')
  @Public()
  @HttpCode(HttpStatus.OK)
  async stripe(
    @Req() request: RawBodyRequest,
    @Headers('stripe-signature') signature?: string,
  ) {
    const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}));

    let event;
    try {
      event = this.provider.constructEvent(rawBody, signature);
    } catch (error) {
      // 400, not 500: the request is malformed or forged, and Stripe should
      // not retry it. Logged without the body — it is unverified input.
      this.logger.warn(
        `Rejected webhook: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new BadRequestException('Invalid webhook signature');
    }

    const result = await this.billing.handleEvent(event);
    return { received: true, ...result };
  }
}
