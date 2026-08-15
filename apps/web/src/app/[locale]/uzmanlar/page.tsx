import { ROLE_LABEL_TR, VERIFICATION_LABEL_TR } from '@only-horses/shared-types';
import type { Metadata } from 'next';
import Link from 'next/link';

import { searchProfessionals } from '@/lib/api';

/**
 * §18.2 S22 — the professionals directory.
 *
 * Veterinarians, farriers, trainers, transporters: the people a horse needs
 * and the half of §1.3's market that is not a sale. Public and server-rendered
 * for the same §19.2 reason the listings are — "Bursa nalbant" is a search
 * somebody types, and a client-rendered grid answers it with an empty page.
 *
 * Filtering is a GET form, so a filtered directory is a URL that can be linked
 * and indexed.
 */
export const metadata: Metadata = {
  title: 'Uzmanlar',
  description:
    'Veteriner, nalbant, eğitmen, seyis, nakliyeci — atınla ilgilenen insanlar, bulunduğun ilde.',
};

export const revalidate = 300;

const ROLES = [
  'veterinarian',
  'farrier',
  'trainer',
  'instructor',
  'groom',
  'transporter',
  'equine_therapist',
  'breeder',
] as const;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export default async function ProfessionalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const role = first(query.role);
  const region = first(query.region);
  const q = first(query.q);

  const { hits, total } = await searchProfessionals({ q, role, region, limit: 48 });

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="font-display text-h1">Uzmanlar</h1>
        <p className="text-small text-text-secondary mt-2 max-w-2xl">
          Veteriner, nalbant, eğitmen, seyis, nakliyeci. Bir at almak işin sadece
          başlangıcı — geri kalanını yapan insanlar burada.
        </p>
      </header>

      <form className="mb-6 flex flex-wrap gap-3" role="search">
        {role ? <input type="hidden" name="role" value={role} /> : null}
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="İsim veya uzmanlık"
          className="min-w-[14rem] flex-1 rounded-md border border-border bg-surface px-3 py-2 text-body"
          aria-label="Uzman ara"
        />
        <input
          name="region"
          defaultValue={region ?? ''}
          placeholder="İl"
          className="w-40 rounded-md border border-border bg-surface px-3 py-2 text-body"
          aria-label="İl"
        />
        <button
          type="submit"
          className="rounded-md bg-gold-soft px-5 py-2 text-small font-medium text-text-on-gold"
        >
          Ara
        </button>
      </form>

      <nav className="mb-8 flex flex-wrap gap-2" aria-label="Meslek">
        <Link
          href="/tr/uzmanlar"
          className={`rounded-full border px-4 py-2 text-small ${
            role ? 'border-border' : 'border-gold-soft bg-surface-raised'
          }`}
        >
          Hepsi
        </Link>
        {ROLES.map((value) => (
          <Link
            key={value}
            href={`/tr/uzmanlar?role=${value}`}
            className={`rounded-full border px-4 py-2 text-small ${
              role === value ? 'border-gold-soft bg-surface-raised' : 'border-border'
            }`}
          >
            {ROLE_LABEL_TR[value] ?? value}
          </Link>
        ))}
      </nav>

      <p className="text-caption text-text-secondary mb-4 tabular">{total} uzman</p>

      {hits.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center">
          <p className="font-display text-h3">Bu filtreyle uzman bulunamadı</p>
          <p className="text-small text-text-secondary mt-2">
            Filtreleri gevşetmeyi dene ya da ile göre değil mesleğe göre ara.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {hits.map((person) => (
            <li key={person.id}>
              <Link
                href={`/tr/profil/${person.handle}`}
                className="block h-full rounded-lg border border-border bg-surface p-5 hover:border-gold-muted"
              >
                <h2 className="font-display text-h3">{person.displayName}</h2>

                <p className="text-small text-text-secondary mt-1">
                  {(person.roles ?? [])
                    .map((value) => ROLE_LABEL_TR[value] ?? value)
                    .join(' · ') || 'Uzman'}
                </p>

                {person.headline ? (
                  <p className="text-small text-text-primary mt-3">{person.headline}</p>
                ) : null}

                <p className="text-caption text-text-secondary mt-3">
                  {[
                    person.city ?? person.region,
                    person.yearsExperience ? `${person.yearsExperience} yıl` : null,
                    person.travels ? 'Yerinde hizmet' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>

                <p className="text-caption text-text-secondary mt-2 tabular">
                  {VERIFICATION_LABEL_TR[person.verificationLevel] ??
                    person.verificationLevel}
                  {person.ratingCount > 0
                    ? ` · ${person.ratingAverage?.toFixed(1) ?? '—'} (${person.ratingCount})`
                    : ' · henüz değerlendirilmedi'}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
