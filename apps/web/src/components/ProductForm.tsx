'use client';

import {
  PRODUCT_CONDITION_LABEL_TR,
  PRODUCT_DELIVERY_LABEL_TR,
  PRODUCT_PRICE_UNIT_LABEL_TR,
} from '@only-horses/shared-types';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import type { ProductCategoryRow } from '@/lib/api';
import type { FormState } from '@/lib/form-state';

const FIELD =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-text-primary';

function Submit() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-gold-soft px-6 py-3 text-body font-medium text-text-on-gold disabled:opacity-60"
    >
      {pending ? 'Kaydediliyor…' : 'Taslak olarak kaydet'}
    </button>
  );
}

/**
 * The sell form for the equipment marketplace.
 *
 * One page rather than the mobile app's wizard: a browser form with twelve
 * fields is a scroll, and splitting it into steps on a desktop mostly adds
 * clicks. The field order still follows the wizard's — what it is, what
 * condition, what price, where — because that is the order a seller knows the
 * answers in.
 *
 * The category select is grouped by the eight top-level families with
 * `<optgroup>`, so a leaf is picked in one interaction instead of two
 * dependent selects that can disagree.
 *
 * Price is optional. A blank price is not zero and not an error — it means
 * "ask me", and the action turns it into §13's `on_request`.
 */
export function ProductForm({
  categories,
  action,
}: {
  categories: ProductCategoryRow[];
  action: (state: FormState, form: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, {});
  const [hasPrice, setHasPrice] = useState(true);

  const groups = categories.filter((entry) => !entry.parent_code);
  const error = (name: string) => state.fields?.[name];

  const Err = ({ name }: { name: string }) =>
    error(name) ? (
      <span className="text-caption text-danger mt-1 block">{error(name)}</span>
    ) : null;

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
        <span className="text-label text-text-secondary uppercase">Kategori</span>
        <select name="category" required defaultValue="" className={`${FIELD} mt-1`}>
          <option value="" disabled>
            Seç
          </option>
          {groups.map((group) => (
            <optgroup key={group.code} label={group.name_tr}>
              {categories
                .filter((entry) => entry.parent_code === group.code)
                .map((entry) => (
                  <option key={entry.code} value={entry.code}>
                    {entry.name_tr}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <Err name="category" />
      </label>

      <label className="block">
        <span className="text-label text-text-secondary uppercase">Başlık</span>
        <input
          name="title"
          required
          maxLength={140}
          placeholder="Wintec 500 dresaj eyeri, 17.5&quot;"
          className={`${FIELD} mt-1`}
          aria-invalid={Boolean(error('title'))}
        />
        <Err name="title" />
      </label>

      <label className="block">
        <span className="text-label text-text-secondary uppercase">Açıklama</span>
        <textarea
          name="description"
          required
          rows={6}
          maxLength={8000}
          placeholder="Ne kadar kullanıldı, neden satılıyor, kime uyar. Kusurları da yaz — alıcı gelip görecek."
          className={`${FIELD} mt-1`}
          aria-invalid={Boolean(error('description'))}
        />
        <Err name="description" />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-label text-text-secondary uppercase">Marka</span>
          <input name="brand" maxLength={80} className={`${FIELD} mt-1`} />
        </label>

        <label className="block">
          <span className="text-label text-text-secondary uppercase">Model</span>
          <input name="model" maxLength={80} className={`${FIELD} mt-1`} />
        </label>

        <label className="block">
          <span className="text-label text-text-secondary uppercase">Beden / ölçü</span>
          <input
            name="sizeLabel"
            maxLength={60}
            placeholder='17.5", 145 cm, 41 numara'
            className={`${FIELD} mt-1`}
          />
        </label>

        <label className="block">
          <span className="text-label text-text-secondary uppercase">Renk</span>
          <input name="color" maxLength={60} className={`${FIELD} mt-1`} />
        </label>
      </div>

      <fieldset>
        <legend className="text-label text-text-secondary uppercase">Durum</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(PRODUCT_CONDITION_LABEL_TR).map(([value, label]) => (
            <label
              key={value}
              className="cursor-pointer rounded-full border border-border px-4 py-2 text-small has-[:checked]:border-gold-soft has-[:checked]:bg-surface-raised"
            >
              <input
                type="radio"
                name="condition"
                value={value}
                defaultChecked={value === 'good'}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="rounded-lg border border-border bg-surface p-4">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={hasPrice}
            onChange={(event) => setHasPrice(event.target.checked)}
          />
          <span className="text-small">Fiyat belirteceğim</span>
        </label>
        <p className="text-caption text-text-secondary mt-1">
          İşaretlemezsen ilan &ldquo;fiyat sorunuz&rdquo; olarak yayınlanır.
        </p>

        {hasPrice ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-label text-text-secondary uppercase">Fiyat (₺)</span>
              <input
                name="priceAmount"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                className={`${FIELD} mt-1 tabular`}
                aria-invalid={Boolean(error('priceAmount'))}
              />
              <Err name="priceAmount" />
            </label>

            <label className="block">
              <span className="text-label text-text-secondary uppercase">Birim</span>
              <select name="priceUnit" defaultValue="item" className={`${FIELD} mt-1`}>
                {Object.entries(PRODUCT_PRICE_UNIT_LABEL_TR).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-label text-text-secondary uppercase">Pazarlık</span>
              <select name="priceType" defaultValue="fixed" className={`${FIELD} mt-1`}>
                <option value="fixed">Sabit fiyat</option>
                <option value="negotiable">Pazarlık payı var</option>
                <option value="free">Ücretsiz</option>
              </select>
            </label>
          </div>
        ) : null}
      </div>

      <label className="block sm:max-w-[12rem]">
        <span className="text-label text-text-secondary uppercase">Adet</span>
        <input
          name="quantity"
          type="number"
          min={1}
          defaultValue={1}
          inputMode="numeric"
          className={`${FIELD} mt-1 tabular`}
          aria-invalid={Boolean(error('quantity'))}
        />
        <Err name="quantity" />
      </label>

      <label className="block">
        <span className="text-label text-text-secondary uppercase">Teslimat</span>
        <select name="delivery" defaultValue="pickup" className={`${FIELD} mt-1`}>
          {Object.entries(PRODUCT_DELIVERY_LABEL_TR).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-label text-text-secondary uppercase">Kargo notu</span>
        <input
          name="shippingNote"
          maxLength={400}
          placeholder="Kargo alıcıya ait, aynı gün gönderim"
          className={`${FIELD} mt-1`}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-label text-text-secondary uppercase">İl</span>
          <input name="region" maxLength={120} className={`${FIELD} mt-1`} />
        </label>

        <label className="block">
          <span className="text-label text-text-secondary uppercase">İlçe / şehir</span>
          <input name="city" maxLength={120} className={`${FIELD} mt-1`} />
        </label>
      </div>

      <Submit />

      <p className="text-caption text-text-secondary">
        Kaydettiğinde taslak olur. Fotoğraf ekleyip yayınlamayı Ürünlerim&apos;den
        yaparsın.
      </p>
    </form>
  );
}
