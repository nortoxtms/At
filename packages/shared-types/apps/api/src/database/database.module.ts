import { Global, Module } from '@nestjs/common';

import { DatabaseService } from './database.service.js';

/** Global so every feature module can inject the pool without re-importing. */
@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
