import { Directory, File, Paths } from "expo-file-system";
import CryptoJS from "crypto-js";

import { closeDb, getDb } from "@/db";
import { BACKUP_TABLES, BackupTable, SCHEMA_VERSION } from "@/db/schema";
import {
  CHUNK_SIZE,
  KDF_ITERATIONS,
  bytesToText,
  createMac,
  deriveKeys,
  macMatches,
  newSaltBase64,
  openChunk,
  sealChunk,
  textToBytes,
} from "./crypto";
import { photosDirectory, readPhotoBase64, writePhotoBase64 } from "./photos";
import { loadSettings, saveSettings } from "./settings";

/**
 * Backup file format -- a line-oriented container that can be written and read
 * without ever holding the whole dataset in memory.
 *
 *   line 1     header JSON (always plaintext, so a file can be inspected)
 *   lines 2..N one base64 chunk per line
 *   last line  trailer JSON carrying the authentication tag
 *
 * The payload inside the chunks is NDJSON: one line per database row, then one
 * line per student photo. Streaming row-at-a-time is what keeps peak memory
 * near CHUNK_SIZE instead of near the size of the whole hostel.
 */

export const BACKUP_EXTENSION = "hostelbak";
const FORMAT = "hostel-backup";
const FORMAT_VERSION = 1;
const APP_VERSION = "1.0.0";
const READ_BLOCK = 128 * 1024;

export interface BackupCounts {
  students: number;
  rooms: number;
  feeRecords: number;
  payments: number;
  photos: number;
}

export interface BackupHeader {
  format: string;
  formatVersion: number;
  schemaVersion: number;
  appVersion: string;
  createdAt: number;
  hostelName: string;
  counts: BackupCounts;
  encryption: {
    algorithm: "AES-256-CBC";
    mac: "HMAC-SHA256";
    kdf: "PBKDF2-SHA256";
    iterations: number;
    salt: string;
  } | null;
}

export interface BackupProgress {
  phase:
    | "reading"
    | "encrypting"
    | "writing"
    | "uploading"
    | "downloading"
    | "verifying"
    | "decrypting"
    | "restoring"
    | "done";
  /** 0..1, or null when the total is not yet known. */
  fraction: number | null;
  detail: string;
}

type ProgressFn = (progress: BackupProgress) => void;

export class BackupError extends Error {}

// --- paths ------------------------------------------------------------------

function backupsDirectory(): Directory {
  const dir = new Directory(Paths.document, "backups");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** Exports land in the cache directory: they are meant to be shared out, not kept. */
function exportsDirectory(): Directory {
  const dir = new Directory(Paths.cache, "exports");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function timestampSlug(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `_${pad(date.getHours())}${pad(date.getMinutes())}`
  );
}

function safeName(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "Hostel";
}

// --- writing ----------------------------------------------------------------

/**
 * Buffers payload lines, seals each full chunk, and streams it straight to
 * disk while folding it into the running MAC.
 */
class ChunkWriter {
  private buffer = "";
  private readonly handle: ReturnType<File["open"]>;
  private readonly mac: ReturnType<typeof createMac> | null;
  private readonly encKey: CryptoJS.lib.WordArray | null;
  chunkCount = 0;

  constructor(file: File, headerLine: string, keys: { encKey: CryptoJS.lib.WordArray; macKey: CryptoJS.lib.WordArray } | null) {
    this.handle = file.open();
    this.encKey = keys?.encKey ?? null;
    this.mac = keys ? createMac(keys.macKey) : null;
    this.writeRaw(`${headerLine}\n`);
    // Binding the header into the MAC stops anyone editing the counts, schema
    // version or KDF parameters without invalidating the file.
    this.mac?.update(headerLine);
  }

  private writeRaw(text: string): void {
    this.handle.writeBytes(textToBytes(text));
  }

  push(line: string): void {
    this.buffer += `${line}\n`;
    if (this.buffer.length >= CHUNK_SIZE) this.flush();
  }

  private flush(): void {
    if (!this.buffer) return;
    const sealed = this.encKey
      ? sealChunk(this.buffer, this.encKey)
      : CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(this.buffer));
    this.buffer = "";
    this.chunkCount += 1;
    this.mac?.update(sealed);
    this.writeRaw(`${sealed}\n`);
  }

  /** Flushes the tail and appends the trailer. */
  finish(): void {
    this.flush();
    const tag = this.mac ? this.mac.finalize() : "";
    this.writeRaw(`${JSON.stringify({ mac: tag })}\n`);
    this.handle.close();
  }

  abort(): void {
    try {
      this.handle.close();
    } catch {
      // Already closed.
    }
  }
}

