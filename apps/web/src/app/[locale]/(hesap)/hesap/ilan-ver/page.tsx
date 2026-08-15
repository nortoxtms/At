import { LISTING_TYPE_LABEL_TR } from '@only-horses/shared-types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createListing } from '../../actions-listings';
import { ActionForm } from '@/components/ActionForm';
import { apiAsOrNull } from '@/lib/authed';
import { readSession } from '@/lib/session';

/**
 * §18.2 S13 — compose a listing.
 *
 * A listing derives from a horse record (§1.3 P1), so this opens on the list
 * of horses rather than on an empty title field. No horses means no listing,
 * and the page says so and links to the wizard instead of rendering a form
 * whose first select is empty.
 *
 * It saves a draft. §5 makes publishing a separate decision, and a composer
 * that publishes on submit is one people back out of halfway.
 */
export const metadata: Metadata = { title: 'İlan ver', robots: { index: false } };

const FIELD =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-text-primary';

interface MyHorse {
  id: string;
  name: string;
  breedName: string | null;
  activeListingId: string | null;
}

interface Me {
  verificationLevel: string;
}

const TYPES = ['sale', 'lease', 'half_lease', 'share', 'stud', 'loan'] as const;

export default async function ComposeListingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await readSession())) redirect('/tr/giris');

  const [horses, me, query] = await Promise.all([
    apiAsOrNull<MyHorse[]>('/me/horses'),
    apiAsOrNull<Me>('/me'),
    searchParams,
  ]);

  const preselected = Array.isArray(query.horse) ? query.horse[0] : query.horse;
  const rows = horses ?? [];

  // §3.3: publishing is gated on identity verification and cannot be bought.
  // Saying so before the form is the difference between a rule and a rejection.
  const verified =
    me !== null &&
    me.verificationLevel !== 'none' &&
    me.verificationLevel !== 'email_verified';

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <header className="mb-8">
        <Link href="/tr/hesap" className="text-small text-text-secondary hover:text-gold-soft">
          ← Hesabım
        </Link>
        <h1 className="font-display text-h1 mt-3">İlan ver</h1>
        <p className="text-small text-text-secondary mt-2">
          İlan bir attan türer. Kaydı olmayan bir atı satışa çıkaramazsın.
        </p>
      </header>

      {verified ? null : (
        <div className="mb-8 rounded-lg border border-gold-muted bg-surface p-5">
          <p className="text-small text-text-primary">
            Taslak kaydedebilirsin, ama yayınlamak için kimlik doğrulaması gerekir. Bu
            hiçbir planla satın alınamaz.
          </p>
          <Link
            href="/tr/hesap/dogrulama"
            className="mt-3 inline-block rounded-md border border-border px-4 py-2 text-small hover:bg-surface-raised/60"
          >
            Doğrulamaya bak
          </Link>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center">
          <p className="font-display text-h3">Önce bir at kaydet</p>
          <p className="text-small text-text-secondary mt-2">
            İlan, at kaydından türer — böylece sattığında geçmişi alıcıya geçer ve her
            ilanda aynı bilgileri yeniden yazmazsın.
          </p>
          <Link
            href="/tr/hesap/atlarim/yeni"
            className="mt-4 inline-block rounded-md bg-gold-soft px-5 py-2 text-small font-medium text-text-on-gold"
          >
            At ekle
          </Link>
        </div>
      ) : (
        <ActionForm
          action={createListing}
          submitLabel="Taslağı kaydet"
          note="Taslak olarak kaydedilir. Yayına almak İlanlarım'dan ayrı bir adım."
        >
          <label className="block">
            <span className="text-label text-text-secondary uppercase">Hangi at?</span>
            <select
              name="horseId"
              required
              defaultValue={preselected ?? ''}
              className={`${FIELD} mt-1`}
            >
              <option value="" disabled>
                Seç
              </option>
              {rows.map((horse) => (
                <option key={horse.id} value={horse.id}>
                  {horse.name}
                  {horse.breedName ? ` — ${horse.breedName}` : ''}
                  {horse.activeListingId ? ' (ilanda)' : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-label text-text-secondary uppercase">İlan türü</span>
            <select name="type" defaultValue="sale" className={`${FIELD} mt-1`}>
              {TYPES.map((value) => (
                <option key={value} value={value}>
                  {LISTING_TYPE_LABEL_TR[value] ?? value}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-label text-text-secondary uppercase">Başlık</span>
            <input
              name="title"
              required
              minLength={8}
              maxLength={140}
              className={`${FIELD} mt-1`}
            />
          </label>

          <label className="block">
            <span className="text-label text-text-secondary uppercase">Açıklama</span>
            <textarea
              name="description"
              required
              rows={7}
              minLength={40}
              maxLength={8000}
              placeholder="Kime uygun, ne yapabiliyor, neyi yapamıyor. Alıcının ilk okuduğu şey bu."
              className={`${FIELD} mt-1`}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-label text-text-secondary uppercase">Fiyat (₺)</span>
              <input
                name="priceAmount"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                className={`${FIELD} mt-1 tabular`}
              />
              <span className="text-caption text-text-secondary mt-1 block">
                Boş bırakırsan &ldquo;fiyat sorunuz&rdquo; olur.
              </span>
            </label>

            <label className="block">
              <span className="text-label text-text-secondary uppercase">Fiyat tipi</span>
              <select name="priceType" defaultValue="fixed" className={`${FIELD} mt-1`}>
                <option value="fixed">Sabit</option>
                <option value="negotiable">Pazarlık payı var</option>
                <option value="on_request">Fiyat sorunuz</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-label text-text-secondary uppercase">Şehir</span>
            <input name="city" maxLength={120} className={`${FIELD} mt-1`} />
          </label>

          <fieldset className="space-y-3 rounded-lg border border-border bg-surface p-4">
            <legend className="text-label text-text-secondary uppercase px-1">
              Alıcıya açık
            </legend>

            <label className="flex items-start gap-3">
              <input type="checkbox" name="trialAllowed" defaultChecked className="mt-1" />
              <span className="text-small">Deneme binişine açığım</span>
            </label>

            <label className="flex items-start gap-3">
              <input type="checkbox" name="ppeWelcome" defaultChecked className="mt-1" />
              <span className="text-small">
                Satın alma öncesi veteriner muayenesine açığım
              </span>
            </label>

            <label className="flex items-start gap-3">
              <input type="checkbox" name="transportHelp" className="mt-1" />
              <span className="text-small">Nakliyede yardımcı olabilirim</span>
            </label>
          </fieldset>
        </ActionForm>
      )}
    </main>
  );
}
