import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';

import { loadEnv } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';
import { ApiExceptionFilter } from './common/filters/api-exception.filter.js';
import { AuthGuard } from './common/guards/auth.guard.js';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware.js';
import { JobsModule } from './jobs/jobs.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { EntitlementsModule } from './modules/entitlements/entitlements.module.js';
import { HealthRecordsModule } from './modules/health-records/health-records.module.js';
import { HorsesModule } from './modules/horses/horses.module.js';
import { MediaModule } from './modules/media/media.module.js';
import { ProfilesModule } from './modules/profiles/profiles.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { ReferenceModule } from './modules/reference/reference.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // §6 is the contract; loadEnv fails the boot rather than letting a
      // missing key turn into a runtime surprise.
      validate: loadEnv,
      envFilePath: ['.env.local', '.env', '../../.env'],
    }),
    DatabaseModule,
    EntitlementsModule,
    NotificationsModule,
    AuthModule,
    ProfilesModule,
    MediaModule,
    HorsesModule,
    HealthRecordsModule,
    ReferenceModule,
    HealthModule,
    JobsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    // Authentication is on by default; routes opt out with @Public(). §24.2
    // depends on there being no way to reach a write path unauthenticated by
    // forgetting a decorator.
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
