import { Global, Module } from '@nestjs/common';

import { EntitlementsService } from './entitlements.service.js';

/** Global: every write path that has a §3.3 limit needs this check. */
@Global()
@Module({
  providers: [EntitlementsService],
  exports: [EntitlementsService],
})
export class EntitlementsModule {}
