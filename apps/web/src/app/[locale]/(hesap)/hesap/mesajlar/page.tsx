import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { apiAsOrNull } from '@/lib/authed';
import { readSession } from '@/lib/session';

/** §18.2 S21 — your conversations. */
export const metadata: Metadata = { title: 'Mesajlarım', robots: { index: false } };

interface Conversation {
  id: string;
  contextType: string | null;
  contextTitle: string | null;
  counterpartName: string | null;
  lastMessageAt: string | null;
  lastMessageBody: string | null;
  unread: boolean;
  blocked: boolean;
}

export default async function MessagesPage() {
  if (!(await readSession())) redirect('/tr/giris');

  const conversations = (await apiAsOrNull<Conversation[]>('/conversations')) ?? [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-h1">Mesajlarım</h1>
        <Link href="/tr/hesap" className="text-small text-text-secondary hover:text-brass-text">
          ← Hesabım
        </Link>
      </header>

      {conversations.length === 0 ? (
        <div className="rounded-lg border border-border bg-paper p-10 text-center">
          <p className="font-display text-h3">Henüz mesajın yok</p>
          <p className="text-small text-text-secondary mt-2">
            Bir ilana soru sorduğunda ya da biri senin ilanına yazdığında konuşma burada
            açılır.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-paper">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link
                href={`/tr/hesap/mesajlar/${conversation.id}`}
                className="block px-5 py-4 hover:bg-sand/40"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-display text-h3">
                    {conversation.counterpartName ?? 'Silinmiş kullanıcı'}
                  </p>
                  {conversation.unread ? (
                    <span className="rounded-full bg-brass/15 px-3 py-1 text-caption text-text-leather">
                      Okunmadı
                    </span>
                  ) : null}
                </div>

                {conversation.contextTitle ? (
                  <p className="text-caption text-text-muted mt-1">
                    {conversation.contextTitle}
                  </p>
                ) : null}

                <p className="text-small text-text-secondary mt-2 line-clamp-1">
                  {conversation.lastMessageBody ?? '—'}
                </p>

                {conversation.blocked ? (
                  <p className="text-caption text-text-muted mt-2">
                    Bu konuşma engelleme nedeniyle salt okunur.
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
