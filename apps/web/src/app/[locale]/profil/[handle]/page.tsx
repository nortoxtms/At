import { ROLE_LABEL_TR, VERIFICATION_LABEL_TR } from '@only-horses/shared-types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getProfile } from '@/lib/api';

/**
 * §18.2 S23 — the public profile.
 *
 * Public and indexable, unlike everything under `(hesap)`: §19.2 makes the web
 * the acquisition channel, and a seller's page is one of the few things a
 * buyer searches for by name. The counters are the ones §12 actually computes
 * — review count, average, response rate — rather than invented signals that
 * would read as trust the platform has not measured.
 */
export const revalidate = 300;

interface Props {
  params: Promise<{ handle: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getProfile(handle);

  if (!profile) return { title: 'Profil bulunamadı' };

  return {
    title: profile.displayName,
    description:
      profile.bio ??
      `${profile.displayName} — ONLY HORSES üzerinde ${
        profile.city ?? profile.region ?? 'Türkiye'
      }.`,
  };
}

function percent(value: number | null): string | null {
  return value === null ? null : `%${Math.round(value * 100)}`;
}

export default async function PublicProfilePage({ params }: Props) {
  const { handle } = await params;
  const profile = await getProfile(handle);

  if (!profile) notFound();

  const reviewCount = Number(profile.reviewCount ?? 0);
  const average =
    profile.reviewAverage === null || profile.reviewAverage === undefined
      ? null
      : Number(profile.reviewAverage);

  const stats: [string, string][] = [
    ['Değerlendirme', String(reviewCount)],
    ['Puan', average === null ? '—' : average.toFixed(1)],
    ['Yanıt oranı', percent(profile.responseRate) ?? '—'],
    [
      'Yanıt süresi',
      profile.responseTimeMins === null ? '—' : `${profile.responseTimeMins} dk`,
    ],
  ];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <h1 className="font-display text-h1">{profile.displayName}</h1>
        <p className="text-small text-text-secondary mt-1">
          @{profile.handle}
          {profile.city ? ` · ${profile.city}` : ''}
          {profile.region && profile.region !== profile.city ? `, ${profile.region}` : ''}
        </p>
        <p className="text-caption text-text-secondary mt-2">
          {VERIFICATION_LABEL_TR[profile.verificationLevel] ?? profile.verificationLevel}
          {' · '}
          {new Date(profile.createdAt).getFullYear()} yılından beri üye
        </p>
      </header>

      {(profile.roles ?? []).length > 0 ? (
        <ul className="mb-8 flex flex-wrap gap-2">
          {profile.roles.map((entry) => (
            <li
              key={entry.role}
              className="rounded-full border border-border px-3 py-1 text-small text-text-secondary"
            >
              {ROLE_LABEL_TR[entry.role] ?? entry.role}
            </li>
          ))}
        </ul>
      ) : null}

      {profile.bio ? <p className="text-body mb-8 max-w-2xl">{profile.bio}</p> : null}

      <dl className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-surface p-4">
            <dt className="text-label text-text-secondary uppercase">{label}</dt>
            <dd className="font-display text-h2 tabular mt-1">{value}</dd>
          </div>
        ))}
      </dl>

      {(profile.trustChips ?? []).length > 0 ? (
        <section className="mb-8">
          <h2 className="font-display text-h2 mb-3">Güven işaretleri</h2>
          <ul className="flex flex-wrap gap-2">
            {profile.trustChips.map((chip) => (
              <li
                key={chip}
                className="rounded-full border border-gold-muted px-3 py-1 text-small"
              >
                {chip}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="mt-12 border-t border-border pt-6">
        <p className="text-caption text-text-secondary">
          Mesaj göndermek için{' '}
          <Link href="/tr/giris" className="underline">
            giriş yap
          </Link>
          . ONLY HORSES bir aracı platformdur ve bu hesabın beyanlarının tarafı
          değildir.
        </p>
      </footer>
    </main>
  );
}
