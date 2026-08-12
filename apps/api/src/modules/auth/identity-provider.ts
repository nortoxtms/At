/**
 * Identity provider abstraction.
 *
 * Firebase Auth is the provider in every deployed environment (ADR-0001).
 * The interface exists for the same reason §15.2 requires one around Stream
 * Chat: the vendor is an implementation detail, and the test suite must be
 * able to create and authenticate a user without reaching the network.
 */
export interface IdentityUser {
  providerUid: string;
  email: string | null;
  phone: string | null;
  emailVerified: boolean;
}

export interface IdentityProvider {
  readonly name: string;

  createUser(input: { email: string; password: string }): Promise<IdentityUser>;

  /** Returns null when the credentials do not match — never throws for that. */
  verifyPassword(input: { email: string; password: string }): Promise<IdentityUser | null>;

  /** Verifies a client-issued ID token (Apple/Google sign-in, §12 /auth/oauth). */
  verifyIdToken(idToken: string): Promise<IdentityUser>;

  deleteUser(providerUid: string): Promise<void>;
}

export const IDENTITY_PROVIDER = Symbol('IDENTITY_PROVIDER');

export class DuplicateEmailError extends Error {
  constructor() {
    super('Bu e-posta adresi zaten kayıtlı.');
  }
}
