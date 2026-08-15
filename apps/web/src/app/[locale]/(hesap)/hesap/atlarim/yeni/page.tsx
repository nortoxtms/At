import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createHorse } from '../../../actions-horses';
import { HorseForm } from '@/components/HorseForm';
import { getBreeds, getDisciplines } from '@/lib/api';
import { readSession } from '@/lib/session';

/**
 * §18.2 S10 — add a horse.
 *
 * §7's reference tables are read on the server so the breed and discipline
 * pickers are populated in the first paint. They fall back to the bundled
 * copies when the API does not answer, which is the difference between a form
 * with a missing field and a form nobody can finish.
 */
export const metadata: Metadata = { title: 'At ekle', robots: { index: false } };

export default async function NewHorsePage() {
  if (!(await readSession())) redirect('/tr/giris');

  const [breeds, disciplines] = await Promise.all([getBreeds(), getDisciplines()]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-8">
        <Link
          href="/tr/hesap/atlarim"
          className="text-small text-text-secondary hover:text-gold-soft"
        >
          ← Atlarım
        </Link>
        <h1 className="font-display text-h1 mt-3">At ekle</h1>
        <p className="text-small text-text-secondary mt-2">
          Sadece adı ve cinsiyeti zorunlu. Gerisini bildiğin kadar doldur, kalanını
          sonra eklersin.
        </p>
      </header>

      <HorseForm breeds={breeds} disciplines={disciplines} action={createHorse} />
    </main>
  );
}
