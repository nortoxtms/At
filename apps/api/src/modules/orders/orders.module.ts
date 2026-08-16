import { Module } from '@nestjs/common';

import { LocalPaymentProvider } from './local-payment.provider.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { PAYMENT_PROVIDER } from './payment.provider.js';

/**
 * NotificationsModule is @Global, so both parties can be told without an
 * import here.
 *
 * The payment provider has one implementation today. When a marketplace
 * processor is contracted, this becomes a factory on its credentials — the
 * shape the billing module already uses — and nothing in `OrdersService`
 * changes, which is the entire reason the seam exists.
 *
 * There is no production guard on the local provider yet, deliberately: a
 * `throw` in production would be right the day a real one exists and wrong
 * today, when refusing to boot would take down the marketplace, the registry
 * and messaging over a feature nobody can use yet. The clients label the
 * payment step as a simulation instead, which is where a person can actually
 * see it.
 */
@Module({
  controllers: [OrdersController],
  providers: [OrdersService, { provide: PAYMENT_PROVIDER, useClass: LocalPaymentProvider }],
  exports: [OrdersService],
})
export class OrdersModule {}
