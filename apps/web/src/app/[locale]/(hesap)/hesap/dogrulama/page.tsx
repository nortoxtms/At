import { VERIFICATION_LABEL_TR } from '@only-horses/shared-types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { apiAsOrNull } from '@/lib/authed';
import { readSession } from '@/lib/session';

/**
 * §18.2 S27 — verification (§3.3).
 *
 * The ladder is shown whole with your rung marked, because the rule people get
 * wrong is that a paid plan buys a level. It does not, and saying so once here
 * saves the support conversation that otherwise happens right after someone
 * upgrades in order to publish.
 *
 * The provider is not wired: §17 needs a KYC provider with credentials this
 * repository must not carry. The page says that, rather than opening a flow
 * that dead-ends on a button.
 */
export const metadata: Metadata = { title: 'Doğrulama', robots: { index: false } };

interface Me {
  verificationLevel: string;
  trustScore: number;
}

const ORDER = [
  'none',
  'email_verified',
  'identity_verified',
  'professional_verified',
  'business_verified',
];

const LADDER: { id: string; body: string }[] = [
  { id: 'email_verified', body: 'E-postanı doğrula — kaydolurken yapılır.' },
  {
    id: 'identity_verified',
    body: 'Kimliğini doğrula — ilan yayınlamak için gereken seviye.',
  },
  {
    id: 'professional_verified',
    body: 'Meslek belgesi — veteriner, nalbant ve eğitmenler için.',
  },
  { id: 'business_verified', body: 'İşletme kaydı — ahır, kulüp ve hara hesapları için.' },
];

export default async function VerificationPage() {
  if (!(await readSession())) redirect('/tr/giris');

  const me = await apiAsOrNull<Me>('/me');
  const level = me?.verificationLevel ?? 'none';
  const current = ORDER.indexOf(level);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-8">
        <Link href="/tr/hesap" className="text-small text-text-secondary hover:text-gold-soft">
          ← Hesabım
        </Link>
        <h1 className="font-display text-h1 mt-3">Doğrulama</h1>
        <p className="text-small text-text-secondary mt-2">
          Şu anki seviyen: {VERIFICATION_LABEL_TR[level] ?? 'Doğrulanmamış'}
          {me ? ` · güven puanı ${me.trustScore}` : ''}
        </p>
      </header>

      <ol className="space-y-3">
        {LADDER.map((rung) => {
          const done = current >= ORDER.indexOf(rung.id);

          return (
            <li
              key={rung.id}
              className={`rounded-lg border bg-surface p-5 ${
                done ? 'border-gold-soft' : 'border-border'
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-h3">
                  {VERIFICATION_LABEL_TR[rung.id] ?? rung.id}
                </h2>
                <span className="text-caption text-text-secondary">
                  {done ? 'Tamamlandı' : 'Bekliyor'}
                </span>
              </div>
              <p className="text-small text-text-secondary mt-2">{rung.body}</p>
            </li>
          );
        })}
      </ol>

      <section className="mt-8 rounded-lg border border-gold-muted bg-surface p-5">
        <h2 className="font-display text-h3">Kimlik doğrulaması henüz açık değil</h2>
        <p className="text-small text-text-secondary mt-2">
          Kimlik doğrulaması bağımsız bir sağlayıcı üzerinden yapılır ve o entegrasyon
          henüz bağlanmadı. Açıldığında buradan başlatabileceksin; şu an başlatılabilir
          bir adım yok.
        </p>
        <p className="text-small text-text-secondary mt-3">
          Doğrulama hiçbir planla satın alınamaz. Ücretsiz hesapta da, Business planda
          da aynı koşuldur — ilan yayınlamanın önkoşulu budur.
        </p>
      </section>
    </main>
  );
}
