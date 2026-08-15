'use server';

import { revalidatePath } from 'next/cache';

import type { FormState } from '@/lib/form-state';
import { apiAs } from '@/lib/authed';

/** §18.2 S25/S31 — your profile, your data export, and your deletion request. */
export async function updateProfile(_state: FormState, form: FormData): Promise<FormState> {
  const displayName = String(form.get('displayName') ?? '').trim();
  if (displayName.length < 2) {
    return { fields: { displayName: 'Görünen ad en az 2 karakter olmalı.' } };
  }

  const optional = (name: string): string | null => {
    const value = String(form.get(name) ?? '').trim();
    return value.length > 0 ? value : null;
  };

  const result = await apiAs('/me', {
    method: 'PATCH',
    body: JSON.stringify({
      displayName,
      city: optional('city'),
      region: optional('region'),
      locale: String(form.get('locale') ?? 'tr'),
    }),
  });

  if (!result.ok) return { error: result.error.message };

  revalidatePath('/tr/hesap/ayarlar');
  revalidatePath('/tr/hesap');
  return {};
}

/** §24.27 — a complete JSON + media archive, promised within 24 hours. */
export async function requestExport(_state: FormState, _form: FormData): Promise<FormState> {
  const result = await apiAs('/me/export', { method: 'POST' });
  if (!result.ok) return { error: result.error.message };

  revalidatePath('/tr/hesap/ayarlar');
  return {};
}

/**
 * §24.14 — request deletion.
 *
 * Scheduled, not immediate: the erasure runs after 30 days and can be
 * cancelled until it does. Behind a typed confirmation rather than a second
 * click, because a confirm dialog is a thing people dismiss on reflex — and
 * the word is checked on the server, because a form is client input.
 *
 * §26 can refuse it outright: an account under legal hold keeps its records
 * until the dispute closes. That refusal is surfaced verbatim rather than
 * flattened into "bir şeyler ters gitti", because it is the one message that
 * tells the person what to do next.
 */
export async function requestErasure(_state: FormState, form: FormData): Promise<FormState> {
  if (String(form.get('confirm') ?? '').trim().toLocaleUpperCase('tr') !== 'SİL') {
    return { fields: { confirm: 'Onaylamak için kutuya SİL yaz.' } };
  }

  const result = await apiAs('/me/account', { method: 'DELETE' });
  if (!result.ok) return { error: result.error.message };

  revalidatePath('/tr/hesap/ayarlar');
  return {};
}

export async function cancelErasure(): Promise<void> {
  await apiAs('/me/account/restore', { method: 'POST' });
  revalidatePath('/tr/hesap/ayarlar');
}
