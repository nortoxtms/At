import { LISTING_TYPE_LABEL_TR, SEX_LABEL_TR } from '@only-horses/shared-types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { deleteSearch, setSearchFrequency } from '../../actions-saved';
import { apiAsOrNull } from '@/lib/authed';
import { readSession } from '@/lib/session';

/**
 * §18.2 S29 — saved searches, and the §24.5 alerts hung off them.
 *
 * Saving the search *is* subscribing, so the frequency lives on the row and
 * changing it is one submit. A saved search that quietly never notifies is
 * the version of this feature people delete an account over.
 *
 * "Her taramada" rather than "anında": §24.5's sweep runs every five minutes.
 */
export const metadata: Metadata = { title: 'Aramalarım', robots: { index: false } };

interface SavedSearch {
  id: string;
  name: string;
  entity: string;
  query: Record<string, unknown>;
  alert_channel: string[];
  alert_frequency: string;
  last_run_at: string | null;
  created_at: string;
}

const FREQUENCY_LABEL: Record<string, string> = {
  instant: 'Her taramada',
  daily: 'Günlük',
  weekly: 'Haftalık',
  off: 'Kapalı',
};

const ENTITY_LABEL: Record<string, string> = {
  listing: 'İlan',
  service: 'Hizmet',
  job: 'İş',
  product: 'Ürün',
  professional: 'Uzman',
};

/** Turn the stored query back into something a person recognises. */
function describe(query: Record<string, unknown>): string {
  const parts: string[] = [];

  if (typeof query.q === 'string' && query.q) parts.push(`“${query.q}”`);
  if (typeof query.type === 'string') parts.push(LISTING_TYPE_LABEL_TR[query.type] ?? query.type);
  if (typeof query.sex === 'string') parts.push(SEX_LABEL_TR[query.sex] ?? query.sex);
  if (typeof query.region === 'string') parts.push(query.region);
  if (query.maxPriceEur) parts.push(`≤ ${String(query.maxPriceEur)} €`);

  return parts.length > 0 ? parts.join(' · ') : 'Tüm sonuçlar';
}

/** The saved query, back as the URL that produced it. */
function hrefFor(search: SavedSearch): string {
  const base =
    search.entity === 'service'
      ? '/tr/hizmetler'
      : search.entity === 'job'
        ? '/tr/isler'
        : search.entity === 'product'
          ? '/tr/urunler'
          : '/tr/atlar';

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search.query ?? {})) {
    if (value === null || value === undefined || value === '') continue;
    params.set(key, String(value));
  }

  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export default async function SavedSearchesPage() {
  if (!(await readSession())) redirect('/tr/giris');

  const searches = (await apiAsOrNull<SavedSearch[]>('/saved-searches')) ?? [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-h1">Aramalarım</h1>
        <Link href="/tr/hesap" className="text-small text-text-secondary hover:text-gold-soft">
          ← Hesabım
        </Link>
      </header>

      {searches.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center">
          <p className="font-display text-h3">Kayıtlı araman yok</p>
          <p className="text-small text-text-secondary mt-2">
            Bir arama kaydettiğinde ona uyan yeni ilan çıktıkça haber veririz. Aramayı
            kaydetmek, bildirimi açmakla aynı şeydir.
          </p>
          <Link
            href="/tr/atlar"
            className="mt-4 inline-block rounded-md border border-border px-5 py-2 text-small hover:bg-surface-raised/60"
          >
            Aramaya başla
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {searches.map((search) => (
            <li key={search.id} className="rounded-lg border border-border bg-surface p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-h3">
                  <Link href={hrefFor(search)} className="hover:text-gold-soft">
                    {search.name}
                  </Link>
                </h2>
                <span className="rounded-full bg-surface-raised px-3 py-1 text-caption">
                  {ENTITY_LABEL[search.entity] ?? search.entity}
                </span>
              </div>

              <p className="text-small text-text-secondary mt-1">{describe(search.query)}</p>

              <p className="text-caption text-text-secondary mt-3">
                Bildirim: {FREQUENCY_LABEL[search.alert_frequency] ?? search.alert_frequency}
                {search.last_run_at
                  ? ` · son tarama ${new Date(search.last_run_at).toLocaleDateString('tr-TR')}`
                  : ' · henüz taranmadı'}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {Object.keys(FREQUENCY_LABEL)
                  .filter((value) => value !== search.alert_frequency)
                  .map((value) => (
                    <form key={value} action={setSearchFrequency}>
                      <input type="hidden" name="id" value={search.id} />
                      <input type="hidden" name="frequency" value={value} />
                      <button
                        type="submit"
                        className="rounded-md border border-border px-4 py-2 text-small hover:bg-surface-raised/60"
                      >
                        {FREQUENCY_LABEL[value]}
                      </button>
                    </form>
                  ))}

                <form action={deleteSearch}>
                  <input type="hidden" name="id" value={search.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-border px-4 py-2 text-small text-text-secondary hover:bg-surface-raised/60"
                  >
                    Sil
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
