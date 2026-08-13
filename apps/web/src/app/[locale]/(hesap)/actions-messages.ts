'use server';

import { revalidatePath } from 'next/cache';

import { apiAs } from '@/lib/authed';

/** §18.2 S22 — send one message into a thread. */
export async function sendMessage(form: FormData): Promise<void> {
  const id = String(form.get('id') ?? '');
  const body = String(form.get('body') ?? '').trim();

  if (!id || !body) return;

  await apiAs(`/conversations/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });

  revalidatePath(`/tr/hesap/mesajlar/${id}`);
  revalidatePath('/tr/hesap/mesajlar');
}
