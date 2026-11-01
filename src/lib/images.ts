import { ApiError } from './api.ts';

export const imageSrc = (id: string) => `/api/images/${id}`;

/** Shrinks a photo to fit 1280×720 (YouTube thumbnail size) and re-encodes it as JPEG, so uploads stay small. */
export async function prepareImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('This browser can’t read that image. Try a JPEG or PNG.');
  }
  const scale = Math.min(1, 1280 / bitmap.width, 720 / bitmap.height);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  for (const quality of [0.88, 0.75, 0.6]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
    if (blob && blob.size <= 1_300_000) return blob;
  }
  throw new Error('That image is too detailed to shrink enough. Try a smaller one.');
}

export async function uploadImage(file: File): Promise<string> {
  const blob = await prepareImage(file);
  const res = await fetch('/api/images', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText);
  return data.id as string;
}

/** Best effort: an image that fails to delete just stays in the database unused. */
export const deleteImage = (id: string) => fetch(`/api/images/${id}`, { method: 'DELETE' }).catch(() => {});
