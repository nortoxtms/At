import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

import type { Env } from '../../config/env.js';
import {
  DuplicateEmailError,
  type IdentityProvider,
  type IdentityUser,
} from './identity-provider.js';

/**
 * Firebase Auth identity provider (ADR-0001).
 *
 * The Admin SDK covers user creation, token verification and deletion.
 * It deliberately cannot verify a password — that is a client-side operation
 * — so `verifyPassword` calls the Identity Toolkit REST endpoint, which is
 * the supported server-side path.
 */
@Injectable()
export class FirebaseIdentityProvider implements IdentityProvider {
  readonly name = 'firebase';
  private readonly logger = new Logger(FirebaseIdentityProvider.name);
  private readonly app: App;
  private readonly auth: Auth;
  private readonly webApiKey: string | undefined;

  constructor(private readonly config: ConfigService<Env, true>) {
    const serviceAccountJson = this.config.get('FIREBASE_SERVICE_ACCOUNT_JSON', { infer: true });

    this.app =
      getApps()[0] ??
      initializeApp(
        serviceAccountJson
          ? { credential: cert(JSON.parse(serviceAccountJson)) }
          : // On Cloud Run, workload identity supplies credentials.
            { projectId: this.config.get('FIREBASE_PROJECT_ID', { infer: true }) },
      );

    this.auth = getAuth(this.app);
    this.webApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  }

  async createUser({ email, password }: { email: string; password: string }): Promise<IdentityUser> {
    try {
      const user = await this.auth.createUser({ email, password, emailVerified: false });
      return {
        providerUid: user.uid,
        email: user.email ?? null,
        phone: user.phoneNumber ?? null,
        emailVerified: user.emailVerified,
      };
    } catch (error) {
      if ((error as { code?: string }).code === 'auth/email-already-exists') {
        throw new DuplicateEmailError();
      }
      throw error;
    }
  }

  async verifyPassword({
    email,
    password,
  }: {
    email: string;
    password: string;
  }): Promise<IdentityUser | null> {
    if (!this.webApiKey) {
      throw new Error(
        'NEXT_PUBLIC_FIREBASE_API_KEY is required for server-side password sign-in.',
      );
    }

    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${this.webApiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      },
    );

    if (!response.ok) {
      // Wrong password and unknown email both land here. They are deliberately
      // not distinguished to the caller — telling an attacker which emails
      // exist is an account-enumeration gift.
      return null;
    }

    const body = (await response.json()) as { localId: string; email?: string };
    const user = await this.auth.getUser(body.localId);

    return {
      providerUid: user.uid,
      email: user.email ?? null,
      phone: user.phoneNumber ?? null,
      emailVerified: user.emailVerified,
    };
  }

  async verifyIdToken(idToken: string): Promise<IdentityUser> {
    const decoded = await this.auth.verifyIdToken(idToken, true);
    const user = await this.auth.getUser(decoded.uid);

    return {
      providerUid: user.uid,
      email: user.email ?? null,
      phone: user.phoneNumber ?? null,
      emailVerified: user.emailVerified,
    };
  }

  async deleteUser(providerUid: string): Promise<void> {
    await this.auth.deleteUser(providerUid);
  }
}
