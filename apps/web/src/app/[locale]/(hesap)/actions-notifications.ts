'use server';

import { revalidatePath } from 'next/cache';

import { apiAs } from '@/lib/authed';

/** §21's unread count exists to say "there is something new". */
export async function markAllRead(): Promise<void> {
  await apiAs('/notifications/read-all', { method: 'POST' });

  revalidatePath('/tr/hesap/bildirimler');
  // The account page reads the same count into its summary card.
  revalidatePath('/tr/hesap');
}
