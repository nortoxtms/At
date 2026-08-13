import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { BILLING_PROVIDER } from './billing.provider.js';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { LocalBillingProvider } from './local-billing.provider.js';
import { StripeBillingProvider } from './stripe-billing.provider.js';
import { WebhooksController } from './webhooks.controller.js';

@Module({
  imports: [EntitlementsModule, NotificationsModule],
  controllers: [BillingController, WebhooksController],
  providers: [
    BillingService,
    {
      provide: BILLING_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const secretKey = process.env.STRIPE_SECRET_KEY;
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        if (secretKey && webhookSecret) {
          return new StripeBillingProvider(
            secretKey,
            webhookSecret,
            process.env.STRIPE_IDENTITY_WEBHOOK_SECRET,
          );
        }

        // Refused in production, and this one is not a judgement call: a
        // billing provider that charges nobody would hand out every
        // subscription in §16.1 for free.
        if (config.get('NODE_ENV', { infer: true }) === 'production') {
          throw new Error('STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are required in production.');
        }

        return new LocalBillingProvider(
          config.get('JWT_SECRET', { infer: true }),
          config.get('APP_URL', { infer: true }),
        );
      },
    },
  ],
  exports: [BillingService, BILLING_PROVIDER],
})
export class BillingModule {}
