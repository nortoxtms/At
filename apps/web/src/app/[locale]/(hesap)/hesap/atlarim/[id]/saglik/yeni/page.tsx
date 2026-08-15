import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { addHealthRecord } from '../../../../../actions-horses';
import { ActionForm } from '@/components/ActionForm';
import { readSession } from '@/lib/session';

/**
 * §18.2 S12 — add a health record.
 *
 * The reminder interval is offered in days rather than as a free date so the
 * next due date the owner sees and the reminder §9 schedules are computed from
 * the same number. `DEFAULT_INTERVAL_DAYS` in shared-types is what the API
 * applies when `nextDueOn` is omitted; these are the same intervals, so the
 * two cannot disagree.
 */
export const metadata: Metadata = { title: 'Sağlık kaydı ekle', robots: { index: false } };

const FIELD =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-text-primary';

const TYPES: [string, string][] = [
  ['vaccination', 'Aşı'],
  ['deworming', 'Parazit'],
  ['farrier', 'Nalbant'],
  ['dental', 'Diş'],
  ['vet_exam', 'Veteriner'],
  ['ppe', 'Satış öncesi muayene'],
  ['injury', 'Yaralanma'],
  ['lameness', 'Topallık'],
  ['xray', 'Röntgen'],
  ['lab_result', 'Laboratuvar'],
  ['medication', 'İlaç'],
  ['surgery', 'Operasyon'],
  ['other', 'Diğer'],
];

const INTERVALS: [string, string][] = [
  ['', 'Yok'],
  ['42', '6 hafta'],
  ['91', '3 ay'],
  ['182', '6 ay'],
  ['365', '1 yıl'],
];

export default async function AddHealthRecordPage({
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
          href={`/tr/hesap/atlarim/${id}/saglik`}
          className="text-small text-text-secondary hover:text-gold-soft"
        >
          ← Sağlık kaydı
        </Link>
        <h1 className="font-display text-h1 mt-3">Kayıt ekle</h1>
      </header>

      <ActionForm
        action={addHealthRecord}
        submitLabel="Kaydet"
        note="Bu kayıt sana özeldir. İlan verirken paylaşmayı seçebilirsin."
      >
        <input type="hidden" name="horseId" value={id} />

        <label className="block">
          <span className="text-label text-text-secondary uppercase">Tür</span>
          <select name="type" defaultValue="vaccination" className={`${FIELD} mt-1`}>
            {TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-label text-text-secondary uppercase">Başlık</span>
          <input
            name="title"
            required
            maxLength={140}
            placeholder="Grip–tetanoz rapel"
            className={`${FIELD} mt-1`}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-label text-text-secondary uppercase">Tarih</span>
            <input
              name="performedOn"
              type="date"
              required
              defaultValue={today}
              className={`${FIELD} mt-1 tabular`}
            />
          </label>

          <label className="block">
            <span className="text-label text-text-secondary uppercase">Hatırlatma</span>
            <select name="intervalDays" defaultValue="" className={`${FIELD} mt-1`}>
              {INTERVALS.map(([value, label]) => (
                <option key={label} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="text-label text-text-secondary uppercase">Not</span>
          <textarea name="notes" rows={4} maxLength={4000} className={`${FIELD} mt-1`} />
        </label>
      </ActionForm>
    </main>
  );
}