async function collectCounts(): Promise<BackupCounts> {
  const db = await getDb();
  const one = async (table: string) => {
    const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table};`);
    return row?.n ?? 0;
  };
  // Counts photo *files*, not students -- a student can have both a profile
  // photo and both sides of an ID proof, so this is a sum of three columns.
  const photos = await db.getFirstAsync<{ n: number }>(
    `SELECT
       (SELECT COUNT(*) FROM students WHERE photoFile IS NOT NULL AND photoFile <> '') +
       (SELECT COUNT(*) FROM students WHERE idProofFile IS NOT NULL AND idProofFile <> '') +
       (SELECT COUNT(*) FROM students WHERE idProofBackFile IS NOT NULL AND idProofBackFile <> '') AS n;`
  );
  return {
    students: await one("students"),
    rooms: await one("rooms"),
    feeRecords: await one("fee_records"),
    payments: await one("payments"),
    photos: photos?.n ?? 0,
  };
}

export interface ExportResult {
  uri: string;
  fileName: string;
  sizeBytes: number;
  counts: BackupCounts;
  encrypted: boolean;
}

/**
 * Writes a complete backup.
 *
 * `passphrase` is optional only so that automatic snapshots (which stay inside
 * the app's private storage) can be written unattended. Anything leaving the
 * phone should always be encrypted -- see `exportForSharing`.
 */
export async function writeBackup(
  destination: File,
  passphrase: string | null,
  onProgress?: ProgressFn
): Promise<ExportResult> {
  const db = await getDb();
  const settings = await loadSettings();
  const counts = await collectCounts();

  const keys = passphrase
    ? (() => {
        const salt = newSaltBase64();
        return { salt, ...deriveKeys(passphrase, salt, KDF_ITERATIONS) };
      })()
    : null;

  const header: BackupHeader = {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    createdAt: Date.now(),
    hostelName: settings.hostelName,
    counts,
    encryption: keys
      ? {
          algorithm: "AES-256-CBC",
          mac: "HMAC-SHA256",
          kdf: "PBKDF2-SHA256",
          iterations: KDF_ITERATIONS,
          salt: keys.salt,
        }
      : null,
  };

  if (destination.exists) destination.delete();
  destination.create({ overwrite: true, intermediates: true });

  const writer = new ChunkWriter(
    destination,
    JSON.stringify(header),
    keys ? { encKey: keys.encKey, macKey: keys.macKey } : null
  );

  try {
    const totalUnits = Math.max(
      counts.students + counts.rooms + counts.feeRecords + counts.payments + counts.photos,
      1
    );
    let done = 0;

    for (const table of BACKUP_TABLES) {
      onProgress?.({ phase: "reading", fraction: done / totalUnits, detail: `Reading ${table}` });
      const rows = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${table};`);
      for (const row of rows) {
        writer.push(JSON.stringify({ t: "row", table, d: row }));
        done += 1;
      }
    }

    // Photos last: they dominate the file, so progress stays meaningful.
    // Every student can carry three image files -- their profile photo and
    // both sides of their ID proof -- all stored the same way in the
    // photos directory, so they are gathered into one flat list here.
    const photoRows = await db.getAllAsync<{
      photoFile: string | null;
      idProofFile: string | null;
      idProofBackFile: string | null;
    }>(
      `SELECT photoFile, idProofFile, idProofBackFile FROM students
       WHERE (photoFile IS NOT NULL AND photoFile <> '')
          OR (idProofFile IS NOT NULL AND idProofFile <> '')
          OR (idProofBackFile IS NOT NULL AND idProofBackFile <> '');`
    );
    const photoFiles = photoRows.flatMap((row) =>
      [row.photoFile, row.idProofFile, row.idProofBackFile].filter((f): f is string => Boolean(f))
    );
    let photoIndex = 0;
    for (const photoFile of photoFiles) {
      photoIndex += 1;
      onProgress?.({
        phase: "encrypting",
        fraction: done / totalUnits,
        detail: `Photo ${photoIndex} of ${photoFiles.length}`,
      });
      const base64 = await readPhotoBase64(photoFile);
      // A missing file is recorded as absent rather than aborting the whole
      // backup -- one lost thumbnail must not cost the admin their data.
      if (base64) writer.push(JSON.stringify({ t: "photo", f: photoFile, b: base64 }));
      done += 1;
    }

    onProgress?.({ phase: "writing", fraction: 0.98, detail: "Finalising file" });
    writer.finish();
  } catch (error) {
    writer.abort();
    try {
      if (destination.exists) destination.delete();
    } catch {
      // Leave the partial file if it cannot be removed; the header will not verify.
    }
    throw error;
  }

  onProgress?.({ phase: "done", fraction: 1, detail: "Backup complete" });

  return {
    uri: destination.uri,
    fileName: destination.name,
    sizeBytes: destination.size ?? 0,
    counts,
    encrypted: keys !== null,
  };
}

