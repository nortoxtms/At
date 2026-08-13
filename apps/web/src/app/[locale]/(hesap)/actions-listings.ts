'use server';

import { revalidatePath } from 'next/cache';

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
