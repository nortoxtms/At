import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import { Injectable, Logger } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service.js';
import {
  DuplicateEmailError,
  type IdentityProvider,
  type IdentityUser,
} from './identity-provider.js';

const scryptAsync = promisify(scrypt);

/**
 * Development and test identity provider.
 *
 * Stores a scrypt hash in `auth.users.password_hash` so the API is usable
 * end to end without Firebase credentials. It is never selected when
 * FIREBASE_PROJECT_ID is configured, and AuthModule refuses to select it in
 * production.
 */
@Injectable()
export class LocalIdentityProvider implements IdentityProvider {
  readonly name = 'local';
  private readonly logger = new Logger(LocalIdentityProvider.name);

  constructor(private readonly db: DatabaseService) {
    this.logger.warn(
      'Using the local identity provider. Passwords are stored in Postgres, ' +
        'not Firebase. Development and test only.',
    );
  }

  private async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = (await scryptAsync(password, salt, 64)) as Buffer;
    return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
  }

  private async verify(password: string, stored: string): Promise<boolean> {
    const [scheme, saltHex, hashHex] = stored.split('$');
    if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;

    const derived = (await scryptAsync(password, Buffer.from(saltHex, 'hex'), 64)) as Buffer;
    const expected = Buffer.from(hashHex, 'hex');

    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  }

  async createUser({ email, password }: { email: string; password: string }): Promise<IdentityUser> {
    const existing = await this.db.query<{ id: string }>(
      'SELECT id FROM auth.users WHERE email = $1',
      [email],
    );
    if (existing.length > 0) throw new DuplicateEmailError();

    // `auth.users` is a mirror of the identity provider, keyed by
    // firebase_uid. This provider *is* the identity store, so it seeds that
    // key with its own row id — the profile provisioning path then resolves
    // the mirror the same way for both providers.
    const rows = await this.db.query<{ id: string; email: string }>(
      `WITH generated AS (SELECT uuid_generate_v4() AS id)
       INSERT INTO auth.users (id, firebase_uid, email, password_hash, providers)
       SELECT generated.id, generated.id::text, $1, $2, ARRAY['password']
       FROM generated
       RETURNING id, email`,
      [email, await this.hash(password)],
    );

    const user = rows[0]!;
    return { providerUid: user.id, email: user.email, phone: null, emailVerified: false };
  }

  async verifyPassword({
    email,
    password,
  }: {
    email: string;
    password: string;
  }): Promise<IdentityUser | null> {
    const rows = await this.db.query<{
      id: string;
      email: string;
      phone: string | null;
      password_hash: string | null;
      email_confirmed_at: Date | null;
    }>(
      `SELECT id, email, phone, password_hash, email_confirmed_at
       FROM auth.users WHERE email = $1 AND deleted_at IS NULL`,
      [email],
    );

    const user = rows[0];
    if (!user?.password_hash) return null;
    if (!(await this.verify(password, user.password_hash))) return null;

    await this.db.query('UPDATE auth.users SET last_sign_in_at = now() WHERE id = $1', [user.id]);

    return {
      providerUid: user.id,
      email: user.email,
      phone: user.phone,
      emailVerified: user.email_confirmed_at !== null,
    };
  }

  async verifyIdToken(): Promise<IdentityUser> {
    throw new Error('OAuth sign-in requires the Firebase identity provider.');
  }

  async deleteUser(providerUid: string): Promise<void> {
    await this.db.query('UPDATE auth.users SET deleted_at = now() WHERE id = $1', [providerUid]);
  }
}
