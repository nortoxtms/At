import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import type { Env } from '../../config/env.js';
import { DatabaseService } from '../../database/database.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { FirebaseIdentityProvider } from './firebase-identity.provider.js';
import { IDENTITY_PROVIDER } from './identity-provider.js';
import { LocalIdentityProvider } from './local-identity.provider.js';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      // Global: the AuthGuard is registered as an APP_GUARD in AppModule and
      // needs JwtService in that scope.
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      // Firebase is the provider whenever it is configured. The local
      // provider is a development and test affordance and is refused in
      // production, where a silent fallback would mean passwords quietly
      // living in Postgres instead of Firebase.
      provide: IDENTITY_PROVIDER,
      inject: [ConfigService, DatabaseService],
      useFactory: (config: ConfigService<Env, true>, db: DatabaseService) => {
        const firebaseConfigured = Boolean(config.get('FIREBASE_PROJECT_ID', { infer: true }));

        if (firebaseConfigured) return new FirebaseIdentityProvider(config);

        if (config.get('NODE_ENV', { infer: true }) === 'production') {
          throw new Error(
            'FIREBASE_PROJECT_ID is required in production. Refusing to start with ' +
              'the local identity provider.',
          );
        }

        return new LocalIdentityProvider(db);
      },
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
