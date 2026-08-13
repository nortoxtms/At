import 'reflect-metadata';

import { Logger, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';

import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';

async function bootstrap(): Promise<void> {
  // rawBody keeps the untouched request buffer alongside the parsed body.
  // §16.2's webhook signatures are computed over the bytes Stripe sent, and
  // parsing to JSON then re-serializing changes key order and whitespace —
  // the classic "verifies in test, 400s in production" webhook bug.
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
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


  const port = config.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');

  logger.log(`ONLY HORSES API listening on :${port}`);
  logger.log(`Launch region ${config.get('LAUNCH_REGION', { infer: true })}`);
}

void bootstrap();
