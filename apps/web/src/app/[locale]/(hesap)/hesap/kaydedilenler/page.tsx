import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { unsave } from '../../actions-saved';
import { apiAsOrNull } from '@/lib/authed';
import { readSession } from '@/lib/session';

/**
 * §18.2 S19 — saved items, the web half of the mobile app's list.
 *
 * §10 keeps saved items per account, not per device, which is the only reason
 * this page can exist at all: the same list, the same rows, whichever screen
 * you opened it on.
 *
 * `resolve_saved_items` returns listings, services and jobs in one flat set
 * with an `item_type` discriminator, so this renders a generic row rather than
 * a listing card. Filtering it down to listings would hide the saved farrier
 * without ever saying so — and a listing that closed stays on the list,
 * marked, rather than vanishing.
 */
export const metadata: Metadata = { title: 'Kaydedilenler', robots: { index: false } };

interface SavedRow {
  item_type: string;
  item_id: string;
  note: string | null;
  created_at: string | null;
  title: string | null;
  slug: string | null;
  subtitle: string | null;
  is_available: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  listing: 'İlan',
  service: 'Hizmet',
  job: 'İş',
  horse: 'At',
  profile: 'Profil',
  organization: 'İşletme',
};

const HREF: Record<string, (slug: string) => string> = {
  listing: (slug) => `/tr/atlar/${slug}`,
  service: (slug) => `/tr/hizmetler/${slug}`,
  job: (slug) => `/tr/isler/${slug}`,
  product: (slug) => `/tr/urunler/${slug}`,
  profile: (slug) => `/tr/profil/${slug}`,
};

export default async function SavedPage() {
  if (!(await readSession())) redirect('/tr/giris');

  const rows = (await apiAsOrNull<SavedRow[]>('/saved')) ?? [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-h1">Kaydedilenler</h1>
        <Link href="/tr/hesap" className="text-small text-text-secondary hover:text-gold-soft">
          ← Hesabım
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center">
          <p className="font-display text-h3">Henüz bir şey kaydetmedin</p>
          <p className="text-small text-text-secondary mt-2">
            İlan, hizmet, iş — kalp işaretine bastığın her şey burada toplanır ve
            telefonundan da aynı listeyi görürsün.
          </p>
          <Link
            href="/tr/atlar"
            className="mt-4 inline-block rounded-md border border-border px-5 py-2 text-small hover:bg-surface-raised/60"
          >
            İlanlara bak
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const href = row.slug ? HREF[row.item_type]?.(row.slug) : undefined;

            return (
              <li
                key={`${row.item_type}:${row.item_id}`}
                className="rounded-lg border border-border bg-surface p-5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-display text-h3">
                    {href ? (
                      <Link href={href} className="hover:text-gold-soft">
                        {row.title ?? 'Başlıksız'}
                      </Link>
                    ) : (
                      (row.title ?? 'Başlıksız')
                    )}
                  </h2>
                  <span className="rounded-full bg-surface-raised px-3 py-1 text-caption">
                    {TYPE_LABEL[row.item_type] ?? row.item_type}
                  </span>
                </div>

                {row.subtitle ? (
                  <p className="text-small text-text-secondary mt-1">{row.subtitle}</p>
                ) : null}

                {row.note ? (
                  <p className="text-small text-text-primary mt-2 border-l-2 border-gold-muted pl-3">
                    {row.note}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {row.is_available ? null : (
                    <span className="text-caption text-text-secondary">
                      Bu kayıt artık yayında değil.
                    </span>
                  )}

                  <form action={unsave}>
                    <input type="hidden" name="type" value={row.item_type} />
                    <input type="hidden" name="id" value={row.item_id} />
                    <button
                      type="submit"
                      className="rounded-md border border-border px-4 py-2 text-small text-text-secondary hover:bg-surface-raised/60"
                    >
                      Kaydı kaldır
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
