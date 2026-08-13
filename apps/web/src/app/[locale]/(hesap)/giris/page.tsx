import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { signIn } from '../actions';
import { AuthForm } from '@/components/AuthForm';
import { readSession } from '@/lib/session';

/** §18.2 S02 — sign in. */
export const metadata: Metadata = {
  title: 'Giriş yap',
  robots: { index: false },
};

export default async function SignInPage() {
  if (await readSession()) redirect('/tr/hesap');

  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <h1 className="font-display text-h1 mb-2">Giriş yap</h1>
      <p className="text-small text-text-secondary mb-8">
        Atlarını, ilanlarını ve mesajlarını yönet.
      </p>

      <AuthForm mode="signIn" action={signIn} />
    </main>
  );
}
