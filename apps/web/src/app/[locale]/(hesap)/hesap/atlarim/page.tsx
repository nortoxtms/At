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

      <Link
        href="/tr/hesap/atlarim/yeni"
        className="mb-6 inline-block rounded-md bg-gold-soft px-5 py-2 text-small font-medium text-text-on-gold"
      >
        At ekle
      </Link>

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
                <h2 className="font-display text-h3">
                  <Link href={`/tr/hesap/atlarim/${horse.id}`} className="hover:text-gold-soft">
                    {horse.name}
                  </Link>
                </h2>
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

              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  ['Kayda git', `/tr/hesap/atlarim/${horse.id}`],
                  ['Sağlık', `/tr/hesap/atlarim/${horse.id}/saglik`],
                  ...(horse.activeListingId
                    ? []
                    : ([['İlan ver', `/tr/hesap/ilan-ver?horse=${horse.id}`]] as [string, string][])),
                ].map(([label, href]) => (
                  <Link
                    key={href}
                    href={href}
                    className="rounded-md border border-border px-4 py-2 text-small hover:bg-surface-raised/60"
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
