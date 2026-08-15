'use server';

import { createProductSchema } from '@only-horses/shared-types';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { FormState } from '@/lib/form-state';
import { apiAs } from '@/lib/authed';

/**
 * The §5 lifecycle transitions and the create form for the product
 * marketplace, mirroring `actions-listings.ts`.
 *
 * The allowed set is fixed here for the same reason it is fixed there: the
 * action name arrives in a hidden field, and a hidden field is client input.
 * `POST /v1/products/:id/${anything}` built from one would let a crafted form
 * reach endpoints this screen has no business calling.
 *
 * `close` *is* offered here, unlike on listings. Closing a horse listing asks
 * why and to whom, because §22's North Star is counted from that answer. A
 * saddle that sold is just gone.
 */
const ALLOWED = new Set(['publish', 'pause', 'resume', 'renew', 'close']);

function revalidate(): void {
  revalidatePath('/tr/hesap/urunlerim');
  revalidatePath('/tr/urunler');
}

export async function productAction(form: FormData): Promise<void> {
  const id = String(form.get('id') ?? '');
  const action = String(form.get('action') ?? '');

  if (!id || !ALLOWED.has(action)) return;

  await apiAs(`/products/${encodeURIComponent(id)}/${action}`, { method: 'POST' });

  // Whether it succeeded or was refused, the page must re-read: a refusal
  // usually means the row is not in the state this page thought it was.
  revalidate();
}

export async function deleteProduct(form: FormData): Promise<void> {
  const id = String(form.get('id') ?? '');
  if (!id) return;

  await apiAs(`/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
  revalidate();
}

/**
 * Create a product.
 *
 * Validated with the same zod schema the API validates with, so the browser
 * gets the field-level Turkish messages without a round trip — and the API
 * still validates, because this half runs on input the API never sees.
 *
 * Optional numbers arrive from a `FormData` as `''`, which `z.number()`
 * refuses with a message about types rather than about the field. They are
 * dropped before parsing so an empty price means "ask me", not "invalid".
 */
export async function createProduct(_state: FormState, form: FormData): Promise<FormState> {
  const text = (name: string): string | undefined => {
    const value = String(form.get(name) ?? '').trim();
    return value.length > 0 ? value : undefined;
  };

  const parsed = createProductSchema.safeParse({
    category: text('category') ?? '',
    title: text('title') ?? '',
    description: text('description') ?? '',
    brand: text('brand'),
    model: text('model'),
    sizeLabel: text('sizeLabel'),
    color: text('color'),
    condition: text('condition') ?? 'good',
    priceAmount: text('priceAmount') ? Number(text('priceAmount')) : undefined,
    priceCurrency: 'TRY',
    priceType: text('priceAmount') ? (text('priceType') ?? 'fixed') : 'on_request',
    priceUnit: text('priceUnit') ?? 'item',
    quantity: Number(text('quantity') ?? '1'),
    delivery: text('delivery') ?? 'pickup',
    shippingNote: text('shippingNote'),
    countryCode: 'TR',
    region: text('region'),
    city: text('city'),
  });

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && !fields[field]) fields[field] = issue.message;
    }

    return { error: 'Formda eksik var.', fields };
  }

  const created = await apiAs<{ id: string; slug: string }>('/products', {
    method: 'POST',
    body: JSON.stringify(parsed.data),
  });

  if (!created.ok) {
    return { error: created.error.message };
  }

  revalidate();
  // A draft, not a live listing: §5 makes publishing a separate decision, and
  // the seller has not seen the row yet.
  redirect('/tr/hesap/urunlerim');
}
