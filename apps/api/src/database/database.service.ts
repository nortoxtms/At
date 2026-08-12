import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';

import type { Env } from '../config/env.js';

/**
 * Database access — Cloud SQL for PostgreSQL (ADR-0001).
 *
 * The important method here is `withUser`. Per ADR-0004, RLS is preserved
 * without PostgREST by setting `request.jwt.claims` as a transaction-local
 * GUC, which is what `auth.uid()` reads in every §8 policy. SET LOCAL is
 * scoped to the transaction, so a pooled connection cannot carry one user's
 * identity into the next request — it reverts on COMMIT and on ROLLBACK
 * alike.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool!: Pool;

  constructor(private readonly config: ConfigService<Env, true>) {}

  async onModuleInit(): Promise<void> {
    this.pool = new Pool({
      connectionString: this.config.get('DATABASE_URL', { infer: true }),
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    await this.assertRlsIsEffective();
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  /**
   * ADR-0004: a superuser or a role with BYPASSRLS makes every policy inert
   * while all tests still pass. That failure is silent and total, so it is
   * checked at boot rather than left to review.
   */
  private async assertRlsIsEffective(): Promise<void> {
    const { rows } = await this.pool.query<{
      current_user: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(
      `SELECT current_user, rolsuper, rolbypassrls
       FROM pg_roles WHERE rolname = current_user`,
    );

    const role = rows[0];
    if (!role) {
      throw new Error('Could not resolve the current database role');
    }

    if (role.rolsuper || role.rolbypassrls) {
      const message =
        `The API is connected as "${role.current_user}", which bypasses row level ` +
        `security. Every §8 policy would be inert. Connect as a dedicated ` +
        `application role without SUPERUSER or BYPASSRLS (see ADR-0004).`;

      // In production this is a hard stop. Locally it is a loud warning, so a
      // developer running against a default `postgres` superuser still gets a
      // working app but cannot mistake it for a correct configuration.
      if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
        throw new Error(message);
      }
      this.logger.warn(message);
    }
  }

  /** Unscoped query. For reference data and system work only. */
  async query<T extends QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const result = await this.pool.query<T>(text, params);
    return result.rows;
  }

  /**
   * Runs `work` inside a transaction that carries the caller's identity, so
   * RLS applies to every statement in it. Pass `null` for anonymous requests:
   * auth.uid() then returns NULL and only the public-read policies match.
   */
  async withUser<T>(
    profileId: string | null,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const claims = JSON.stringify({
        sub: profileId,
        role: profileId ? 'authenticated' : 'anon',
      });
      // Parameterised: SET LOCAL does not accept placeholders, but
      // set_config() does, which keeps a hostile profile id out of the SQL.
      await client.query('SELECT set_config($1, $2, true)', ['request.jwt.claims', claims]);

      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async healthCheck(): Promise<boolean> {
    const rows = await this.query<{ ok: number }>('SELECT 1 AS ok');
    return rows[0]?.ok === 1;
  }
}
