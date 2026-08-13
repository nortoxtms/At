import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { sendMessage } from '../../../actions-messages';
import { apiAs, apiAsOrNull } from '@/lib/authed';
import { readSession } from '@/lib/session';

/** §18.2 S22 — one thread. */
export const metadata: Metadata = { title: 'Konuşma', robots: { index: false } };

interface Message {
  id: string;
  sender_id: string | null;
  sender_name: string | null;
  body: string;
  is_system: boolean;
  payment_warning: boolean;
  created_at: string;
}

interface Me {
  id: string;
}

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await readSession())) redirect('/tr/giris');

  const { id } = await params;
  const thread = await apiAs<Message[]>(`/conversations/${encodeURIComponent(id)}`);

  if (!thread.ok) {
    if (thread.error.code === 'UNAUTHORIZED') redirect('/tr/giris');
    // §12 answers NOT_FOUND rather than FORBIDDEN for a thread you are not in,
    // so that a stranger cannot use the status code to learn it exists.
    notFound();
  }

  const me = await apiAsOrNull<Me>('/me');

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-6">
        <Link
          href="/tr/hesap/mesajlar"
          className="text-small text-text-secondary hover:text-brass-text"
        >
          ← Mesajlarım
        </Link>
      </header>

      <ol className="space-y-3">
        {thread.data.map((message) => {
          const mine = me !== null && message.sender_id === me.id;

          if (message.is_system) {
            return (
              <li
                key={message.id}
                className="rounded-lg border border-border bg-sand/40 px-4 py-3 text-caption text-text-secondary"
              >
                {message.body}
              </li>
            );
          }

          return (
            <li
              key={message.id}
              className={`max-w-[85%] rounded-lg border px-4 py-3 ${
                mine
                  ? 'ml-auto border-brass/40 bg-brass/10'
                  : 'border-border bg-paper'
              }`}
            >
              <p className="text-caption text-text-muted">
                {mine ? 'Sen' : (message.sender_name ?? 'Silinmiş kullanıcı')}
              </p>
              <p className="text-body mt-1 whitespace-pre-line">{message.body}</p>

              {/* §14.3: the warning belongs next to the message that triggered it. */}
              {message.payment_warning ? (
                <p className="text-caption text-text-warning mt-2">
                  Bu mesaj platform dışı ödeme isteği içeriyor olabilir. Atı görmeden ödeme
                  yapma.
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>

      <form action={sendMessage} className="mt-6 flex gap-2">
        <input type="hidden" name="id" value={id} />
        <input
          name="body"
          required
          maxLength={4000}
          placeholder="Mesaj yaz…"
          className="flex-1 rounded-md border border-border bg-paper px-3 py-2 text-body text-text-primary"
        />
        <button
          type="submit"
          className="rounded-md bg-ink px-5 py-2 text-small text-text-inverse"
        >
          Gönder
        </button>
      </form>
    </main>
  );
}
