'use server';

import { revalidatePath } from 'next/cache';

import { apiAs } from '@/lib/authed';

/**
 * Saved items and saved searches (§10, §24.5).
 *
 * Saving *is* subscribing: §24.5 hangs the alert off the saved search rather
 * than off a second switch, so changing the frequency here is what turns an
 * alert on and off. "Her taramada" is labelled that way rather than
 * "anında" because the sweep runs every five minutes — promising instant and
 * delivering five minutes later is how a working alert reads as broken.
 */
const FREQUENCIES = new Set(['instant', 'daily', 'weekly', 'off']);
const TYPES = new Set(['listing', 'service', 'job', 'horse', 'profile', 'organization', 'product']);

export async function unsave(form: FormData): Promise<void> {
  const type = String(form.get('type') ?? '');
  const id = String(form.get('id') ?? '');

  // Both halves land in the path, so both are checked here — a hidden field is
  // client input, and `DELETE /v1/saved/${anything}/${anything}` built from
  // one is a request this screen has no business making.
  if (!TYPES.has(type) || !id) return;

  await apiAs(`/saved/${type}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  revalidatePath('/tr/hesap/kaydedilenler');
  revalidatePath('/tr/hesap');
}

export async function setSearchFrequency(form: FormData): Promise<void> {
  const id = String(form.get('id') ?? '');
  const frequency = String(form.get('frequency') ?? '');

  if (!id || !FREQUENCIES.has(frequency)) return;

  await apiAs(`/saved-searches/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ alertFrequency: frequency }),
  });

  revalidatePath('/tr/hesap/aramalarim');
}

export async function deleteSearch(form: FormData): Promise<void> {
  const id = String(form.get('id') ?? '');
  if (!id) return;

  await apiAs(`/saved-searches/${encodeURIComponent(id)}`, { method: 'DELETE' });
  revalidatePath('/tr/hesap/aramalarim');
}
