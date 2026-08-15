import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { apiAsOrNull } from '@/lib/authed';
import { readSession } from '@/lib/session';

/** §18.2 S05 — the horses you own. §2: the record, not the listing. */
export const metadata: Metadata = { title: 'Atlarım', robots: { index: false } };

interface MyHorse {
  id: string;
  slug: string;
  name: string;
  sex: string;
  breedName: string | null;
  dateOfBirth: string | null;
  heightCm: number | null;
  color: string | null;
  status: string;
  mediaCount: number;
  activeListingId: string | null;
  nextDueOn: string | null;
  nextDueTitle: string | null;
}

const SEX: Record<string, string> = {
  mare: 'Kısrak',
  stallion: 'Aygır',
  gelding: 'İğdiş',
  filly: 'Dişi tay',
  colt: 'Erkek tay',
};

export default async function MyHorsesPage() {
  if (!(await readSession())) redirect('/tr/giris');

  const horses = (await apiAsOrNull<MyHorse[]>('/me/horses')) ?? [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-h1">Atlarım</h1>
        <Link href="/tr/hesap" className="text-small text-text-secondary hover:text-gold-soft">
          ← Hesabım
        </Link>
      </header>

      {horses.length === 0 ? (
        // §20.7: an empty state names the next action.
        <div className="rounded-lg border border-border bg-surface p-10 text-center">
          <p className="font-display text-h3">Henüz at kaydın yok</p>
          <p className="text-small text-text-secondary mt-2">
            Bir atın kaydı kalıcıdır ve ilan ondan türer — önce atı kaydet, satmaya karar
            verdiğinde ilan hazır olur.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {horses.map((horse) => (
            <li key={horse.id} className="rounded-lg border border-border bg-surface p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-h3">{horse.name}</h2>
                <span className="text-caption text-text-secondary">
                  {horse.activeListingId ? 'İlanda' : 'İlanda değil'}
                </span>
              </div>

              <p className="text-small text-text-secondary mt-1">
                {[
                  horse.breedName,
                  SEX[horse.sex] ?? horse.sex,
                  horse.heightCm ? `${horse.heightCm} cm` : null,
                  horse.color,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>

              <p className="text-caption text-text-secondary mt-3 tabular">
                {horse.mediaCount} medya
                {horse.nextDueOn
                  ? ` · sıradaki: ${horse.nextDueTitle ?? 'bakım'} (${horse.nextDueOn})`
                  : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
