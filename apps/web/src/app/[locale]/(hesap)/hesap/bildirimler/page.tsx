import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { markAllRead } from '../../actions-notifications';
import { apiAsOrNull } from '@/lib/authed';
import { readSession } from '@/lib/session';

/**
 * §18.2 S20 — notifications (§21).
 *
 * Each row knows where it goes: §21's payload carries the id of the thing
 * that happened, so a health reminder links to that horse's log rather than
 * to the list of horses. A notification you cannot act on from the
 * notification is one that trains people to dismiss the lot.
 *
 * Marking read is a button rather than a side effect of opening the page. The
 * mobile app marks on entry because a phone screen is the whole screen; on the
 * web this page can be a background tab, and a POST fired from a render is a
 * POST fired again by every prefetch and refresh.
 */
export const metadata: Metadata = { title: 'Bildirimler', robots: { index: false } };

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

const TYPE_LABEL: Record<string, string> = {
  message: 'Mesaj',
  listing_published: 'İlan',
  listing_expiring: 'İlan',
  listing_expired: 'İlan',
  health_due: 'Sağlık',
  saved_search: 'Arama',
  review: 'Değerlendirme',
  application: 'Başvuru',
  access_request: 'Erişim',
  verification: 'Doğrulama',
  moderation: 'Moderasyon',
};

/** §21's payloads name the thing; this turns that into a destination. */
function destinationFor(notification: Notification): string | null {
  const data = notification.data ?? {};
  const conversationId = data.conversationId ?? data.threadId;
  const horseId = data.horseId;
  const listingSlug = data.listingSlug ?? data.slug;

  if (typeof conversationId === 'string') return `/tr/hesap/mesajlar/${conversationId}`;
  if (notification.type === 'health_due' && typeof horseId === 'string') {
    return `/tr/hesap/atlarim/${horseId}/saglik`;
  }
  if (typeof horseId === 'string') return `/tr/hesap/atlarim/${horseId}`;
  if (typeof listingSlug === 'string') return `/tr/atlar/${listingSlug}`;
  return null;
}

export default async function NotificationsPage() {
  if (!(await readSession())) redirect('/tr/giris');

  const rows = (await apiAsOrNull<Notification[]>('/notifications?limit=50')) ?? [];
  const unread = rows.filter((row) => !row.readAt).length;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-h1">Bildirimler</h1>
        <Link href="/tr/hesap" className="text-small text-text-secondary hover:text-gold-soft">
          ← Hesabım
        </Link>
      </header>

      {unread > 0 ? (
        <form action={markAllRead} className="mb-6">
          <button
            type="submit"
            className="rounded-md border border-border px-4 py-2 text-small hover:bg-surface-raised/60"
          >
            {unread} bildirimi okundu işaretle
          </button>
        </form>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center">
          <p className="font-display text-h3">Bildirim yok</p>
          <p className="text-small text-text-secondary mt-2">
            Mesaj geldiğinde, ilanının süresi dolmak üzereyken ve kaydettiğin aramaya
            uyan yeni bir ilan çıktığında burada görürsün.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {rows.map((row) => {
            const href = destinationFor(row);

            const content = (
              <div
                className={`px-5 py-4 ${row.readAt ? '' : 'border-l-2 border-gold-soft'}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-body">{row.title}</p>
                  <span className="text-caption text-text-secondary">
                    {TYPE_LABEL[row.type] ?? row.type} ·{' '}
                    {new Date(row.createdAt).toLocaleDateString('tr-TR')}
                  </span>
                </div>
                {row.body ? (
                  <p className="text-small text-text-secondary mt-1">{row.body}</p>
                ) : null}
              </div>
            );

            return (
              <li key={row.id}>
                {href ? (
                  <Link href={href} className="block hover:bg-surface-raised/60">
                    {content}
                  </Link>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
