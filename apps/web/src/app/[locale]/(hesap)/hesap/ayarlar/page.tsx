import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { signOut } from '../../actions';
import {
  cancelErasure,
  requestErasure,
  requestExport,
  updateProfile,
} from '../../actions-profile';
import { ActionForm } from '@/components/ActionForm';
import { apiAsOrNull } from '@/lib/authed';
import { readSession } from '@/lib/session';

/**
 * §18.2 S25 — settings.
 *
 * Sign out is ordinary; deleting an account is not, and putting them in the
 * same list is how people press the wrong one. Deletion lives at the bottom,
 * behind its own heading, and says what happens to the horse records — §6 does
 * not delete them, the identity record survives the account that created it,
 * and a person deserves to know that before pressing rather than after.
 */
export const metadata: Metadata = { title: 'Ayarlar', robots: { index: false } };

const FIELD =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-text-primary';

interface Me {
  displayName: string;
  handle: string;
  email: string;
  city: string | null;
  region: string | null;
  locale: string;
}

interface DataRequest {
  id: string;
  kind: string;
  status: string;
  due_at: string | null;
}

export default async function SettingsPage() {
  if (!(await readSession())) redirect('/tr/giris');

  const [me, requests] = await Promise.all([
    apiAsOrNull<Me>('/me'),
    apiAsOrNull<DataRequest[]>('/me/data-requests'),
  ]);

  if (!me) redirect('/tr/giris');

  const pending = (requests ?? []).filter((request) => request.status === 'pending');
  const pendingExport = pending.find((request) => request.kind === 'export') ?? null;
  const pendingDeletion = pending.find((request) => request.kind === 'delete') ?? null;

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <header className="mb-8">
        <Link href="/tr/hesap" className="text-small text-text-secondary hover:text-gold-soft">
          ← Hesabım
        </Link>
        <h1 className="font-display text-h1 mt-3">Ayarlar</h1>
      </header>

      <section className="mb-10">
        <h2 className="font-display text-h2 mb-4">Profil</h2>

        <ActionForm action={updateProfile} submitLabel="Kaydet">
          <label className="block">
            <span className="text-label text-text-secondary uppercase">Görünen ad</span>
            <input
              name="displayName"
              required
              minLength={2}
              maxLength={80}
              defaultValue={me.displayName}
              className={`${FIELD} mt-1`}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-label text-text-secondary uppercase">İl</span>
              <input
                name="region"
                maxLength={120}
                defaultValue={me.region ?? ''}
                className={`${FIELD} mt-1`}
              />
            </label>

            <label className="block">
              <span className="text-label text-text-secondary uppercase">Şehir</span>
              <input
                name="city"
                maxLength={120}
                defaultValue={me.city ?? ''}
                className={`${FIELD} mt-1`}
              />
            </label>
          </div>

          <label className="block">
            <span className="text-label text-text-secondary uppercase">Dil</span>
            <select name="locale" defaultValue={me.locale} className={`${FIELD} mt-1`}>
              <option value="tr">Türkçe</option>
              <option value="en">English</option>
            </select>
          </label>
        </ActionForm>
      </section>

      <section className="mb-10">
        <h2 className="font-display text-h2 mb-4">Hesap</h2>
        <dl className="divide-y divide-border rounded-lg border border-border bg-surface">
          <div className="flex items-baseline justify-between gap-3 px-5 py-4">
            <dt className="text-small text-text-secondary">Kullanıcı adı</dt>
            <dd className="text-small">@{me.handle}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 px-5 py-4">
            <dt className="text-small text-text-secondary">E-posta</dt>
            <dd className="text-small">{me.email}</dd>
          </div>
        </dl>

        <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface">
          {[
            ['Doğrulama', '/tr/hesap/dogrulama'],
            ['Bildirimler', '/tr/hesap/bildirimler'],
            ['Planlar ve faturalama', '/tr/fiyatlandirma'],
            ['Gizlilik Politikası', '/tr/gizlilik'],
          ].map(([label, href]) => (
            <li key={href}>
              <Link
                href={href}
                className="flex items-center justify-between px-5 py-4 text-body hover:bg-surface-raised/60"
              >
                {label}
                <span aria-hidden="true" className="text-text-secondary">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <form action={signOut} className="mt-4">
          <button
            type="submit"
            className="rounded-md border border-border px-5 py-2 text-small hover:bg-surface-raised/60"
          >
            Çıkış yap
          </button>
        </form>
      </section>

      <section className="mb-10">
        <h2 className="font-display text-h2 mb-4">Verilerim</h2>

        <div className="rounded-lg border border-border bg-surface p-5">
          <p className="text-small text-text-secondary">
            Platformun senin hakkında tuttuğu her şeyi tek bir JSON dosyası olarak
            indirebilirsin — profil, ilanlar, at kayıtları, mesajlar, fotoğraflar.
            Hazırlanması 24 saati bulabilir.
          </p>

          {pendingExport ? (
            <p className="text-small text-text-primary mt-4">
              Talebin alındı. Hazır olduğunda bildirim göndereceğiz.
            </p>
          ) : (
            <div className="mt-4">
              <ActionForm action={requestExport} submitLabel="Verilerimi hazırla">
                <span className="sr-only">Veri dışa aktarma talebi</span>
              </ActionForm>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-danger/50 bg-surface p-5">
        <h2 className="font-display text-h3">Hesabı sil</h2>
        <p className="text-small text-text-secondary mt-2">
          İlanların kapatılır, profilin kaldırılır ve mesajlarında adın anonimleştirilir.
          At kayıtları silinmez — bir atın kimliği onu kaydeden hesaptan bağımsızdır ve
          geçmişi sonraki sahiplerine geçer; sahiplik satırında adın kalır.
        </p>
        <p className="text-small text-text-secondary mt-2">
          Silme hemen olmaz: talep 30 gün sonra işlenir ve o zamana kadar iptal
          edebilirsin.
        </p>

        {pendingDeletion ? (
          <div className="mt-5">
            <p className="text-small text-text-primary">
              Silme talebin işleme alındı
              {pendingDeletion.due_at
                ? ` — ${new Date(pendingDeletion.due_at).toLocaleDateString('tr-TR')} tarihinde uygulanacak.`
                : '.'}
            </p>
            <form action={cancelErasure} className="mt-3">
              <button
                type="submit"
                className="rounded-md border border-border px-5 py-2 text-small hover:bg-surface-raised/60"
              >
                Talebi iptal et
              </button>
            </form>
          </div>
        ) : (
          <div className="mt-5">
            <ActionForm action={requestErasure} submitLabel="Silme talebi gönder">
              <label className="block">
                <span className="text-label text-text-secondary uppercase">
                  Onaylamak için SİL yaz
                </span>
                <input
                  name="confirm"
                  autoComplete="off"
                  placeholder="SİL"
                  className={`${FIELD} mt-1`}
                />
              </label>
            </ActionForm>
          </div>
        )}
      </section>
    </main>
  );
}
