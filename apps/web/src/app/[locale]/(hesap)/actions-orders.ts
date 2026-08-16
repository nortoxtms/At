'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { FormState } from '@/lib/form-state';
import { apiAs } from '@/lib/authed';

/**
 * Buying a product.
 *
 * The allowed verbs are fixed here, not taken from the form, for the same
 * reason listings and products fix theirs: an action name in a hidden field is
 * client input, and `POST /v1/orders/:id/${anything}` built from one reaches
 * endpoints this screen has no business calling.
 *
 * Which *side* may press which verb is the API's call, not this file's — it
 * knows who owns the row and answers 403 when the wrong party asks. The screen
 * only avoids rendering a button that would earn one.
 */
const ALLOWED = new Set(['accept', 'reject', 'ship', 'confirm', 'cancel']);

function refresh(): void {
  revalidatePath('/tr/hesap/siparislerim');
  revalidatePath('/tr/hesap/urunlerim');
  revalidatePath('/tr/urunler');
}

export async function orderAction(form: FormData): Promise<void> {
  const id = String(form.get('id') ?? '');
  const action = String(form.get('action') ?? '');

  if (!id || !ALLOWED.has(action)) return;

  const body =
    action === 'ship'
      ? { trackingNote: String(form.get('trackingNote') ?? '').trim() || undefined }
      : action === 'cancel'
        ? { reason: String(form.get('reason') ?? '').trim() || 'Vazgeçildi' }
        : {};

  await apiAs(`/orders/${encodeURIComponent(id)}/${action}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  // Whether it succeeded or was refused, the page must re-read: a refusal
  // usually means the row is not in the state this page thought it was.
  refresh();
}

/**
 * Place the order.
 *
 * No price crosses the wire. `place_product_order` reads it from the listing
 * in the same statement that writes the order, so a total cannot be named by
 * whoever is submitting the form.
 */
export async function placeOrder(_state: FormState, form: FormData): Promise<FormState> {
  const productId = String(form.get('productId') ?? '');
  if (!productId) return { error: 'Ürün bulunamadı.' };

  const text = (name: string): string | undefined => {
    const value = String(form.get(name) ?? '').trim();
    return value.length > 0 ? value : undefined;
  };

  // Only sent for a shipped order: the database CHECK requires a line and a
  // city whenever delivery is `shipping`, and a collection-only trailer has
  // nowhere to post to.
  const shipping = form.get('delivery') !== 'pickup';

  if (shipping && (!text('shipToLine1') || !text('shipToCity'))) {
    return { fields: { shipToLine1: 'Kargo için adres ve şehir gerekiyor.' } };
  }

  const created = await apiAs<{ id: string; reference: string; total: number }>('/orders', {
    method: 'POST',
    body: JSON.stringify({
      productId,
      quantity: Math.max(1, Number(form.get('quantity') ?? 1) || 1),
      ...(shipping
        ? {
            shipToName: text('shipToName'),
            shipToPhone: text('shipToPhone'),
            shipToLine1: text('shipToLine1'),
            shipToCity: text('shipToCity'),
          }
        : {}),
      ...(text('note') ? { note: text('note') } : {}),
    }),
  });

  if (!created.ok) return { error: created.error.message };

  refresh();
  // Straight to the order, which is where the payment step lives: §5 puts the
  // seller's confirmation before the money, and the order page is the only
  // screen that can show which of those two the buyer is waiting on.
  redirect(`/tr/hesap/siparislerim/${created.data.id}?yeni=1`);
}

/** Pay for an accepted order. */
export async function payOrder(_state: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get('id') ?? '');
  if (!id) return { error: 'Sipariş bulunamadı.' };

  const paid = await apiAs<{ status: string; redirectUrl: string | null }>(
    `/orders/${encodeURIComponent(id)}/pay`,
    { method: 'POST', body: JSON.stringify({}) },
  );

  if (!paid.ok) return { error: paid.error.message };

  refresh();

  // A real processor answers with somewhere to send the buyer. The local one
  // does not, and a client that assumes a URL is always there breaks on both.
  if (paid.data?.redirectUrl) redirect(paid.data.redirectUrl);

  redirect(`/tr/hesap/siparislerim/${id}?odendi=1`);
}
