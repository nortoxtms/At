import * as ImagePicker from 'expo-image-picker';

import { api, API_URL, isDemo } from '@/lib/api';
import { getState, nextId, persist } from '@/lib/demo-store';

/**
 * §10.1's upload, from the phone.
 *
 * Three steps and they have to happen in this order: ask the API for an
 * intent, PUT the bytes at the presigned URL it returns, then tell the API the
 * bytes landed. The middle step does not go through `api()` — it is a request
 * to the storage provider, not to us, and attaching our bearer token to a
 * signed bucket URL would leak it to a third party.
 *
 * `complete` is not optional. Until it is called the row is `status =
 * 'uploading'`, and every read filters on `status = 'ready'`, so a photo that
 * uploads perfectly and never completes is a photo that silently does not
 * exist.
 */
export interface UploadIntent {
  mediaId: string;
  uploadUrl: string;
  storageKey: string;
  /** The provider's verb — GCS signs a PUT, the local stand-in takes a POST. */
  method: 'PUT' | 'POST';
  headers: Record<string, string>;
  expiresAt: string;
}

export interface HorseMedia {
  mediaId: string;
  url: string | null;
  category: string;
  sortOrder: number;
  visibility: string;
  type: string;
  blurhash: string | null;
  width: number | null;
  height: number | null;
}

export type UploadResult =
  | { ok: true; mediaId: string }
  | { ok: false; message: string };

/**
 * §18.2 S10 asks for the library and the camera. Permission is requested at
 * the moment of use rather than at launch — a horse app that asks for the
 * camera on the splash screen is one people decline out of reflex.
 */
export async function pickImage(source: 'library' | 'camera' = 'library') {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    return { cancelled: true as const, denied: true as const };
  }

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.85, exif: false })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.85,
          exif: false,
        });

  if (result.canceled || !result.assets[0]) {
    return { cancelled: true as const, denied: false as const };
  }

  return { cancelled: false as const, asset: result.assets[0] };
}

export async function uploadImage(asset: {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
}): Promise<UploadResult> {
  // In demo mode there is no bucket, so the picker's own URI is the photo.
  // Reading it into a data URI is what makes it survive a relaunch — a
  // `file://` or `blob:` reference does not, and a gallery of broken frames
  // the next morning is worse than no gallery.
  if (isDemo()) {
    const mediaId = nextId('media');
    const uri = await toDataUri(asset.uri).catch(() => asset.uri);

    getState().media.push({ mediaId, horseId: '', uri, createdAt: new Date().toISOString() });
    await persist();

    return { ok: true, mediaId };
  }

  // The picker does not always report a size or a type, and the intent schema
  // requires both. Reading the blob is the only way to know for certain, and
  // it is needed for the PUT anyway.
  let blob: Blob;
  try {
    blob = await (await fetch(asset.uri)).blob();
  } catch {
    return { ok: false, message: 'Fotoğraf okunamadı.' };
  }

  const mimeType = asset.mimeType ?? blob.type ?? 'image/jpeg';

  const intent = await api<UploadIntent>('/media/upload-intent', {
    method: 'POST',
    body: JSON.stringify({
      type: 'image',
      mimeType,
      sizeBytes: blob.size,
      ...(asset.fileName ? { filename: asset.fileName } : {}),
      context: 'horse',
    }),
  });

  if (!intent.ok) return { ok: false, message: intent.error.message };

  try {
    const put = await fetch(intent.data.uploadUrl, {
      method: intent.data.method ?? 'PUT',
      headers: intent.data.headers,
      body: blob,
    });

    if (!put.ok) return { ok: false, message: 'Yükleme tamamlanamadı.' };
  } catch {
    return { ok: false, message: 'Yükleme sırasında bağlantı koptu.' };
  }

  const complete = await api(`/media/${intent.data.mediaId}/complete`, { method: 'POST' });
  if (!complete.ok) return { ok: false, message: complete.error.message };

  return { ok: true, mediaId: intent.data.mediaId };
}

/** §12 POST /horses/:id/media — attach an uploaded asset to a horse. */
export async function attachToHorse(
  horseId: string,
  mediaId: string,
  category = 'general',
): Promise<{ ok: boolean; message?: string }> {
  const result = await api(`/horses/${horseId}/media`, {
    method: 'POST',
    body: JSON.stringify({ mediaId, category }),
  });

  return result.ok ? { ok: true } : { ok: false, message: result.error.message };
}

/**
 * Authenticated, even though the endpoint is `@OptionalAuth`.
 *
 * §8 makes a horse's photos public only once the horse has an active listing —
 * before that the RLS policy shows them to the owner and to nobody else. Asking
 * anonymously means the owner's own gallery comes back empty, which is exactly
 * what a horse with no photos looks like. A signed-out viewer still gets the
 * public set, because `api()` only attaches a token when there is one.
 */
export async function listHorseMedia(horseId: string): Promise<HorseMedia[]> {
  const result = await api<HorseMedia[]>(`/horses/${horseId}/media`);
  return result.ok && Array.isArray(result.data) ? result.data : [];
}

export async function removeHorseMedia(horseId: string, mediaId: string): Promise<boolean> {
  const result = await api(`/horses/${horseId}/media/${mediaId}`, { method: 'DELETE' });
  return result.ok;
}

export { API_URL };

/**
 * Read a picked image into a data URI.
 *
 * The picker hands back a reference into the OS's own storage, which the app
 * may not be able to read tomorrow — on web it is a `blob:` URL scoped to the
 * page, and on device a cache path the system is free to reclaim. The demo has
 * nowhere else to put the bytes, so it keeps them.
 */
async function toDataUri(uri: string): Promise<string> {
  if (uri.startsWith('data:')) return uri;

  const blob = await (await fetch(uri)).blob();

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}
