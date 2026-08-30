import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import { newId } from "@/utils/id";

/**
 * Inmate photos live as ordinary JPEG files under `documents/photos/`, and the
 * database stores only the bare filename.
 *
 * Storing filenames (not absolute URIs) is deliberate: an app's sandbox path
 * changes between installs and across devices, so absolute URIs recorded in a
 * backup would all dangle after a restore.
 */
const PHOTO_DIR_NAME = "photos";

/** Long edge, in pixels, that captures are downscaled to before saving. */
const MAX_DIMENSION = 640;
/** JPEG quality. 0.6 keeps faces clearly recognisable at roughly 30-45 KB. */
const QUALITY = 0.6;

export function photosDirectory(): Directory {
  const dir = new Directory(Paths.document, PHOTO_DIR_NAME);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** Absolute `file://` URI for an `<Image source>`; null when there's no photo. */
export function photoUri(fileName: string | null | undefined): string | null {
  if (!fileName) return null;
  const file = new File(photosDirectory(), fileName);
  return file.exists ? file.uri : null;
}

/**
 * Compresses a freshly captured/picked image and stores it under a new name.
 *
 * Compression is not cosmetic — an uncompressed 4 MB camera shot per student
 * would make the backup file unusable to send over WhatsApp. At these settings
 * 500 students come to roughly 20 MB.
 */
export async function savePhoto(sourceUri: string): Promise<string> {
  const rendered = await ImageManipulator.manipulate(sourceUri)
    .resize({ width: MAX_DIMENSION })
    .renderAsync();
  const result = await rendered.saveAsync({ compress: QUALITY, format: SaveFormat.JPEG });

  const fileName = `${newId()}.jpg`;
  const destination = new File(photosDirectory(), fileName);
  const source = new File(result.uri);

  source.copy(destination);

  // Verify rather than assume. Returning a filename whose file never landed
  // would leave a student row pointing at nothing, surfacing much later as a
  // silently missing photo.
  if (!destination.exists) {
    writePhotoBase64(fileName, await source.base64());
  }
  if (!destination.exists) {
    throw new Error("The photo could not be saved to this device's storage.");
  }

  // The manipulator writes into the cache directory; drop our copy's source.
  try {
    source.delete();
  } catch {
    // Cache cleanup is best-effort — the OS will reclaim it anyway.
  }

  return fileName;
}

export function deletePhoto(fileName: string | null | undefined): void {
  if (!fileName) return;
  try {
    const file = new File(photosDirectory(), fileName);
    if (file.exists) file.delete();
  } catch {
    // A missing photo is not an error worth failing a save over.
  }
}

/** Base64 of a stored photo, for embedding in a backup. */
export async function readPhotoBase64(fileName: string): Promise<string | null> {
  try {
    const file = new File(photosDirectory(), fileName);
    if (!file.exists) return null;
    return await file.base64();
  } catch {
    return null;
  }
}

/** Writes a photo back out of a backup. */
export function writePhotoBase64(fileName: string, base64: string): void {
  const file = new File(photosDirectory(), fileName);
  if (file.exists) file.delete();
  file.create({ overwrite: true, intermediates: true });
  file.write(base64, { encoding: "base64" });
}

export function deleteAllPhotos(): void {
  try {
    const dir = photosDirectory();
    if (dir.exists) dir.delete();
  } catch {
    // Ignore — recreated lazily on next access.
  }
}

/** Total bytes used by stored photos, for the Backup screen's size estimate. */
export function photosDiskUsage(): number {
  try {
    return photosDirectory().size ?? 0;
  } catch {
    return 0;
  }
}
