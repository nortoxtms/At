import { Module } from '@nestjs/common';

import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';

@Module({
  imports: [EntitlementsModule, NotificationsModule],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
