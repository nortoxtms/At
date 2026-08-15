'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import type { AuthState } from '@/lib/auth-state';

const FIELD =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-text-primary';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-gold-soft px-6 py-3 text-body font-medium text-text-on-gold disabled:opacity-60"
    >
      {pending ? 'Gönderiliyor…' : label}
    </button>
  );
}

/**
 * §18.2 S01/S02's sign-in and sign-up, on the web.
 *
 * One component for both because the difference is a single field and the
 * copy; two near-identical forms drift, and the one that drifts is the one
 * with the accessibility attributes on it.
 *
 * Errors are rendered next to the field they belong to when §12 says which
 * field, and above the form when it does not.
 */
export function AuthForm({
  mode,
  action,
}: {
  mode: 'signIn' | 'signUp';
  action: (state: AuthState, form: FormData) => Promise<AuthState>;
}) {
  const [state, formAction] = useActionState(action, {});
  const signUp = mode === 'signUp';

  const fieldError = (name: string) => state.fields?.[name];

  return (
    <form action={formAction} className="space-y-4">
      {state.error && !state.fields ? (
        <p
          role="alert"
          className="rounded-md border border-danger/50 bg-danger/10 px-3 py-2 text-small text-text-primary"
        >
          {state.error}
        </p>
      ) : null}

      {signUp ? (
        <label className="block">
          <span className="text-label text-text-secondary uppercase">Adın</span>
          <input
            name="displayName"
            required
            autoComplete="name"
            className={`${FIELD} mt-1`}
            aria-invalid={Boolean(fieldError('displayName'))}
          />
          {fieldError('displayName') ? (
            <span className="text-caption text-danger mt-1 block">
              {fieldError('displayName')}
            </span>
          ) : null}
        </label>
      ) : null}

      <label className="block">
        <span className="text-label text-text-secondary uppercase">E-posta</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className={`${FIELD} mt-1`}
          aria-invalid={Boolean(fieldError('email'))}
        />
        {fieldError('email') ? (
          <span className="text-caption text-danger mt-1 block">{fieldError('email')}</span>
        ) : null}
      </label>

      <label className="block">
        <span className="text-label text-text-secondary uppercase">Şifre</span>
        <input
          name="password"
          type="password"
          required
          minLength={signUp ? 8 : undefined}
          autoComplete={signUp ? 'new-password' : 'current-password'}
          className={`${FIELD} mt-1`}
          aria-invalid={Boolean(fieldError('password'))}
        />
        {fieldError('password') ? (
          <span className="text-caption text-danger mt-1 block">
            {fieldError('password')}
          </span>
        ) : (
          <span className="text-caption text-text-secondary mt-1 block">
            {signUp ? 'En az 8 karakter.' : ''}
          </span>
        )}
      </label>

      <Submit label={signUp ? 'Hesap oluştur' : 'Giriş yap'} />

      <p className="text-small text-text-secondary text-center">
        {signUp ? (
          <>
            Zaten hesabın var mı?{' '}
            <Link href="/tr/giris" className="text-gold-soft underline">
              Giriş yap
            </Link>
          </>
        ) : (
          <>
            Hesabın yok mu?{' '}
            <Link href="/tr/kayit" className="text-gold-soft underline">
              Hesap oluştur
            </Link>
          </>
        )}
      </p>

      {signUp ? (
        // §24.26: the policy pages must be linked from signup.
        <p className="text-caption text-text-secondary text-center">
          Hesap oluşturarak{' '}
          <Link href="/tr/kosullar" className="underline">
            Kullanım Koşulları
          </Link>
          ,{' '}
          <Link href="/tr/gizlilik" className="underline">
            Gizlilik Politikası
          </Link>{' '}
          ve{' '}
          <Link href="/tr/refah-politikasi" className="underline">
            Refah Politikası
          </Link>
          &apos;nı kabul etmiş olursun.
        </p>
      ) : null}
    </form>
  );
}
