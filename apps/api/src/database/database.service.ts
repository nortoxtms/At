import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg, { Pool, type PoolClient, type QueryResultRow } from 'pg';

/**
 * Return `date` columns as the 'YYYY-MM-DD' string Postgres stores, not a JS
 * Date.
 *
 * Everything the schema types as `date` is a calendar date — a foaling day, a
 * vaccination due date, an ownership from_date. Parsing those into a Date
 * anchors them to the server's timezone, and formatting them back shifts them
 * by a day for anyone west of UTC. §17's reminders fire on the day, so a
 * one-day drift is a user-visible defect rather than a formatting nit.
 */
pg.types.setTypeParser(pg.types.builtins.DATE, (value: string) => value);

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

  /**
   * Query with NO user identity attached.
   *
   * `auth.uid()` is NULL here, so RLS evaluates this exactly as it would an
   * anonymous request — this is not a privileged escape hatch. Use it only for
   * world-readable reference data (breeds, disciplines, fx rates) and for
   * SECURITY DEFINER functions that deliberately answer one narrow question.
   *
   * For anything belonging to a user, use `queryAs` or `withUser`: reaching
   * for this method instead silently returns zero rows, which reads as "the
   * user has none" rather than as an error.
   */
  async query<T extends QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const result = await this.pool.query<T>(text, params);
    return result.rows;
  }

  /**
   * Single query carrying the caller's identity, so the §8 policies apply.
   * The common case; `withUser` is for multi-statement work that must also be
   * atomic.
   */
  async queryAs<T extends QueryResultRow>(
    profileId: string | null,
    text: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    return this.withUser(profileId, async (client) => {
      const result = await client.query<T>(text, params);
      return result.rows;
    });
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
