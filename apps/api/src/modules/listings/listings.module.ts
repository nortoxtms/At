import { Module } from '@nestjs/common';

import { HorsesModule } from '../horses/horses.module.js';
import { MediaModule } from '../media/media.module.js';
import { ListingsController } from './listings.controller.js';
import { ListingsService } from './listings.service.js';

@Module({
  imports: [HorsesModule, MediaModule],
  controllers: [ListingsController],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule {}
