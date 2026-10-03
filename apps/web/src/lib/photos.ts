"use client";
// Photos leave the phone small: the longest side is capped and they are re-encoded as JPEG, so a dock
// or doorstep photo is ~150–300 KB instead of several MB, and uploads on one bar of signal.
import { api, fetchPhoto, type PhotoKind } from "@/lib/api";
import { newId } from "@/lib/offline/outbox";

const MAX_SIDE = 1280;
const QUALITY = 0.72;

/** Shrinks a camera photo; falls back to the original file if the browser can't decode it. */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const out = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", QUALITY));
    return out && out.size < file.size ? out : file;
  } catch {
    return file;
  }
}

/** Uploads photos taken on a screen that needs a connection anyway (dock flag, store receipt); returns their ids. */
export async function uploadPhotos(kind: PhotoKind, orderId: string, photos: { blob: Blob }[]): Promise<string[]> {
  const ids: string[] = [];
  for (const p of photos) {
    // The id is made here, so a retried upload of the same photo is never stored twice.
    const id = newId();
    await api.uploadPhoto(id, kind, orderId, p.blob);
    ids.push(id);
  }
  return ids;
}

// One object URL per stored photo for the life of the tab (they are immutable once uploaded).
const urls = new Map<string, Promise<string>>();

/** An object URL for a stored photo; rejects while it is still waiting on the phone. */
export function photoUrl(id: string): Promise<string> {
  let p = urls.get(id);
  if (!p) {
    p = fetchPhoto(id).then((b) => URL.createObjectURL(b));
    // A failure (not uploaded yet, no signal) must not stick: the next render tries again.
    p.catch(() => urls.delete(id));
    urls.set(id, p);
  }
  return p;
}
