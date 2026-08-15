'use client';

import { SEX_LABEL_TR } from '@only-horses/shared-types';
import { useMemo, useState } from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import type { ReferenceRow } from '@/lib/api';
import type { FormState } from '@/lib/form-state';

const FIELD =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-text-primary';

const SEXES = ['mare', 'stallion', 'gelding', 'filly', 'colt'] as const;
const COLORS = ['doru', 'yağız', 'kır', 'al', 'demirkır', 'kula', 'alaca'] as const;

function Submit() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-gold-soft px-6 py-3 text-body font-medium text-text-on-gold disabled:opacity-60"
    >
      {pending ? 'Kaydediliyor…' : 'Atı kaydet'}
    </button>
  );
}

/**
 * §18.2 S10 — add a horse.
 *
 * The mobile app runs this as a five-step wizard; on the web it is one form,
 * in the same order — identity, physical, discipline, paperwork. Paperwork is
 * last rather than first because a passport number is the field people leave
 * to go and look up, and a form that opens on it is a form people close.
 *
 * Only name and sex are required. §6 lets a horse exist with almost nothing
 * known: a rescue with no papers is still a horse, and a registry that refuses
 * to record it has a hole exactly where the welfare case is.
 *
 * The breed table is ~130 rows, so it filters as you type rather than being a
 * select with a hundred options nobody scrolls.
 */
export function HorseForm({
  breeds,
  disciplines,
  action,
}: {
  breeds: ReferenceRow[];
  disciplines: ReferenceRow[];
  action: (state: FormState, form: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, {});
  const [breedQuery, setBreedQuery] = useState('');
  const [breed, setBreed] = useState<ReferenceRow | null>(null);

  const matches = useMemo(() => {
    const needle = breedQuery.trim().toLocaleLowerCase('tr');
    if (!needle) return [];
    return breeds
      .filter((entry) => entry.name.toLocaleLowerCase('tr').includes(needle))
      .slice(0, 12);
  }, [breeds, breedQuery]);

  const error = (name: string) => state.fields?.[name];
  const thisYear = new Date().getFullYear();

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-danger/50 bg-danger/10 px-3 py-2 text-small text-text-primary"
        >
          {state.error}
        </p>
      ) : null}

      <label className="block">
        <span className="text-label text-text-secondary uppercase">Adı</span>
        <input
          name="name"
          required
          minLength={2}
          maxLength={80}
          className={`${FIELD} mt-1`}
          aria-invalid={Boolean(error('name'))}
        />
        {error('name') ? (
          <span className="text-caption text-danger mt-1 block">{error('name')}</span>
        ) : null}
      </label>

      <fieldset>
        <legend className="text-label text-text-secondary uppercase">Cinsiyet</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {SEXES.map((value) => (
            <label
              key={value}
              className="cursor-pointer rounded-full border border-border px-4 py-2 text-small has-[:checked]:border-gold-soft has-[:checked]:bg-surface-raised"
            >
              <input type="radio" name="sex" value={value} required className="sr-only" />
              {SEX_LABEL_TR[value] ?? value}
            </label>
          ))}
        </div>
        {error('sex') ? (
          <span className="text-caption text-danger mt-1 block">{error('sex')}</span>
        ) : null}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="text-label text-text-secondary uppercase">Doğum yılı</span>
          <input
            name="birthYear"
            type="number"
            min={1980}
            max={thisYear}
            inputMode="numeric"
            className={`${FIELD} mt-1 tabular`}
          />
          <span className="text-caption text-text-secondary mt-1 block">
            Tam gün bilinmiyorsa yıl yeter.
          </span>
        </label>

        <label className="block">
          <span className="text-label text-text-secondary uppercase">Cidago (cm)</span>
          <input
            name="heightCm"
            type="number"
            min={50}
            max={220}
            inputMode="numeric"
            className={`${FIELD} mt-1 tabular`}
          />
        </label>

        <label className="block">
          <span className="text-label text-text-secondary uppercase">Don</span>
          <select name="color" defaultValue="" className={`${FIELD} mt-1`}>
            <option value="">Bilinmiyor</option>
            {COLORS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <label className="block">
          <span className="text-label text-text-secondary uppercase">Irk</span>
          <input
            className={`${FIELD} mt-1`}
            placeholder="Yazmaya başla: Arap, Haflinger…"
            value={breed ? breed.name : breedQuery}
            onChange={(event) => {
              setBreed(null);
              setBreedQuery(event.target.value);
            }}
            aria-describedby="breed-help"
          />
        </label>
        <input type="hidden" name="breedId" value={breed?.code ?? ''} />

        {breed ? null : matches.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {matches.map((entry) => (
              <li key={entry.code}>
                <button
                  type="button"
                  onClick={() => {
                    setBreed(entry);
                    setBreedQuery(entry.name);
                  }}
                  className="rounded-full border border-border px-3 py-1 text-small hover:bg-surface-raised"
                >
                  {entry.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <span id="breed-help" className="text-caption text-text-secondary mt-1 block">
          {breed
            ? `Seçildi: ${breed.name}`
            : 'Listeden seçmezsen ırk boş kaydedilir — sonradan eklenebilir.'}
        </span>
      </div>

      <fieldset>
        <legend className="text-label text-text-secondary uppercase">Disiplin</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {disciplines.map((entry) => (
            <label
              key={entry.code}
              className="cursor-pointer rounded-full border border-border px-3 py-1 text-small has-[:checked]:border-gold-soft has-[:checked]:bg-surface-raised"
            >
              <input
                type="checkbox"
                name="disciplines"
                value={entry.code}
                className="sr-only"
              />
              {entry.name}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-label text-text-secondary uppercase">Pasaport no</span>
          <input name="passportNumber" maxLength={60} className={`${FIELD} mt-1`} />
        </label>

        <label className="block">
          <span className="text-label text-text-secondary uppercase">Mikroçip no</span>
          <input name="microchipNumber" maxLength={60} className={`${FIELD} mt-1`} />
        </label>
      </div>

      <label className="block">
        <span className="text-label text-text-secondary uppercase">Notlar</span>
        <textarea name="about" rows={4} maxLength={4000} className={`${FIELD} mt-1`} />
      </label>

      <Submit />

      <p className="text-caption text-text-secondary">
        Bu kayıt sana ait ve kalıcıdır. İlan ondan türer — satmaya karar verdiğinde
        yeniden yazman gerekmez.
      </p>
    </form>
  );
}
