'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { FormState } from '@/lib/form-state';
import { apiAs } from '@/lib/authed';

/**
 * The §2 horse record: creating one, and the three things that get added to it
 * over its life — health entries, competition results and an ownership change.
 *
 * The API validates all of this; these actions parse only enough to avoid
 * sending it garbage, and to turn the `''` a `FormData` gives for an untouched
 * optional field into an omitted key. Every optional field in the horse
 * schemas is `.optional()`, not `.nullish()`, so sending `null` where the key
 * could be left out fails validation with a message about types — which is how
 * a blank "microchip" field ends up rendering as "Bir şeyler ters gitti".
 */
const text = (form: FormData, name: string): string | undefined => {
  const value = String(form.get(name) ?? '').trim();
  return value.length > 0 ? value : undefined;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function fieldErrors(details: unknown): Record<string, string> | undefined {
  const fields: Record<string, string> = {};
  for (const detail of (details as { field?: string; message?: string }[]) ?? []) {
    if (detail?.field && detail.message && !fields[detail.field]) {
      fields[detail.field] = detail.message;
    }
  }
  return Object.keys(fields).length > 0 ? fields : undefined;
}

export async function createHorse(_state: FormState, form: FormData): Promise<FormState> {
  const name = text(form, 'name');
  const sex = text(form, 'sex');

  // §6 lets a horse exist with almost nothing known — a rescue with no papers
  // is still a horse. Name and sex are the only two the registry insists on.
  if (!name || name.length < 2) return { fields: { name: 'En az 2 karakter.' } };
  if (!sex) return { fields: { sex: 'Cinsiyet seç.' } };

  const birthYear = text(form, 'birthYear');
  const height = text(form, 'heightCm');

  const created = await apiAs<{ id: string }>('/horses', {
    method: 'POST',
    body: JSON.stringify({
      name,
      sex,
      ...(birthYear ? { dateOfBirth: `${birthYear}-01-01`, birthYearEstimated: true } : {}),
      ...(height ? { heightCm: Number(height) } : {}),
      ...(text(form, 'color') ? { color: text(form, 'color') } : {}),
      ...(text(form, 'breedId') ? { breedId: text(form, 'breedId') } : {}),
      disciplines: form.getAll('disciplines').map(String).filter(Boolean),
      ...(text(form, 'passportNumber') ? { passportNumber: text(form, 'passportNumber') } : {}),
      ...(text(form, 'microchipNumber') ? { microchipNumber: text(form, 'microchipNumber') } : {}),
      ...(text(form, 'about') ? { about: text(form, 'about') } : {}),
      currentCountry: 'TR',
    }),
  });

  if (!created.ok) {
    return { error: created.error.message, fields: fieldErrors(created.error.details) };
  }

  revalidatePath('/tr/hesap/atlarim');
  redirect(`/tr/hesap/atlarim/${created.data.id}`);
}

export async function addHealthRecord(_state: FormState, form: FormData): Promise<FormState> {
  const horseId = text(form, 'horseId');
  const title = text(form, 'title');
  const performedOn = text(form, 'performedOn');

  if (!horseId) return { error: 'At bulunamadı.' };
  if (!title) return { fields: { title: 'Kaydın adını yaz.' } };
  if (!performedOn || !ISO_DATE.test(performedOn)) {
    return { fields: { performedOn: 'Tarihi YYYY-AA-GG olarak gir.' } };
  }

  // §18.2 S12 suggests the next due date from the type; the same table lives
  // in shared-types and the API applies it when `nextDueOn` is omitted. The
  // form offers an interval in days so the two cannot disagree.
  const days = Number(text(form, 'intervalDays') ?? '');
  const nextDueOn =
    Number.isFinite(days) && days > 0
      ? new Date(new Date(performedOn).getTime() + days * 86_400_000).toISOString().slice(0, 10)
      : null;

  const result = await apiAs(`/horses/${encodeURIComponent(horseId)}/health`, {
    method: 'POST',
    body: JSON.stringify({
      type: text(form, 'type') ?? 'other',
      title,
      ...(text(form, 'notes') ? { notes: text(form, 'notes') } : {}),
      performedOn,
      nextDueOn,
    }),
  });

  if (!result.ok) {
    return { error: result.error.message, fields: fieldErrors(result.error.details) };
  }

  revalidatePath(`/tr/hesap/atlarim/${horseId}`);
  redirect(`/tr/hesap/atlarim/${horseId}/saglik`);
}

export async function addCompetition(_state: FormState, form: FormData): Promise<FormState> {
  const horseId = text(form, 'horseId');
  const eventName = text(form, 'eventName');
  const eventDate = text(form, 'eventDate');

  if (!horseId) return { error: 'At bulunamadı.' };
  if (!eventName || eventName.length < 2) return { fields: { eventName: 'Yarışmanın adını yaz.' } };
  if (!eventDate || !ISO_DATE.test(eventDate)) {
    return { fields: { eventDate: 'Tarihi YYYY-AA-GG olarak gir.' } };
  }

  const placing = text(form, 'placing');

  const result = await apiAs(`/horses/${encodeURIComponent(horseId)}/competitions`, {
    method: 'POST',
    body: JSON.stringify({
      eventDate,
      eventName,
      ...(text(form, 'discipline') ? { discipline: text(form, 'discipline') } : {}),
      ...(text(form, 'className') ? { className: text(form, 'className') } : {}),
      ...(placing ? { placing: Number(placing) } : {}),
      ...(text(form, 'location') ? { location: text(form, 'location') } : {}),
      // Free text: the person who rode it usually has no account here, and
      // refusing the record until they do loses the record.
      ...(text(form, 'riderName') ? { riderName: text(form, 'riderName') } : {}),
    }),
  });

  if (!result.ok) {
    return { error: result.error.message, fields: fieldErrors(result.error.details) };
  }

  revalidatePath(`/tr/hesap/atlarim/${horseId}`);
  redirect(`/tr/hesap/atlarim/${horseId}`);
}

/**
 * §6's ownership transfer.
 *
 * By e-mail, because the buyer usually has no account yet and refusing until
 * they sign up is how the record gets abandoned at exactly the moment it
 * matters most. The price is private unless explicitly published — §6 records
 * it for provenance, not for publication.
 */
export async function transferHorse(_state: FormState, form: FormData): Promise<FormState> {
  const horseId = text(form, 'horseId');
  const toEmail = text(form, 'toEmail');
  const date = text(form, 'date');

  if (!horseId) return { error: 'At bulunamadı.' };
  if (!toEmail || !toEmail.includes('@')) {
    return { fields: { toEmail: 'Geçerli bir e-posta gir.' } };
  }
  if (!date || !ISO_DATE.test(date)) {
    return { fields: { date: 'Tarihi YYYY-AA-GG olarak gir.' } };
  }

  const price = text(form, 'price');

  const result = await apiAs(`/horses/${encodeURIComponent(horseId)}/transfer`, {
    method: 'POST',
    body: JSON.stringify({
      toEmail,
      ...(price ? { price: Number(price), currency: 'TRY' } : {}),
      date,
      pricePublic: form.get('pricePublic') === 'on',
    }),
  });

  if (!result.ok) {
    return { error: result.error.message, fields: fieldErrors(result.error.details) };
  }

  revalidatePath('/tr/hesap/atlarim');
  redirect('/tr/hesap/atlarim?devredildi=1');
}