/** Creates an encrypted file in the cache directory, ready to hand to the share sheet. */
export async function exportForSharing(
  passphrase: string,
  onProgress?: ProgressFn
): Promise<ExportResult> {
  const settings = await loadSettings();
  const fileName = `${safeName(settings.hostelName)}_${timestampSlug()}.${BACKUP_EXTENSION}`;
  const file = new File(exportsDirectory(), fileName);
  const result = await writeBackup(file, passphrase, onProgress);
  await saveSettings({ lastBackupAt: Date.now() });
  return result;
}

/** Rotating unattended snapshot kept inside app storage. */
export async function writeAutoBackup(keep = 5): Promise<ExportResult> {
  const file = new File(backupsDirectory(), `auto_${timestampSlug()}.${BACKUP_EXTENSION}`);
  const result = await writeBackup(file, null);
  pruneAutoBackups(keep);
  return result;
}

/** Snapshot taken immediately before a restore, so a wrong file is recoverable. */
export async function writeSafetySnapshot(): Promise<ExportResult> {
  const file = new File(backupsDirectory(), `before-restore_${timestampSlug()}.${BACKUP_EXTENSION}`);
  return writeBackup(file, null);
}

function pruneAutoBackups(keep: number): void {
  try {
    const entries = backupsDirectory()
      .list()
      .filter((entry): entry is File => entry instanceof File && entry.name.startsWith("auto_"))
      .sort((a, b) => b.name.localeCompare(a.name));
    for (const stale of entries.slice(keep)) stale.delete();
  } catch {
    // Pruning is housekeeping; never let it fail a backup.
  }
}

export interface LocalBackup {
  uri: string;
  name: string;
  sizeBytes: number;
  createdAt: number;
}

