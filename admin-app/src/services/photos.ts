import { useEffect, useState } from "react";
import { Platform } from "react-native";

import { capability, describeError } from "@/web/runtime";
import { bytesToBase64, base64ToBytes } from "@/web/shims/file-system";
import { getActiveBranchId } from "./branches";

/**
 * Inmate photos, both sides of their Aadhaar card and complaint photos live
 * in the backend's file storage, in a folder per branch. The record keeps
 * only the stored file's id -- the same field that held a bare filename on
 * the phone. A branch's manager can open their own branch's photos; the
 * admin can open both.
 */

export type PhotoKind = "profile" | "document";

/**
 * How far each kind is reduced before upload. A camera shot is 3-8 MB; these
 * keep a face clearly recognisable at about 60 KB and every line of an
 * Aadhaar card readable at about 200 KB, so storage is not spent on detail
 * nobody needs.
 */
const TARGET: Record<PhotoKind, { width: number; quality: number }> = {
  profile: { width: 640, quality: 0.7 },
  document: { width: 1400, quality: 0.78 },
};

/** Anything larger than this after compression is refused. */
const MAX_BYTES = 1024 * 1024;

/** Where a branch's photos are kept. */
function photoFolder(branchId: string | null | undefined): string {
  return `photos/${branchId || getActiveBranchId() || "shared"}`;
}

// --- display addresses ------------------------------------------------------

const urls = new Map<string, string | null>();
const waiting = new Map<string, Promise<string | null>>();
const listeners = new Set<() => void>();
/** When a lookup last failed, so it is tried again later rather than never. */
const failedAt = new Map<string, number>();
const RETRY_AFTER_MS = 15_000;

/** Looks up (once) the address an image can be shown from. */
function resolveUrl(fileName: string): Promise<string | null> {
  let pending = waiting.get(fileName);
  if (!pending) {
    pending = (async () => {
      let url: string | null = null;
      try {
        const assets = await capability("assets");
        url = assets?.url ? await assets.url(fileName) : `/_blob/${fileName}`;
        failedAt.delete(fileName);
      } catch {
        // Missing, refused, or no connection: shown as "no photo" and tried
        // again later.
        failedAt.set(fileName, Date.now());
        waiting.delete(fileName);
      }
      urls.set(fileName, url);
      listeners.forEach((listener) => listener());
      return url;
    })();
    waiting.set(fileName, pending);
  }
  return pending;
}

/**
 * Address for an `<Image source>` once known; null while it is being looked
 * up or when there is no photo. Components should use `usePhotoUri`, which
 * re-renders when the address arrives.
 */
export function photoUri(fileName: string | null | undefined): string | null {
  if (!fileName) return null;
  const failed = failedAt.get(fileName);
  if (!urls.has(fileName) || (failed !== undefined && Date.now() - failed > RETRY_AFTER_MS)) {
    void resolveUrl(fileName);
  }
  return urls.get(fileName) ?? null;
}

/** True when the photo exists on the record but could not be fetched. */
export function photoFailed(fileName: string | null | undefined): boolean {
  return !!fileName && failedAt.has(fileName);
}

/** The same address, awaited. For code that reads the photo's bytes. */
export async function photoUrl(fileName: string | null | undefined): Promise<string | null> {
  if (!fileName) return null;
  return urls.get(fileName) ?? resolveUrl(fileName);
}

