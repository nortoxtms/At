import { DISCIPLINE_LABEL_TR, SEX_LABEL_TR } from '@only-horses/shared-types';
import type { TimelineEntry } from '@only-horses/shared-types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { HorseTimeline, toTimelineEntry } from '@/components/HorseTimeline';
import { apiAsOrNull } from '@/lib/authed';
import { readSession } from '@/lib/session';

/**
 * §18.2 S11 — the horse record, with §20.4's timeline on it.
 *
 * Not "the listing for a horse". A horse lives here with no listing, no price
 * and no buyer, and everything a listing needs is derived from this record —
 * which is why "İlan ver" on this page carries the horse with it rather than
 * opening an empty form.
 *
 * `/horses/:id` answers in snake_case while `/me/horses` answers in camelCase;
 * they are different queries in §12 and reading one with the other's keys is
 * how every field on this page once rendered blank.
 */
export const metadata: Metadata = { title: 'At kaydı', robots: { index: false } };

interface HorseRecord {
  id: string;
  slug: string | null;
  name: string;
  sex: string;
  date_of_birth: string | null;
  height_cm: number | string | null;
  color: string | null;
  breed_name_tr: string | null;
  disciplines: string[] | null;
  passport_number: string | null;
  microchip_number: string | null;
  about: string | null;
  current_country: string | null;
  cover_blurhash: string | null;
}

interface MediaRow {
  media_id: string;
  url?: string | null;
  category: string;
  visibility: string;
}

export default async function HorseRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await readSession())) redirect('/tr/giris');

  const { id } = await params;
  const path = encodeURIComponent(id);

  const [horse, timeline, media] = await Promise.all([
    apiAsOrNull<HorseRecord>(`/horses/${path}`),
    apiAsOrNull<TimelineEntry[]>(`/horses/${path}/timeline`),
    apiAsOrNull<MediaRow[]>(`/horses/${path}/media`),
  ]);

  if (!horse) notFound();

  const birthYear = horse.date_of_birth ? Number(horse.date_of_birth.slice(0, 4)) : null;
  const age = birthYear ? Math.max(0, new Date().getFullYear() - birthYear) : null;
  const photos = (media ?? []).filter((row) => row.url);

  const facts: [string, string | null][] = [
    ['Cinsiyet', SEX_LABEL_TR[horse.sex] ?? horse.sex],
    ['Yaş', age === null ? null : `${age}`],
    ['Irk', horse.breed_name_tr],
    // numeric(4,1) arrives as "156.0"; a horse is measured to the centimetre
    // and "156.0 cm" reads like a precision nobody claimed.
    ['Cidago', horse.height_cm ? `${Number(horse.height_cm)} cm` : null],
    ['Don', horse.color],
    ['Pasaport', horse.passport_number],
    ['Mikroçip', horse.microchip_number],
    ['Ülke', horse.current_country],
  ];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <Link
          href="/tr/hesap/atlarim"
          className="text-small text-text-secondary hover:text-gold-soft"
        >
          ← Atlarım
        </Link>
        <h1 className="font-display text-h1 mt-3">{horse.name}</h1>
        <p className="text-small text-text-secondary mt-1">
          {[
            SEX_LABEL_TR[horse.sex] ?? horse.sex,
            age === null ? null : `${age} yaşında`,
            horse.breed_name_tr,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </header>

      {photos.length > 0 ? (
        <ul className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo) => (
            <li key={photo.media_id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url ?? ''}
                alt={`${horse.name} fotoğrafı`}
                className="aspect-[4/3] w-full rounded-md border border-border object-cover"
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-8 rounded-lg border border-border bg-surface p-5 text-small text-text-secondary">
          Bu kayıtta henüz fotoğraf yok. Fotoğraf yüklemek mobil uygulamada —
          tarayıcıdan yükleme henüz açık değil.
        </p>
      )}

      {(horse.disciplines?.length ?? 0) > 0 ? (
        <ul className="mb-8 flex flex-wrap gap-2">
          {horse.disciplines?.map((code) => (
            <li
              key={code}
              className="rounded-full border border-border px-3 py-1 text-small text-text-secondary"
            >
              {DISCIPLINE_LABEL_TR[code] ?? code}
            </li>
          ))}
        </ul>
      ) : null}

      <section className="mb-8 rounded-lg border border-border bg-surface p-5">
        <h2 className="font-display text-h2 mb-4">Künye</h2>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {facts
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3">
                <dt className="text-small text-text-secondary">{label}</dt>
                <dd className="text-small text-text-primary">{value}</dd>
              </div>
            ))}
        </dl>

        {horse.about ? (
          <p className="text-small text-text-primary mt-5 border-t border-border pt-5">
            {horse.about}
          </p>
        ) : null}
      </section>

      <nav className="mb-8 flex flex-wrap gap-2">
        {[
          ['Sağlık kaydı', `/tr/hesap/atlarim/${horse.id}/saglik`],
          ['Sağlık kaydı ekle', `/tr/hesap/atlarim/${horse.id}/saglik/yeni`],
          ['Yarışma sonucu ekle', `/tr/hesap/atlarim/${horse.id}/yarisma`],
          ['Sahipliği devret', `/tr/hesap/atlarim/${horse.id}/devret`],
          ['İlan ver', `/tr/hesap/ilan-ver?horse=${horse.id}`],
        ].map(([label, href]) => (
          <Link
            key={href}
            href={href}
            className="rounded-md border border-border px-4 py-2 text-small hover:bg-surface-raised/60"
          >
            {label}
          </Link>
        ))}
      </nav>

      <section>
        <h2 className="font-display text-h2 mb-4">Geçmiş</h2>
        {timeline && timeline.length > 0 ? (
          <HorseTimeline entries={timeline.map(toTimelineEntry)} />
        ) : (
          <p className="rounded-lg border border-border bg-surface p-5 text-small text-text-secondary">
            Bu kaydın geçmişi henüz boş. Aşı, nalbant, yarışma — ne eklersen bu çizgide
            görünür ve ilan verdiğinde alıcının gördüğü şey bu olur.
          </p>
        )}
      </section>
    </main>
  );
}
