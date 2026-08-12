import { z } from 'zod';

/**
 * Environment schema — spec §6, adjusted by ADR-0001.
 *
 * Validated once at boot. §24.24 forbids secrets in the repo, so nothing here
 * carries a production default: a missing key must fail loudly at startup
 * rather than silently degrade a security control at runtime.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:3001'),

  // §1.3 P5: the launch region is configuration, not a constant in code.
  LAUNCH_REGION: z.string().length(2).default('TR'),
  DEFAULT_LOCALE: z.string().default('tr'),
  DEFAULT_CURRENCY: z.string().length(3).default('EUR'),

  // ADR-0004: the app role must not hold BYPASSRLS; DIRECT_URL is the owner
  // role and is used only by the migration runner.
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().optional(),
  CLOUD_SQL_INSTANCE_CONNECTION_NAME: z.string().optional(),

  GCP_PROJECT_ID: z.string().optional(),
  GCP_REGION: z.string().default('europe-west1'),

  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('30d'),

  TYPESENSE_HOST: z.string().optional(),
  TYPESENSE_PORT: z.coerce.number().default(443),
  TYPESENSE_PROTOCOL: z.enum(['http', 'https']).default('https'),
  TYPESENSE_API_KEY: z.string().optional(),

  GCS_BUCKET: z.string().optional(),
  GCS_UPLOAD_URL_TTL_SECONDS: z.coerce.number().default(900),
  GCS_DOCUMENT_URL_TTL_SECONDS: z.coerce.number().default(300),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  SENTRY_DSN: z.string().optional(),
  POSTHOG_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().default('https://eu.i.posthog.com'),

  IMAGE_HASH_THRESHOLD: z.coerce.number().default(10),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return parsed.data;
}
