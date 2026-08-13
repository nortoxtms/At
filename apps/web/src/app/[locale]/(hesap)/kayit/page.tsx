import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { signUp } from '../actions';
import { AuthForm } from '@/components/AuthForm';
import { readSession } from '@/lib/session';

/** §18.2 S01 — sign up. */
export const metadata: Metadata = {
  title: 'Hesap oluştur',
  robots: { index: false },
};

export default async function SignUpPage() {
  if (await readSession()) redirect('/tr/hesap');

  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <h1 className="font-display text-h1 mb-2">Hesap oluştur</h1>
      <p className="text-small text-text-secondary mb-8">
        Ücretsiz. İlan yayınlamak için ayrıca kimlik doğrulaması gerekir — bu satın
        alınamaz, her planda zorunludur.
      </p>

      <AuthForm mode="signUp" action={signUp} />
    </main>
  );
}
