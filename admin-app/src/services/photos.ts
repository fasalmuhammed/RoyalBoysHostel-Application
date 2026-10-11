import { capability, describeError } from "@/web/runtime";
import { bytesToBase64, base64ToBytes } from "@/web/shims/file-system";

/**
 * Inmate photos, both sides of their Aadhaar card and complaint photos live
 * in Claude storage's file store. The record keeps only the stored file's id
 * -- the same field that held a bare filename on the phone -- and the image is
 * served from `/_blob/<id>` on every device.
 */

/** Width, in pixels, that captures are scaled to before saving. */
const MAX_DIMENSION = 640;
/** JPEG quality. 0.6 keeps faces clearly recognisable at roughly 30-45 KB. */
const QUALITY = 0.6;

/** Storage used by every stored file, refreshed after each upload or delete. */
let storageBytes = 0;

async function refreshUsage(): Promise<void> {
  try {
    const assets = await capability("assets");
    if (assets) storageBytes = (await assets.list()).usage.bytes;
  } catch {
    // The meter is informational only.
  }
}

void refreshUsage();

/** URL for an `<Image source>`; null when there's no photo. */
export function photoUri(fileName: string | null | undefined): string | null {
  return fileName ? `/_blob/${fileName}` : null;
}

function encodeJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The photo could not be processed."))),
      "image/jpeg",
      QUALITY
    )
  );
}

/**
 * Compresses a freshly captured/picked image and stores it.
 *
 * Compression is not cosmetic -- an uncompressed 4 MB camera shot per inmate
 * would use up the hostel's storage and make every backup slow to download.
 * The same 640px / 0.6 treatment as the phone app keeps each near 40 KB.
 */
export async function savePhoto(sourceUri: string): Promise<string> {
  const assets = await capability("assets");
  if (!assets) {
    throw new Error("Adding photos needs edit access to the hostel records.");
  }

  const source = await (await fetch(sourceUri)).blob();
  const bitmap = await createImageBitmap(source);
  const scale = MAX_DIMENSION / bitmap.width;
  const canvas = document.createElement("canvas");
  canvas.width = MAX_DIMENSION;
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const jpeg = await encodeJpeg(canvas);

  if (sourceUri.startsWith("blob:")) URL.revokeObjectURL(sourceUri);

  try {
    const stored = await assets.upload(jpeg, { type: "image/jpeg" });
    storageBytes += stored.sizeBytes;
    return stored.id;
  } catch (error) {
    throw new Error(describeError(error));
  }
}

/** Removes a stored photo. Never fails a save: a leftover file is harmless. */
export function deletePhoto(fileName: string | null | undefined): void {
  if (!fileName) return;
  void (async () => {
    try {
      const assets = await capability("assets");
      await assets?.delete(fileName);
      await refreshUsage();
    } catch {
      // A missing photo is not an error worth failing a save over.
    }
  })();
}

/** Base64 of a stored photo, for embedding in a backup file. */
export async function readPhotoBase64(fileName: string): Promise<string | null> {
  try {
    const response = await fetch(photoUri(fileName) as string);
    if (!response.ok) return null;
    return bytesToBase64(new Uint8Array(await response.arrayBuffer()));
  } catch {
    return null;
  }
}

/** Stores a photo carried in a backup file and returns its new id. */
export async function uploadPhotoBase64(base64: string): Promise<string> {
  const assets = await capability("assets");
  if (!assets) throw new Error("Restoring photos needs edit access to the hostel records.");
  try {
    const bytes = base64ToBytes(base64);
    const stored = await assets.upload(new Blob([bytes as BlobPart], { type: "image/jpeg" }), { type: "image/jpeg" });
    storageBytes += stored.sizeBytes;
    return stored.id;
  } catch (error) {
    throw new Error(describeError(error));
  }
}

/** Ids of every file already stored, so a restore can reuse rather than re-upload. */
export async function storedPhotoIds(): Promise<Set<string>> {
  try {
    const assets = await capability("assets");
    return new Set((await assets?.list())?.assets.map((asset) => asset.id) ?? []);
  } catch {
    return new Set();
  }
}

/** Total bytes used by stored files, for the Backup screen's size line. */
export function photosDiskUsage(): number {
  return storageBytes;
}
