import 'reflect-metadata';

import { Logger, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';

import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<Env, true>);
  const logger = new Logger('Bootstrap');

  app.use(helmet());

  // §12: base is https://api.onlyhorses.app/v1
  app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: false as never });

  app.enableCors({
    origin: [config.get('APP_URL', { infer: true })],
    credentials: true,
    exposedHeaders: ['X-Request-Id', 'Retry-After', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  });

  // Stripe and Mux webhooks verify signatures over the raw body (§16.2), so
  // the JSON parser must not be the only thing that touches it. Registered
  // when the billing module lands in M5.

  const port = config.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');

  logger.log(`ONLY HORSES API listening on :${port}`);
  logger.log(`Launch region ${config.get('LAUNCH_REGION', { infer: true })}`);
}

void bootstrap();
