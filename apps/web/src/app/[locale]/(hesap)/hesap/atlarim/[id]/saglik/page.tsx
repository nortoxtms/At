import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { apiAsOrNull } from '@/lib/authed';
import { readSession } from '@/lib/session';

/**
 * §18.2 S12 — the health log.
 *
 * Ordered by date it is an archive; ordered by what is due next it is the
 * reason to open the app, so the overdue and upcoming entries are lifted to
 * the top and the rest reads backwards from today.
 *
 * §8's visibility is stated on the page because owners routinely assume a
 * record they entered is public and are wrong, or assume a buyer can see it
 * and are also wrong. The default is private.
 */
export const metadata: Metadata = { title: 'Sağlık kaydı', robots: { index: false } };

/**
 * camelCase, and with a `typeLabel` already on the row.
 *
 * Unlike `/horses/:id` — which is snake_cased because it comes straight out of
 * the query — this endpoint maps through `toHealthRecord` before answering.
 * Reading it as snake_case compiles, renders every date blank and drops the
 * reminders section entirely, which is exactly how this page shipped the first
 * time.
 */
interface HealthRecord {
  id: string;
  type: string;
  typeLabel: string;
  title: string;
  notes: string | null;
  performedOn: string;
  nextDueOn: string | null;
}

const day = (iso: string): string => new Date(iso).toLocaleDateString('tr-TR');

export default async function HealthLogPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await readSession())) redirect('/tr/giris');

  const { id } = await params;
  const records = (await apiAsOrNull<HealthRecord[]>(`/horses/${encodeURIComponent(id)}/health`)) ?? [];

  const today = new Date().toISOString().slice(0, 10);
  const due = records
    .filter((record) => record.nextDueOn)
    .sort((a, b) => (a.nextDueOn ?? '').localeCompare(b.nextDueOn ?? ''));
  const history = [...records].sort((a, b) => b.performedOn.localeCompare(a.performedOn));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <Link
          href={`/tr/hesap/atlarim/${id}`}
          className="text-small text-text-secondary hover:text-gold-soft"
        >
          ← At kaydı
        </Link>
        <h1 className="font-display text-h1 mt-3">Sağlık kaydı</h1>
        <p className="text-small text-text-secondary mt-2">
          Bu kayıtlar varsayılan olarak sana özeldir. İlan verdiğinde hangilerinin
          görüneceğini sen seçersin.
        </p>
      </header>

      <Link
        href={`/tr/hesap/atlarim/${id}/saglik/yeni`}
        className="mb-8 inline-block rounded-md bg-gold-soft px-5 py-2 text-small font-medium text-text-on-gold"
      >
        Kayıt ekle
      </Link>

      {due.length > 0 ? (
        <section className="mb-8">
          <h2 className="font-display text-h2 mb-4">Sırada</h2>
          <ul className="space-y-2">
            {due.map((record) => {
              const overdue = (record.nextDueOn ?? '') < today;

              return (
                <li
                  key={`due-${record.id}`}
                  className={`rounded-lg border bg-surface px-5 py-4 ${
                    overdue ? 'border-danger/60' : 'border-border'
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-body">{record.title}</p>
                    <span
                      className={`text-caption tabular ${overdue ? 'text-danger' : 'text-text-secondary'}`}
                    >
                      {overdue ? 'Gecikti · ' : ''}
                      {day(record.nextDueOn as string)}
                    </span>
                  </div>
                  <p className="text-caption text-text-secondary mt-1">
                    {record.typeLabel}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="font-display text-h2 mb-4">Geçmiş</h2>

        {history.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-10 text-center">
            <p className="font-display text-h3">Henüz kayıt yok</p>
            <p className="text-small text-text-secondary mt-2">
              Aşı, nalbant, diş, veteriner — girdiğin her kayıt bu atın geçmişine
              yazılır ve satarken alıcıya gösterebileceğin şey olur.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {history.map((record) => (
              <li key={record.id} className="px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-body">{record.title}</p>
                  <span className="text-caption text-text-secondary tabular">
                    {day(record.performedOn)}
                  </span>
                </div>
                <p className="text-caption text-text-secondary mt-1">
                  {record.typeLabel}
                  {record.nextDueOn ? ` · sıradaki ${day(record.nextDueOn)}` : ''}
                </p>
                {record.notes ? (
                  <p className="text-small text-text-secondary mt-2">{record.notes}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
