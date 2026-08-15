import { Module } from '@nestjs/common';

import { MediaModule } from '../media/media.module.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

// EntitlementsModule is @Global, so §3.3's publish gate needs no import here.
@Module({
  imports: [MediaModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
