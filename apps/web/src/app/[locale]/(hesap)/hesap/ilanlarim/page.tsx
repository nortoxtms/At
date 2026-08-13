import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { listingAction } from '../../actions-listings';
import { apiAsOrNull } from '@/lib/authed';
import { readSession } from '@/lib/session';

/**
 * §18.2 S14 — your listings, and the four things you can do to one.
 *
 * The lifecycle is §5's, and the buttons follow it rather than offering every
 * verb on every row: a draft publishes, an active listing pauses or closes, a
 * paused one resumes, an expired one renews. Offering "close" on a draft would
 * be offering a state transition the API will refuse.
 */
export const metadata: Metadata = { title: 'İlanlarım', robots: { index: false } };

interface MyListing {
  id: string;
  slug: string;
  title: string;
  status: string;
  type: string;
  price_amount: string | null;
  price_currency: string;
  price_type: string;
  quality_score: number | null;
  view_count: number;
  save_count: number;
  inquiry_count: number;
  published_at: string | null;
  expires_at: string | null;
  is_boosted: boolean;
  horse_name: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Taslak',
  pending_review: 'İncelemede',
  active: 'Yayında',
  paused: 'Duraklatıldı',
  under_offer: 'Teklif alındı',
  sold: 'Satıldı',
  expired: 'Süresi doldu',
  closed: 'Kapatıldı',
  rejected: 'Reddedildi',
};

/** §5's transitions, as the buttons a seller may press from each state. */
const ACTIONS: Record<string, { action: string; label: string }[]> = {
  draft: [{ action: 'publish', label: 'Yayınla' }],
  active: [
    { action: 'pause', label: 'Duraklat' },
    { action: 'close', label: 'Kapat' },
  ],
  paused: [{ action: 'resume', label: 'Yeniden yayınla' }],
  expired: [{ action: 'renew', label: 'Yenile' }],
};

export default async function MyListingsPage() {
  if (!(await readSession())) redirect('/tr/giris');

  const listings = (await apiAsOrNull<MyListing[]>('/me/listings')) ?? [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-h1">İlanlarım</h1>
        <Link href="/tr/hesap" className="text-small text-text-secondary hover:text-brass-text">
          ← Hesabım
        </Link>
      </header>

      {listings.length === 0 ? (
        <div className="rounded-lg border border-border bg-paper p-10 text-center">
          <p className="font-display text-h3">Henüz ilanın yok</p>
          <p className="text-small text-text-secondary mt-2">
            İlan bir attan türer. Önce atı kaydet, sonra satılığa çıkar.
          </p>
          <Link
            href="/tr/hesap/atlarim"
            className="mt-4 inline-block rounded-md border border-border px-5 py-2 text-small hover:bg-sand/40"
          >
            Atlarıma bak
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {listings.map((listing) => (
            <li key={listing.id} className="rounded-lg border border-border bg-paper p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-h3">{listing.title}</h2>
                <span className="rounded-full bg-sand px-3 py-1 text-caption">
                  {STATUS_LABEL[listing.status] ?? listing.status}
                </span>
              </div>

              <p className="text-small text-text-secondary mt-1">
                {listing.horse_name}
                {listing.price_amount
                  ? ` · ${new Intl.NumberFormat('tr-TR', {
                      style: 'currency',
                      currency: listing.price_currency,
                      maximumFractionDigits: 0,
                    }).format(Number(listing.price_amount))}`
                  : ' · Fiyat sorunuz'}
              </p>

              <p className="text-caption text-text-muted mt-3 tabular">
                {listing.view_count} görüntülenme · {listing.save_count} kayıt ·{' '}
                {listing.inquiry_count} mesaj
                {listing.quality_score !== null ? ` · kalite ${listing.quality_score}` : ''}
                {listing.is_boosted ? ' · öne çıkarıldı' : ''}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {listing.status === 'active' ? (
                  <Link
                    href={`/tr/atlar/${listing.slug}`}
                    className="rounded-md border border-border px-4 py-2 text-small hover:bg-sand/40"
                  >
                    İlanı gör
                  </Link>
                ) : null}

                {(ACTIONS[listing.status] ?? []).map(({ action, label }) => (
                  <form key={action} action={listingAction}>
                    <input type="hidden" name="id" value={listing.id} />
                    <input type="hidden" name="action" value={action} />
                    <button
                      type="submit"
                      className="rounded-md border border-border px-4 py-2 text-small hover:bg-sand/40"
                    >
                      {label}
                    </button>
                  </form>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
