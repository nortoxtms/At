import { Module } from '@nestjs/common';

import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { ServicesController } from './services.controller.js';
import { ServicesService } from './services.service.js';

@Module({
  imports: [EntitlementsModule],
  controllers: [ServicesController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
