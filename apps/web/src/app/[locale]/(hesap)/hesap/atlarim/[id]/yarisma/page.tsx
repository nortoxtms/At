import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { addCompetition } from '../../../../actions-horses';
import { ActionForm } from '@/components/ActionForm';
import { getDisciplines } from '@/lib/api';
import { readSession } from '@/lib/session';

/**
 * §18.2 S13 — add a competition result.
 *
 * Only the date and the event name are required. Most of what people want to
 * record is "üçüncü oldu, Bursa, 2019": a form demanding class, level, score
 * and a registered rider would record none of it, and an empty results section
 * is what makes a five-year-old horse look untried.
 *
 * The rider is free text for the same reason — whoever rode it usually has no
 * account here, and refusing the record until they do loses the record.
 */
export const metadata: Metadata = { title: 'Yarışma sonucu ekle', robots: { index: false } };

const FIELD =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-text-primary';

export default async function AddCompetitionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await readSession())) redirect('/tr/giris');

  const { id } = await params;
  const disciplines = await getDisciplines();
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
        <h1 className="font-display text-h1 mt-3">Yarışma sonucu</h1>
        <p className="text-small text-text-secondary mt-2">
          Hatırladığın kadarını yaz. Tarih ve yarışma adı yeterli.
        </p>
      </header>

      <ActionForm action={addCompetition} submitLabel="Kaydet">
        <input type="hidden" name="horseId" value={id} />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-label text-text-secondary uppercase">Tarih</span>
            <input
              name="eventDate"
              type="date"
              required
              defaultValue={today}
              className={`${FIELD} mt-1 tabular`}
            />
          </label>

          <label className="block">
            <span className="text-label text-text-secondary uppercase">Derece</span>
            <input
              name="placing"
              type="number"
              min={1}
              max={999}
              inputMode="numeric"
              className={`${FIELD} mt-1 tabular`}
            />
          </label>
        </div>

        <label className="block">
          <span className="text-label text-text-secondary uppercase">Yarışma</span>
          <input
            name="eventName"
            required
            minLength={2}
            maxLength={140}
            placeholder="Bursa Bölge Şampiyonası"
            className={`${FIELD} mt-1`}
          />
        </label>

        <label className="block">
          <span className="text-label text-text-secondary uppercase">Disiplin</span>
          <select name="discipline" defaultValue="" className={`${FIELD} mt-1`}>
            <option value="">Belirtme</option>
            {disciplines.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-label text-text-secondary uppercase">Kategori</span>
            <input
              name="className"
              maxLength={120}
              placeholder="110 cm genç atlar"
              className={`${FIELD} mt-1`}
            />
          </label>

          <label className="block">
            <span className="text-label text-text-secondary uppercase">Yer</span>
            <input name="location" maxLength={120} className={`${FIELD} mt-1`} />
          </label>
        </div>

        <label className="block">
          <span className="text-label text-text-secondary uppercase">Binici</span>
          <input name="riderName" maxLength={120} className={`${FIELD} mt-1`} />
        </label>
      </ActionForm>
    </main>
  );
}
