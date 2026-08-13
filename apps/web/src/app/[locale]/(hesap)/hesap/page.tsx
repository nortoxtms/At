import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { signOut } from '../actions';
import { apiAs, apiAsOrNull } from '@/lib/authed';
import { readSession } from '@/lib/session';

/**
 * The account home — §18.2 S26's "Hesap" tab, and the §22 counters that make
 * it worth opening.
 *
 * Every §18.2 screen the spec places in the mobile app is unreachable today,
 * because there is no mobile app (README, "known gaps"). This is the web
 * standing in for the ones that matter most: knowing who you are signed in as,
 * what your verification level is and therefore what you may do, and where
 * your horses and listings went.
 */
export const metadata: Metadata = {
  title: 'Hesabım',
  robots: { index: false },
};

interface Me {
  id: string;
  handle: string;
  displayName: string;
  email: string;
  verificationLevel: string;
  trustScore: number;
  city: string | null;
  region: string | null;
  countryCode: string;
  locale: string;
  roles: unknown[];
}

interface Dashboard {
  horses: number;
  activeListings: number;
  draftListings: number;
  unreadNotifications: number;
  savedItems: number;
  pendingAccessRequests: number;
  dueReminders: number;
}

const VERIFICATION_LABEL: Record<string, string> = {
  none: 'Doğrulanmamış',
  email_verified: 'E-posta doğrulandı',
  identity_verified: 'Kimlik doğrulandı',
  professional_verified: 'Meslek doğrulandı',
  business_verified: 'İşletme doğrulandı',
};

export default async function AccountPage() {
  if (!(await readSession())) redirect('/tr/giris');

  const profile = await apiAs<Me>('/me');

  // A 401 here means the refresh also failed — the session is genuinely over,
  // so send them to sign in rather than rendering an empty account.
  if (!profile.ok) {
    if (profile.error.code === 'UNAUTHORIZED') redirect('/tr/giris');

    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="font-display text-h1">Hesabım</h1>
        <p className="text-small text-text-secondary mt-4">{profile.error.message}</p>
      </main>
    );
  }

  const me = profile.data;
  const dashboard = await apiAsOrNull<Dashboard>('/me/dashboard');
  const verified = me.verificationLevel !== 'none' && me.verificationLevel !== 'email_verified';

  const counters: [string, number, string | null][] = [
    ['Atlarım', dashboard?.horses ?? 0, '/tr/hesap/atlarim'],
    ['Aktif ilan', dashboard?.activeListings ?? 0, '/tr/hesap/ilanlarim'],
    ['Taslak ilan', dashboard?.draftListings ?? 0, '/tr/hesap/ilanlarim'],
    ['Kaydedilenler', dashboard?.savedItems ?? 0, null],
    ['Okunmamış bildirim', dashboard?.unreadNotifications ?? 0, null],
    ['Yaklaşan hatırlatma', dashboard?.dueReminders ?? 0, null],
  ];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-h1">{me.displayName}</h1>
          <p className="text-small text-text-secondary mt-1">
            @{me.handle} · {me.email}
          </p>
        </div>

        <form action={signOut}>
          <button
            type="submit"
            className="rounded-md border border-border px-4 py-2 text-small hover:bg-sand/40"
          >
            Çıkış yap
          </button>
        </form>
      </header>

      <section className="mt-8 rounded-lg border border-border bg-paper p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-label text-text-muted uppercase">Doğrulama</p>
            <p className="font-display text-h3 mt-1">
              {VERIFICATION_LABEL[me.verificationLevel] ?? me.verificationLevel}
            </p>
          </div>
          <div className="text-right">
            <p className="text-label text-text-muted uppercase">Güven puanı</p>
            <p className="font-display text-h3 tabular mt-1">{me.trustScore}</p>
          </div>
        </div>

        {/*
          §3.3 is the one rule worth putting on the account page: publishing is
          gated on identity verification, it cannot be bought, and a seller who
          does not know that reads an empty listing form as a broken one.
        */}
        {verified ? null : (
          <p className="text-small text-text-secondary mt-4 border-t border-border pt-4">
            İlan yayınlamak için kimlik doğrulaması gerekir. Bu hiçbir planla satın
            alınamaz — ücretsiz hesapta da, Business planda da aynı koşuldur.
          </p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-display text-h2 mb-4">Özet</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {counters.map(([label, value, href]) => {
            const card = (
              <div className="h-full rounded-lg border border-border bg-paper p-4">
                <p className="text-label text-text-muted uppercase">{label}</p>
                <p className="font-display text-h2 tabular mt-1">{value}</p>
              </div>
            );

            return (
              <li key={label}>
                {href ? (
                  <Link href={href} className="block h-full hover:border-brass">
                    {card}
                  </Link>
                ) : (
                  card
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-h2 mb-4">Hesap</h2>
        <ul className="divide-y divide-border rounded-lg border border-border bg-paper">
          {[
            ['Atlarım', '/tr/hesap/atlarim'],
            ['İlanlarım', '/tr/hesap/ilanlarim'],
            ['Mesajlarım', '/tr/hesap/mesajlar'],
            ['Planlar ve faturalama', '/tr/fiyatlandirma'],
          ].map(([label, href]) => (
            <li key={href}>
              <Link
                href={href}
                className="flex items-center justify-between px-5 py-4 text-body hover:bg-sand/40"
              >
                {label}
                <span aria-hidden="true" className="text-text-muted">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