export function listLocalBackups(): LocalBackup[] {
  try {
    return backupsDirectory()
      .list()
      .filter((entry): entry is File => entry instanceof File)
      .map((file) => ({
        uri: file.uri,
        name: file.name,
        sizeBytes: file.size ?? 0,
        createdAt: file.info().modificationTime ?? 0,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

// --- reading ----------------------------------------------------------------

/**
 * Streams a file line by line, holding back one line so the caller can treat
 * the final line as the trailer without buffering the whole file.
 */
function forEachLine(file: File, onLine: (line: string, isLast: boolean) => void): void {
  const handle = file.open();
  try {
    let carry = "";
    let pending: string | null = null;

    const emit = (line: string) => {
      if (pending !== null) onLine(pending, false);
      pending = line;
    };

    for (;;) {
      const bytes = handle.readBytes(READ_BLOCK);
      if (!bytes || bytes.length === 0) break;
      carry += bytesToText(bytes);

      let index = carry.indexOf("\n");
      while (index !== -1) {
        emit(carry.slice(0, index));
        carry = carry.slice(index + 1);
        index = carry.indexOf("\n");
      }
    }

    if (carry.length > 0) emit(carry);
    if (pending !== null) onLine(pending, true);
  } finally {
    handle.close();
  }
}

export function readBackupHeader(fileUri: string): BackupHeader {
  const file = new File(fileUri);
  if (!file.exists) throw new BackupError("That file could not be opened.");

  const handle = file.open();
  let text = "";
  try {
    for (let i = 0; i < 8 && !text.includes("\n"); i += 1) {
      const bytes = handle.readBytes(READ_BLOCK);
      if (!bytes || bytes.length === 0) break;
      text += bytesToText(bytes);
    }
  } finally {
    handle.close();
  }

  const firstLine = text.split("\n")[0] ?? "";
  let header: BackupHeader;
  try {
    header = JSON.parse(firstLine) as BackupHeader;
  } catch {
    throw new BackupError("This is not a hostel backup file.");
  }

  if (header.format !== FORMAT) {
    throw new BackupError("This is not a hostel backup file.");
  }
  if (header.formatVersion > FORMAT_VERSION) {
    throw new BackupError(
      "This backup was made by a newer version of the app. Please update before restoring it."
    );
  }
  if (header.schemaVersion > SCHEMA_VERSION) {
    throw new BackupError(
      "This backup contains data from a newer version of the app. Please update before restoring it."
    );
  }
  return header;
}

export interface RestoreResult {
  counts: BackupCounts;
  /** Rows actually added, keyed by table. Rows already present on this phone are not counted. */
  inserted: Partial<Record<BackupTable, number>>;
  /** Rows from the backup that were skipped because a matching row already existed. */
  skipped: Partial<Record<BackupTable, number>>;
  rowsRestored: number;
  photosRestored: number;
  photosSkipped: number;
  safetySnapshotUri: string | null;
}

/**
 * Adds the contents of `fileUri` to whatever is already on this phone.
 *
 * This is a merge, not a replace: existing rows are never touched, and a
 * backup row that shares an id (or, for fee records, a studentId+period) with
 * one already on the phone is skipped rather than overwriting it. That makes
 * importing a backup from another phone -- or re-importing the same file --
 * safe to run any number of times without losing local edits. `settings`
 * (active branch, admission counters, last-backup time) is per-phone
 * configuration and is deliberately never imported.
 *
 * Order of operations is deliberate:
 *   1. verify the MAC over the entire file,
 *   2. take a safety snapshot of current data,
 *   3. only then merge.
 *
 * Verifying first means a truncated download or a wrong passphrase costs
 * nothing -- the existing data is still untouched when the error is raised.
 */
export async function restoreBackup(
  fileUri: string,
  passphrase: string | null,
  onProgress?: ProgressFn
): Promise<RestoreResult> {
  const file = new File(fileUri);
  const header = readBackupHeader(fileUri);

  if (header.encryption && !passphrase) {
    throw new BackupError("This backup is encrypted. Enter its passphrase to restore it.");
  }

  onProgress?.({ phase: "verifying", fraction: null, detail: "Checking the file" });

  const keys = header.encryption
    ? deriveKeys(passphrase ?? "", header.encryption.salt, header.encryption.iterations)
    : null;

  // Pass 1 -- authenticate before decrypting anything.
  const headerLine = JSON.stringify(header);
  let trailerMac = "";
  let chunkTotal = 0;

  if (keys) {
    const mac = createMac(keys.macKey);
    mac.update(headerLine);
    let first = true;
    forEachLine(file, (line, isLast) => {
      if (first) {
        first = false;
        return; // header, already folded in
      }
      if (isLast) {
        try {
          trailerMac = (JSON.parse(line) as { mac: string }).mac ?? "";
        } catch {
          trailerMac = "";
        }
        return;
      }
      chunkTotal += 1;
      mac.update(line);
    });

    if (!macMatches(mac.finalize(), trailerMac)) {
      throw new BackupError(
        "Could not open this backup. Either the passphrase is wrong or the file is damaged."
      );
    }
  } else {
    forEachLine(file, (_line, isLast) => {
      if (!isLast) chunkTotal += 1;
    });
    chunkTotal = Math.max(chunkTotal - 1, 0); // exclude the header line
  }

  // Snapshot the current state only once the incoming file is known to be good.
  onProgress?.({ phase: "verifying", fraction: null, detail: "Saving a safety copy" });
  let safetySnapshotUri: string | null = null;
  try {
    safetySnapshotUri = (await writeSafetySnapshot()).uri;
  } catch {
    // A hostel restoring onto a brand-new phone has nothing to snapshot.
    safetySnapshotUri = null;
  }

  const db = await getDb();
  let rowsRestored = 0;
  let photosRestored = 0;
  let chunkIndex = 0;

  // Pass 2 -- decrypt and apply.
  const pendingRows: { table: string; row: Record<string, unknown> }[] = [];
  const photoWrites: { file: string; base64: string }[] = [];

  const applyLine = (payloadLine: string) => {
    if (!payloadLine.trim()) return;
    let parsed: { t: string; table?: string; d?: Record<string, unknown>; f?: string; b?: string };
    try {
      parsed = JSON.parse(payloadLine);
    } catch {
      return; // Skip an unreadable line rather than abandoning the restore.
    }
    if (parsed.t === "row" && parsed.table && parsed.d) {
      // Settings are per-phone configuration, not hostel records -- importing
      // another phone's active branch or admission counter would be wrong.
      if (parsed.table === "settings") return;
      pendingRows.push({ table: parsed.table, row: parsed.d });
    } else if (parsed.t === "photo" && parsed.f && parsed.b) {
      photoWrites.push({ file: parsed.f, base64: parsed.b });
    }
  };

  let carry = "";
  let first = true;
  forEachLine(file, (line, isLast) => {
    if (first) {
      first = false;
      return;
    }
    if (isLast) return; // trailer

    chunkIndex += 1;
    onProgress?.({
      phase: "decrypting",
      fraction: chunkTotal ? chunkIndex / chunkTotal : null,
      detail: `Reading part ${chunkIndex} of ${chunkTotal || "?"}`,
    });

    const plain = keys
      ? openChunk(line, keys.encKey)
      : CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(line));

    carry += plain;
    let index = carry.indexOf("\n");
    while (index !== -1) {
      applyLine(carry.slice(0, index));
      carry = carry.slice(index + 1);
      index = carry.indexOf("\n");
    }
  });
  if (carry.trim()) applyLine(carry);

  // Insert with foreign keys off: rows arrive in table order, but a student can
  // reference a room that has not been re-inserted yet within the same pass.
  // OR IGNORE is what makes this a merge: a row whose primary key (or, for fee
  // records, whose studentId+period) already exists is silently skipped,
  // leaving the phone's own copy untouched rather than overwriting it.
  onProgress?.({ phase: "restoring", fraction: 0.5, detail: "Merging records" });
  const inserted: Partial<Record<BackupTable, number>> = {};
  const skipped: Partial<Record<BackupTable, number>> = {};
  await db.execAsync("PRAGMA foreign_keys = OFF;");
  try {
    await db.withExclusiveTransactionAsync(async (txn) => {
      for (const { table, row } of pendingRows) {
        const columns = Object.keys(row);
        if (columns.length === 0) continue;
        const placeholders = columns.map(() => "?").join(", ");
        const values = columns.map((key) => row[key] as string | number | null);
        const result = await txn.runAsync(
          `INSERT OR IGNORE INTO ${table} (${columns.join(", ")}) VALUES (${placeholders});`,
          values
        );
        const key = table as BackupTable;
        if (result.changes > 0) {
          inserted[key] = (inserted[key] ?? 0) + 1;
          rowsRestored += 1;
        } else {
          skipped[key] = (skipped[key] ?? 0) + 1;
        }
      }
    });
  } finally {
    await db.execAsync("PRAGMA foreign_keys = ON;");
  }

  onProgress?.({ phase: "restoring", fraction: 0.8, detail: "Adding photos" });
  let photosSkipped = 0;
  for (const photo of photoWrites) {
    try {
      // Photo filenames are freshly generated ids (see services/photos.ts), so a
      // collision means this exact photo is already on the phone -- keep it.
      if (new File(photosDirectory(), photo.file).exists) {
        photosSkipped += 1;
        continue;
      }
      writePhotoBase64(photo.file, photo.base64);
      photosRestored += 1;
    } catch {
      // A photo that cannot be written leaves the student record intact.
    }
  }

  onProgress?.({ phase: "done", fraction: 1, detail: "Import complete" });

  return {
    counts: header.counts,
    inserted,
    skipped,
    rowsRestored,
    photosRestored,
    photosSkipped,
    safetySnapshotUri,
  };
}

/** Frees cached export files once they have been shared. */
export function clearExportCache(): void {
  try {
    const dir = exportsDirectory();
    if (dir.exists) dir.delete();
  } catch {
    // Cache is reclaimed by the OS regardless.
  }
}

export { closeDb };
