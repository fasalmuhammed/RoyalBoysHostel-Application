/**
 * Browser stand-in for `expo-sharing`.
 *
 * On a phone, reports, receipts and backups go out through the share sheet.
 * In a claude.ai artifact the equivalent is the `downloads` capability, which
 * shows the viewer a save prompt. Files come from the in-memory file system
 * (reports, receipts, backups) or from Claude storage (`/_blob/<id>` photos).
 */
import { capability, describeError } from "../runtime";
import { readVirtualFile } from "./file-system";

/** Extensions the artifact frame will save; anything else is saved as .txt. */
const ALLOWED = new Set(
  "gif png jpg jpeg webp mp4 webm txt json md docx pptx epub csv ttf html svg pdf xlsx zip".split(" ")
);
const EXTENSION_FOR: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "text/csv": "csv",
};

const registeredNames = new Map<string, string>();

/** Gives a URI a human filename for when it is saved, e.g. a snapshot asset. */
export function registerDownloadName(uri: string, fileName: string): void {
  registeredNames.set(uri, fileName);
}

interface ShareOptions {
  mimeType?: string;
  dialogTitle?: string;
  UTI?: string;
}

function cleanName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "download";
}

function fileNameFor(uri: string, options: ShareOptions): string {
  const registered = registeredNames.get(uri);
  const fromUri = decodeURIComponent(uri.split("?")[0].split("/").pop() ?? "");
  const mimeExt = options.mimeType ? EXTENSION_FOR[options.mimeType] : undefined;

  let name: string;
  if (registered) {
    name = registered;
  } else if (mimeExt && (mimeExt === "pdf" || mimeExt === "jpg") && options.dialogTitle) {
    // Receipts and ID images are titled for the person ("Receipt — Arjun"),
    // which names the file better than a generated path.
    name = `${options.dialogTitle.replace(/^Save\s+/i, "")}.${mimeExt}`;
  } else {
    name = fromUri || "download";
  }

  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if (!ext && mimeExt) name = `${name}.${mimeExt}`;
  else if (!ALLOWED.has(ext)) name = `${name}.txt`;
  return cleanName(name);
}

export async function isAvailableAsync(): Promise<boolean> {
  return (await capability("downloads")) !== null;
}

export async function shareAsync(uri: string, options: ShareOptions = {}): Promise<void> {
  const downloads = await capability("downloads");
  if (!downloads) throw new Error("Saving files is not available in this view.");

  let data: Blob;
  const local = readVirtualFile(uri);
  if (local) {
    data = new Blob([local as BlobPart], { type: options.mimeType ?? "application/octet-stream" });
  } else {
    const response = await fetch(uri);
    if (!response.ok) throw new Error("That file is no longer available.");
    data = await response.blob();
  }

  try {
    await downloads.save({ filename: fileNameFor(uri, options), data });
  } catch (error) {
    // Dismissing the save prompt is like closing a share sheet: not an error.
    if (error && typeof error === "object" && (error as { code?: string }).code === "declined") return;
    throw new Error(describeError(error));
  }
}
