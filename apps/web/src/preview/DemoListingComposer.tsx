'use client';

import { useMemo, useState } from 'react';

import {
  AUTO_APPROVE_THRESHOLD,
  checkWelfarePolicy,
  computeQualityScore,
  GOOD_LISTING_THRESHOLD,
} from '@only-horses/shared-types';

/**
 * "İlan ver" — §18.2 S10, running the real rules with nothing behind them.
 *
 * Publishing needs an account, an identity check and a database, none of which
 * a static export has. What it does have is the part that decides the outcome:
 * §14.4's welfare policy and §13.2's quality score are pure functions in
 * `@only-horses/shared-types`, unit-tested to 100 %, and they run in a browser
 * exactly as they run in the API.
 *
 * So this form is not a mock-up of the publish screen. Every number and every
 * refusal below is computed by the same code that would decide the real
 * listing — the meter, the §13.1 auto-approve threshold, the specific rule a
 * blocked listing broke. What is missing is the write: nothing is saved, and
 * the form says so rather than pretending to submit.
 */
const DISCIPLINES = [
  'dressage',
  'jumping',
  'eventing',
  'endurance',
  'western',
  'leisure',
  'hunter',
];

const FIELD =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-small text-text-primary';

export function DemoListingComposer() {
  const [title, setTitle] = useState('Zümrüt — 9 yaşında Arap kısrak');
  const [description, setDescription] = useState(
    'Sakin mizaçlı, dresaj ve gezinti için uygun bir kısrak. Düzenli nal bakımı ve aşı ' +
      'takibi yapılıyor, tüm kayıtlar sistemde tutuluyor. Manejde ve arazide rahat çalışır. ' +
      'Deneme binişine açığız; alım öncesi veteriner muayenesini memnuniyetle karşılarız.',
  );
  const [priceAmount, setPriceAmount] = useState('18000');
  const [priceType, setPriceType] = useState('fixed');
  const [photoCount, setPhotoCount] = useState(3);
  const [videoCount, setVideoCount] = useState(0);
  const [hasXray, setHasXray] = useState(false);
  const [healthVisible, setHealthVisible] = useState(true);
  const [identityVerified, setIdentityVerified] = useState(true);
  const [sex, setSex] = useState('mare');
  const [dateOfBirth, setDateOfBirth] = useState('2017-05-10');
  const [heightCm, setHeightCm] = useState('158');
  const [breedId, setBreedId] = useState('arabian');
  const [color, setColor] = useState('kır');
  const [disciplines, setDisciplines] = useState<string[]>(['dressage']);

  const horse = {
    heightCm: heightCm ? Number(heightCm) : null,
    breedId: breedId || null,
    dateOfBirth: dateOfBirth || null,
    birthYearEstimated: false,
    color: color || null,
    disciplines,
    visibilityHealth: (healthVisible ? 'on_request' : 'private') as never,
  };

  const quality = useMemo(
    () =>
      computeQualityScore({
        photoCount,
        videoCount,
        videoCategories: videoCount > 0 ? (['trot', 'canter'] as never) : ([] as never),
        descriptionLength: description.length,
        hasXray,
        horse,
        sellerVerification: (identityVerified ? 'identity_verified' : 'none') as never,
        priceType: priceType as never,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      photoCount,
      videoCount,
      description,
      hasXray,
      heightCm,
      breedId,
      dateOfBirth,
      color,
      disciplines,
      healthVisible,
      identityVerified,
      priceType,
    ],
  );

  const violations = useMemo(
    () =>
      checkWelfarePolicy({
        title,
        description,
        priceAmount: priceAmount ? Number(priceAmount) : null,
        priceType,
        sellerIdentityVerified: identityVerified,
        horse: { sex: sex as never, dateOfBirth: dateOfBirth || null },
        healthRecords: [],
      } as never),
    [title, description, priceAmount, priceType, identityVerified, sex, dateOfBirth],
  );

  const blocked = violations.some((violation) => !violation.requiresReview);
  const tooFewPhotos = photoCount < 3;

  const outcome = !identityVerified
    ? {
        tone: 'danger' as const,
        label: 'Yayınlanamaz — kimlik doğrulaması gerekli',
        detail:
          '§3.3: ilan yayınlamanın koşulu kimlik doğrulamasıdır ve satın alınamaz. Hiçbir plan bunu atlayamaz.',
      }
    : blocked
      ? {
          tone: 'danger' as const,
          label: 'Yayınlanamaz — refah politikası',
          detail: 'Aşağıdaki kural kategoriktir; incelemeyle de yayınlanamaz.',
        }
      : tooFewPhotos
        ? {
            tone: 'danger' as const,
            label: 'Yayınlanamaz — en az 3 fotoğraf gerekli',
            detail: '§10.2: fotoğrafsız bir ilan alıcının değerlendiremeyeceği bir ilandır.',
          }
        : violations.length > 0 || quality.score < AUTO_APPROVE_THRESHOLD
          ? {
              tone: 'warning' as const,
              label: 'İncelemeye düşer',
              detail: `§13.1: kalite puanı ${AUTO_APPROVE_THRESHOLD} ve üzeriyse ilan doğrudan yayınlanır. Şu an ${quality.score}.`,
            }
          : {
              tone: 'success' as const,
              label: 'Doğrudan yayınlanır',
              detail: `Kalite puanı ${quality.score} — §13.1'in ${AUTO_APPROVE_THRESHOLD} eşiğinin üstünde${
                quality.score >= GOOD_LISTING_THRESHOLD ? ' ve "iyi ilan" sayılır' : ''
              }.`,
            };

  const toneClass = {
    success: 'border-success/50 bg-success/10 text-success',
    warning: 'border-warning/50 bg-warning/10 text-warning',
    danger: 'border-danger/50 bg-danger/10 text-danger',
  }[outcome.tone];

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <form className="space-y-5" onSubmit={(event) => event.preventDefault()}>
        <fieldset className="space-y-4 rounded-lg border border-border bg-surface p-5">
          <legend className="font-display text-h3 px-1">At</legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-label text-text-secondary uppercase">Cinsiyet</span>
              <select
                className={`${FIELD} mt-1`}
                value={sex}
                onChange={(event) => setSex(event.target.value)}
              >
                <option value="mare">Kısrak</option>
                <option value="stallion">Aygır</option>
                <option value="gelding">İğdiş</option>
                <option value="filly">Dişi tay</option>
                <option value="colt">Erkek tay</option>
              </select>
            </label>

            <label className="block">
              <span className="text-label text-text-secondary uppercase">Doğum tarihi</span>
              <input
                type="date"
                className={`${FIELD} mt-1`}
                value={dateOfBirth}
                onChange={(event) => setDateOfBirth(event.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-label text-text-secondary uppercase">Irk</span>
              <input
                className={`${FIELD} mt-1`}
                value={breedId}
                onChange={(event) => setBreedId(event.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-label text-text-secondary uppercase">Boy (cm)</span>
              <input
                className={`${FIELD} mt-1 tabular`}
                inputMode="numeric"
                value={heightCm}
                onChange={(event) => setHeightCm(event.target.value.replace(/\D/g, ''))}
              />
            </label>

            <label className="block">
              <span className="text-label text-text-secondary uppercase">Renk</span>
              <input
                className={`${FIELD} mt-1`}
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
            </label>
          </div>

          <div>
            <span className="text-label text-text-secondary uppercase">Disiplinler</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {DISCIPLINES.map((discipline) => {
                const on = disciplines.includes(discipline);
                return (
                  <button
                    key={discipline}
                    type="button"
                    onClick={() =>
                      setDisciplines((current) =>
                        on
                          ? current.filter((value) => value !== discipline)
                          : [...current, discipline],
                      )
                    }
                    className={`rounded-full border px-3 py-1 text-caption ${
                      on ? 'border-gold-muted bg-gold/15' : 'border-border'
                    }`}
                  >
                    {discipline}
                  </button>
                );
              })}
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-4 rounded-lg border border-border bg-surface p-5">
          <legend className="font-display text-h3 px-1">İlan</legend>

          <label className="block">
            <span className="text-label text-text-secondary uppercase">Başlık</span>
            <input
              className={`${FIELD} mt-1`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-label text-text-secondary uppercase">
              Açıklama ({description.length} karakter)
            </span>
            <textarea
              className={`${FIELD} mt-1 min-h-[9rem]`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-label text-text-secondary uppercase">Fiyat (€)</span>
              <input
                className={`${FIELD} mt-1 tabular`}
                inputMode="numeric"
                value={priceAmount}
                onChange={(event) => setPriceAmount(event.target.value.replace(/\D/g, ''))}
                disabled={priceType === 'on_request'}
              />
            </label>

            <label className="block">
              <span className="text-label text-text-secondary uppercase">Fiyat tipi</span>
              <select
                className={`${FIELD} mt-1`}
                value={priceType}
                onChange={(event) => setPriceType(event.target.value)}
              >
                <option value="fixed">Sabit</option>
                <option value="negotiable">Pazarlıklı</option>
                <option value="on_request">Fiyat sorunuz</option>
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-label text-text-secondary uppercase">
                Fotoğraf: {photoCount}
              </span>
              <input
                type="range"
                min={0}
                max={12}
                value={photoCount}
                onChange={(event) => setPhotoCount(Number(event.target.value))}
                className="mt-2 w-full accent-gold-soft"
              />
            </label>

            <label className="block">
              <span className="text-label text-text-secondary uppercase">Video: {videoCount}</span>
              <input
                type="range"
                min={0}
                max={3}
                value={videoCount}
                onChange={(event) => setVideoCount(Number(event.target.value))}
                className="mt-2 w-full accent-gold-soft"
              />
            </label>
          </div>

          <div className="space-y-2 text-small">
            {[
              ['Röntgen görüntüleri var', hasXray, setHasXray] as const,
              ['Sağlık kayıtları paylaşılıyor', healthVisible, setHealthVisible] as const,
              ['Kimliğim doğrulanmış', identityVerified, setIdentityVerified] as const,
            ].map(([label, value, set]) => (
              <label key={label} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(event) => set(event.target.checked)}
                  className="accent-gold-soft"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </form>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <div className={`rounded-lg border p-4 ${toneClass}`}>
          <p className="font-display text-h3">{outcome.label}</p>
          <p className="mt-2 text-small text-text-primary">{outcome.detail}</p>
        </div>

        {violations.length > 0 ? (
          <div className="rounded-lg border border-danger/50 bg-surface p-4">
            <p className="text-label text-text-secondary uppercase">§14.4 refah politikası</p>
            <ul className="mt-3 space-y-3 text-small">
              {violations.map((violation) => (
                <li key={violation.rule}>
                  <p className="text-text-primary">{violation.messageTr}</p>
                  <p className="text-text-secondary mt-1 text-caption">
                    {violation.rule} ·{' '}
                    {violation.requiresReview ? 'insan incelemesi' : 'kategorik ret'}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* §18.2 S13's quality meter, computed by §13.2's own function. */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-label text-text-secondary uppercase">Kalite puanı</p>
            <p className="font-display text-h2 tabular">{quality.score}</p>
          </div>

          <div
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-raised"
            role="progressbar"
            aria-valuenow={quality.score}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full bg-gold-soft" style={{ width: `${quality.score}%` }} />
          </div>

          {quality.suggestions.length > 0 ? (
            <>
              <p className="text-text-secondary mt-4 text-caption uppercase">Puanı yükseltmek için</p>
              <ul className="mt-2 space-y-2 text-small">
                {quality.suggestions.slice(0, 5).map((component) => (
                  <li key={component.key} className="flex justify-between gap-3">
                    <span className="text-text-secondary">{component.suggestion}</span>
                    <span className="tabular text-text-secondary">+{component.points}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-small text-text-secondary mt-4">
              Her madde tamam — bu ilan alınabilecek en yüksek puanda.
            </p>
          )}
        </div>

        <p className="text-caption text-text-secondary">
          Bu ekrandaki her karar §13.2 ve §14.4&apos;ün gerçek kod ile hesaplanıyor. Kaydetme
          canlı sunucu ister; bu sürümde hiçbir şey kaydedilmez.
        </p>
      </aside>
    </div>
  );
}
