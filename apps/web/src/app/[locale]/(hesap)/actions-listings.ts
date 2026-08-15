'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { FormState } from '@/lib/form-state';
import { apiAs } from '@/lib/authed';

/**
 * The §5 lifecycle transitions a seller can trigger from "İlanlarım".
 *
 * The allowed set is fixed here rather than taken from the form: a hidden
 * field is client input, and `POST /v1/listings/:id/${anything}` built from it
 * would let a crafted form reach endpoints this screen has no business
 * calling. The API would still authorise every one of them — this is the
 * second lock, not the only one.
 *
 * `close` is deliberately absent from the quick actions even though §5 allows
 * it: closing asks *why* and, for a sale on the platform, *to whom* (§18.2
 * S14), and that is a form, not a button. Offering a one-click close would
 * either lose the answer or invent one, and §22's North Star is counted from
 * exactly that answer.
 */
const ALLOWED = new Set(['publish', 'pause', 'resume', 'renew']);

export async function listingAction(form: FormData): Promise<void> {
  const id = String(form.get('id') ?? '');
  const action = String(form.get('action') ?? '');

  if (!id || !ALLOWED.has(action)) return;

  await apiAs(`/listings/${encodeURIComponent(id)}/${action}`, { method: 'POST' });

  // Whether it succeeded or was refused, the page must re-read: a refusal
  // usually means the row is not in the state this page thought it was.
  revalidatePath('/tr/hesap/ilanlarim');
  revalidatePath('/tr/hesap');
}

/**
 * §18.2 S13 — compose a listing, as a draft.
 *
 * `createListingSchema` defaults `priceCurrency` to EUR; the launch region is
 * Türkiye (§1.2), so this sends TRY explicitly rather than letting a listing
 * be created in a currency nobody here quotes in.
 *
 * `priceAmount` is `.optional()`, not `.nullish()` — "fiyat sorunuz" omits the
 * key rather than sending null, which the validator rejects with a message
 * about types that reads as a broken form.
 */
export async function createListing(
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const value = (name: string): string | undefined => {
    const raw = String(form.get(name) ?? '').trim();
    return raw.length > 0 ? raw : undefined;
  };

  const horseId = value('horseId');
  const title = value('title');
  const description = value('description');

  if (!horseId) return { fields: { horseId: 'Bir at seç.' } };
  if (!title || title.length < 8) return { fields: { title: 'Başlık en az 8 karakter olmalı.' } };
  if (!description || description.length < 40) {
    return { fields: { description: 'Açıklama en az 40 karakter olmalı.' } };
  }

  const price = value('priceAmount');
  const priceType = price ? (value('priceType') ?? 'fixed') : 'on_request';

  const created = await apiAs<{ id: string; slug: string }>('/listings', {
    method: 'POST',
    body: JSON.stringify({
      horseId,
      type: value('type') ?? 'sale',
      title,
      description,
      priceType,
      ...(priceType === 'on_request' ? {} : { priceAmount: Number(price) }),
      priceCurrency: 'TRY',
      countryCode: 'TR',
      ...(value('city') ? { city: value('city') } : {}),
      trialAllowed: form.get('trialAllowed') === 'on',
      ppeWelcome: form.get('ppeWelcome') === 'on',
      transportHelp: form.get('transportHelp') === 'on',
    }),
  });

  if (!created.ok) {
    const fields: Record<string, string> = {};
    for (const detail of (created.error.details as { field?: string; message?: string }[]) ?? []) {
      if (detail?.field && detail.message && !fields[detail.field]) {
        fields[detail.field] = detail.message;
      }
    }

    return {
      error: created.error.message,
      fields: Object.keys(fields).length > 0 ? fields : undefined,
    };
  }

  revalidatePath('/tr/hesap/ilanlarim');
  redirect('/tr/hesap/ilanlarim');
}
