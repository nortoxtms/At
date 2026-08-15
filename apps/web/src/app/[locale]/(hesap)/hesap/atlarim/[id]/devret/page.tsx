import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { transferHorse } from '../../../../actions-horses';
import { ActionForm } from '@/components/ActionForm';
import { readSession } from '@/lib/session';

/**
 * §6 — hand the record to the new owner.
 *
 * This is the mechanism the whole registry rests on: a horse that changes
 * hands and leaves its history behind is a horse with no history, and after
 * two sales the five-year record §1.2 is built on does not exist.
 *
 * Two rules make it safe to do by e-mail. The buyer usually has no account
 * yet, and refusing until they sign up is how the record gets abandoned at
 * exactly the moment it matters. And the price is private unless explicitly
 * published — §6 records it for provenance, not for publication, and a sale
 * price on a public timeline is a thing sellers would rather lie about than
 * disclose.
 */
export const metadata: Metadata = { title: 'Sahipliği devret', robots: { index: false } };

const FIELD =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-text-primary';

export default async function TransferHorsePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await readSession())) redirect('/tr/giris');

  const { id } = await params;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <header className="mb-8">
        <Link
          href={`/tr/hesap/atlarim/${id}`}
          className="text-small text-text-secondary hover:text-gold-soft"
        >
          ← At kaydı
        </Link>
        <h1 className="font-display text-h1 mt-3">Sahipliği devret</h1>
      </header>

      <div className="mb-8 rounded-lg border border-gold-muted bg-surface p-5">
        <p className="text-small text-text-primary">
          Devrettiğinde bu kayıt alıcıya geçer ve geçmişi onunla birlikte gider — aşılar,
          nalbant, yarışmalar, önceki sahipler. Sen bu attaki kayıtları düzenleyemez
          olursun; geçmişteki payın kayıtta kalır.
        </p>
      </div>

      <ActionForm
        action={transferHorse}
        submitLabel="Devri başlat"
        note="Alıcının hesabı yoksa e-postasına davet gider. Kabul edene kadar kayıt sende kalır."
      >
        <input type="hidden" name="horseId" value={id} />

        <label className="block">
          <span className="text-label text-text-secondary uppercase">Alıcının e-postası</span>
          <input
            name="toEmail"
            type="email"
            required
            autoComplete="off"
            className={`${FIELD} mt-1`}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-label text-text-secondary uppercase">Devir tarihi</span>
            <input
              name="date"
              type="date"
              required
              defaultValue={today}
              className={`${FIELD} mt-1 tabular`}
            />
          </label>

          <label className="block">
            <span className="text-label text-text-secondary uppercase">Satış bedeli (₺)</span>
            <input
              name="price"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              className={`${FIELD} mt-1 tabular`}
            />
          </label>
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4">
          <input type="checkbox" name="pricePublic" className="mt-1" />
          <span>
            <span className="text-small text-text-primary block">
              Bedeli geçmişte herkese göster
            </span>
            <span className="text-caption text-text-secondary block mt-1">
              Varsayılan kapalı. Kapalıyken bedel yalnızca kayıtta tutulur, kimseye
              gösterilmez.
            </span>
          </span>
        </label>
      </ActionForm>
    </main>
  );
}