/** `photoUri` for components: updates when the image's address is ready. */
export function usePhotoUri(fileName: string | null | undefined): string | null {
  const [, refresh] = useState(0);
  useEffect(() => {
    const listener = () => refresh((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return photoUri(fileName);
}

// --- compression ------------------------------------------------------------

/** Browser: draw the picture smaller on a canvas and re-encode it as JPEG. */
async function compressInBrowser(sourceUri: string, kind: PhotoKind): Promise<Blob> {
  const { width, quality } = TARGET[kind];
  const source = await (await fetch(sourceUri)).blob();
  const bitmap = await createImageBitmap(source);
  // Never enlarge: a small picture gains nothing but file size.
  const scale = Math.min(1, width / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  if (sourceUri.startsWith("blob:")) URL.revokeObjectURL(sourceUri);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The photo could not be processed."))),
      "image/jpeg",
      quality
    )
  );
}

/** Phone: the native image tools do the same resize and re-encode. */
async function compressOnPhone(sourceUri: string, kind: PhotoKind): Promise<Blob> {
  const { width, quality } = TARGET[kind];
  // Loaded only on a phone; the browser build has no such module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ImageManipulator, SaveFormat } = require("expo-image-manipulator");
  const rendered = await ImageManipulator.manipulate(sourceUri).resize({ width }).renderAsync();
  const result = await rendered.saveAsync({ compress: quality, format: SaveFormat.JPEG });
  return (await fetch(result.uri)).blob();
}

/**
 * Compresses a freshly captured/picked image and stores it, returning the id
 * to keep on the record.
 *
 * `kind` picks how much detail to keep: a profile photo is small, an ID
 * document keeps enough for its text to stay readable.
 */
export async function savePhoto(
  sourceUri: string,
  kind: PhotoKind = "profile",
  branchId?: string | null
): Promise<string> {
  const assets = await capability("assets");
  if (!assets) throw new Error("Adding photos needs a login that can change records.");

  const jpeg = Platform.OS === "web" ? await compressInBrowser(sourceUri, kind) : await compressOnPhone(sourceUri, kind);
  if (jpeg.size > MAX_BYTES) {
    throw new Error("That photo is too large even after compressing. Retake it a little further away.");
  }

  try {
    const stored = await assets.upload(jpeg, { type: "image/jpeg", folder: photoFolder(branchId) });
    return stored.id;
  } catch (error) {
    throw new Error(describeError(error));
  }
}

/** Removes a stored photo. Never fails a save: a leftover file is harmless. */
export function deletePhoto(fileName: string | null | undefined): void {
  if (!fileName) return;
  urls.delete(fileName);
  waiting.delete(fileName);
  void (async () => {
    try {
      const assets = await capability("assets");
      await assets?.delete(fileName);
    } catch {
      // A missing photo is not an error worth failing a save over.
    }
  })();
}

/** Base64 of a stored photo, for embedding in a backup file. */
export async function readPhotoBase64(fileName: string): Promise<string | null> {
  try {
    const url = await photoUrl(fileName);
    if (!url) return null;
    const response = await fetch(url);
    if (!response.ok) return null;
    return bytesToBase64(new Uint8Array(await response.arrayBuffer()));
  } catch {
    return null;
  }
}

/** Stores a photo carried in a backup file, in its branch's folder; returns its new id. */
export async function uploadPhotoBase64(base64: string, branchId?: string | null): Promise<string> {
  const assets = await capability("assets");
  if (!assets) throw new Error("Restoring photos needs a login that can change records.");
  try {
    const bytes = base64ToBytes(base64);
    const stored = await assets.upload(new Blob([bytes as BlobPart], { type: "image/jpeg" }), {
      type: "image/jpeg",
      folder: photoFolder(branchId),
    });
    return stored.id;
  } catch (error) {
    throw new Error(describeError(error));
  }
}

/**
 * Copies a photo into another branch's folder and removes the original.
 * Used when the admin moves an inmate between hostels, so the new branch's
 * manager can open their photos. Returns the new id, or the old one if the
 * copy could not be made.
 */
export async function movePhotoToBranch(fileName: string | null, branchId: string): Promise<string | null> {
  if (!fileName) return null;
  try {
    const base64 = await readPhotoBase64(fileName);
    if (!base64) return fileName;
    const moved = await uploadPhotoBase64(base64, branchId);
    deletePhoto(fileName);
    return moved;
  } catch {
    return fileName;
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

let storageBytes = 0;

/** Measures the storage used by photos. Slow on a large hostel; call sparingly. */
export async function measurePhotoUsage(): Promise<number> {
  try {
    const assets = await capability("assets");
    if (assets) storageBytes = (await assets.list()).usage.bytes;
  } catch {
    // The figure is informational only.
  }
  return storageBytes;
}

/** The last measured storage use, for the Backup screen's size line. */
export function photosDiskUsage(): number {
  return storageBytes;
}

// --- saving to the device ----------------------------------------------------

/**
 * Saves a stored photo to the device: a browser downloads it; a phone fetches
 * it and opens the share sheet (save to gallery, WhatsApp, print...).
 */
export async function savePhotoToDevice(fileName: string, saveAs: string): Promise<void> {
  const url = await photoUrl(fileName);
  if (!url) throw new Error("This photo could not be opened. Check the internet connection.");
  const name = `${saveAs.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "photo"}.jpg`;

  if (Platform.OS === "web") {
    const response = await fetch(url);
    if (!response.ok) throw new Error("This photo could not be downloaded. Try again.");
    const downloads = await capability("downloads");
    if (!downloads) throw new Error("Saving files is not available here.");
    await downloads.save({ filename: name, data: await response.blob() });
    return;
  }

  // Loaded only on a phone; the browser build has its own stand-ins.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { File, Paths } = require("expo-file-system");
  const Sharing = require("expo-sharing");
  /* eslint-enable @typescript-eslint/no-require-imports */
  const target = new File(Paths.cache, name);
  if (target.exists) target.delete();
  const saved = await File.downloadFileAsync(url, target);
  if (!(await Sharing.isAvailableAsync())) throw new Error("This phone cannot share files.");
  await Sharing.shareAsync(saved.uri, { mimeType: "image/jpeg", dialogTitle: `Save ${saveAs}` });
}
