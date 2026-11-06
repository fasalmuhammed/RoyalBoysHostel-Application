import { Directory, File, Paths } from "expo-file-system";
import CryptoJS from "crypto-js";

import { BACKUP_TABLES, BackupTable, SCHEMA_VERSION } from "@/db/schema";
import {
  Branch,
  Complaint,
  Inmate,
  MessageKind,
  MessageLogEntry,
  MessageTemplate,
  Notice,
  PaymentMethod,
  Room,
} from "@/types";
import { newId } from "@/utils/id";
import { capability, describeError } from "@/web/runtime";
import { registerDownloadName } from "@/web/shims/sharing";
import { entries, find, freshWhere, limitedToBranch, list, logActivity, put, remove, runThrottled, withLock } from "@/store/cloud";
import { BillDoc, FeeYearDoc, PaymentDoc, allBills, feeDocId } from "@/store/views";
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
import { readPhotoBase64, storedPhotoIds, uploadPhotoBase64 } from "./photos";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "./settings";


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

// --- records as backup rows -----------------------------------------------------

/**
 * The live records, shaped exactly as the phone app's SQLite rows.
 *
 * Keeping the row format identical means a file exported here restores on a
 * phone, and a phone's file restores here, with no conversion step.
 */
type Row = Record<string, unknown>;

interface ChunkDoc {
  batchId: string;
  entries?: Record<string, Omit<MessageLogEntry, "batchId">>;
}

const COUNTER_PREFIX = "admission-";

function exportRows(): Record<BackupTable, Row[]> {
  const bills = allBills();
  const settings = find<Row>("config", "settings") ?? {};
  return {
    branches: list<Branch>("branches") as unknown as Row[],
    rooms: list<Room>("rooms") as unknown as Row[],
    students: list<Inmate>("inmates") as unknown as Row[],
    fee_records: bills.map(({ docId: _doc, payments: _payments, ...bill }) => bill),
    payments: bills.flatMap((bill) => bill.payments) as unknown as Row[],
    message_templates: list<MessageTemplate>("templates").map((template) => ({
      ...template,
      isBuiltIn: template.isBuiltIn ? 1 : 0,
    })),
    message_log: list<ChunkDoc>("messages").flatMap((doc) =>
      Object.values(doc.entries ?? {}).map((entry) => ({ ...entry, batchId: doc.batchId, branchId: null }))
    ),
    notices: list<Notice>("notices").map((notice) => ({ ...notice, pinned: notice.pinned ? 1 : 0 })),
    complaints: list<Complaint>("complaints") as unknown as Row[],
    settings: [
      ...Object.keys(DEFAULT_SETTINGS)
        .filter((key) => key in settings)
        .map((key) => ({ key, value: JSON.stringify(settings[key] ?? null) })),
      // The admission sequence rides along under the phone app's key name.
      ...entries<{ value?: number }>("counters")
        .filter(([id]) => id.startsWith(COUNTER_PREFIX))
        .map(([id, doc]) => ({
          key: `admissionCounter:${id.slice(COUNTER_PREFIX.length)}`,
          value: String(doc.value ?? 0),
        })),
    ],
  };
}

/** Every stored photo a record points at: profile, both Aadhaar sides, complaints. */
function photoNames(rows: Record<BackupTable, Row[]>): string[] {
  const names = new Set<string>();
  for (const row of rows.students) {
    for (const key of ["photoFile", "idProofFile", "idProofBackFile"]) {
      const value = row[key];
      if (typeof value === "string" && value) names.add(value);
    }
  }
  for (const row of rows.complaints) {
    if (typeof row.photoFile === "string" && row.photoFile) names.add(row.photoFile);
  }
  return [...names];
}

function collectCounts(rows = exportRows()): BackupCounts {
  return {
    students: rows.students.length,
    rooms: rows.rooms.length,
    feeRecords: rows.fee_records.length,
    payments: rows.payments.length,
    photos: photoNames(rows).length,
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
 * `passphrase` is optional only so that snapshots (which stay inside the
 * hostel's private online storage) can be written unattended. Anything
 * downloaded should always be encrypted -- see `exportForSharing`.
 *
 * Photos are embedded unless `includePhotos` is false: snapshots leave them
 * out because the photos already sit in online storage under the same ids.
 */
export async function writeBackup(
  destination: File,
  passphrase: string | null,
  onProgress?: ProgressFn,
  { includePhotos = true }: { includePhotos?: boolean } = {}
): Promise<ExportResult> {
  const settings = await loadSettings();
  const rows = exportRows();
  const counts = collectCounts(rows);

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
    const photoFiles = includePhotos ? photoNames(rows) : [];
    const totalUnits = Math.max(
      counts.students + counts.rooms + counts.feeRecords + counts.payments + photoFiles.length,
      1
    );
    let done = 0;

    for (const table of BACKUP_TABLES) {
      onProgress?.({ phase: "reading", fraction: done / totalUnits, detail: `Reading ${table}` });
      for (const row of rows[table]) {
        writer.push(JSON.stringify({ t: "row", table, d: row }));
        done += 1;
      }
    }

    // Photos last: they dominate the file, so progress stays meaningful.
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

/** Creates an encrypted file, ready to hand to the download prompt. */
export async function exportForSharing(
  passphrase: string,
  onProgress?: ProgressFn
): Promise<ExportResult> {
  const settings = await loadSettings();
  const fileName = `${safeName(settings.hostelName)}_${timestampSlug()}.${BACKUP_EXTENSION}`;
  const file = new File(exportsDirectory(), fileName);
  const result = await writeBackup(file, passphrase, onProgress);
  await saveSettings({ lastBackupAt: Date.now() });
  logActivity({ action: "created", entity: "backup", entityId: fileName, label: "Backup file downloaded", branchId: null });
  return result;
}

// --- snapshots ------------------------------------------------------------------

/**
 * Snapshots are unencrypted backups kept inside the hostel's online storage:
 * the file in the file store, its details in the `snapshots` collection.
 * They protect against mistakes -- a wrong restore, a bulk change -- and
 * are listed on the Backup screen to download.
 */
interface SnapshotDoc {
  id: string;
  name: string;
  kind: "auto" | "before-restore";
  createdAt: number;
  sizeBytes: number;
  assetId: string;
}

async function storeSnapshot(kind: SnapshotDoc["kind"]): Promise<ExportResult> {
  const name = `${kind === "auto" ? "auto" : "before-restore"}_${timestampSlug()}.${BACKUP_EXTENSION}`;
  const file = new File(backupsDirectory(), name);
  const result = await writeBackup(file, null, undefined, { includePhotos: false });

  const assets = await capability("assets");
  if (!assets) {
    file.delete();
    throw new BackupError("Saving a snapshot needs edit access to the hostel records.");
  }

  let stored: { id: string; sizeBytes: number };
  try {
    stored = await assets.upload(new Blob([await file.bytes()], { type: "text/plain" }), {
      type: "text/plain",
      folder: "snapshots",
    });
  } catch (error) {
    throw new BackupError(describeError(error));
  } finally {
    file.delete();
  }

  const id = newId();
  const createdAt = Date.now();
  await put("snapshots", id, { id, name, kind, createdAt, sizeBytes: stored.sizeBytes, assetId: stored.id });
  return { ...result, uri: `/_blob/${stored.id}`, fileName: name, sizeBytes: stored.sizeBytes };
}

/** Rotating snapshot kept in online storage. */
export async function writeAutoBackup(keep = 5): Promise<ExportResult> {
  const result = await storeSnapshot("auto");
  await pruneAutoBackups(keep);
  return result;
}

/** Snapshot taken immediately before a restore, so a wrong file is recoverable. */
export async function writeSafetySnapshot(): Promise<ExportResult> {
  return storeSnapshot("before-restore");
}

async function pruneAutoBackups(keep: number): Promise<void> {
  try {
    const assets = await capability("assets");
    const stale = list<SnapshotDoc>("snapshots")
      .filter((snapshot) => snapshot.kind === "auto")
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(keep);
    for (const snapshot of stale) {
      await assets?.delete(snapshot.assetId);
      await remove("snapshots", snapshot.id);
    }
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
  return list<SnapshotDoc>("snapshots")
    .map((snapshot) => {
      const uri = `/_blob/${snapshot.assetId}`;
      registerDownloadName(uri, snapshot.name);
      return { uri, name: snapshot.name, sizeBytes: snapshot.sizeBytes, createdAt: snapshot.createdAt };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
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
  /** Rows actually added, keyed by table. Records already in online storage are not counted. */
  inserted: Partial<Record<BackupTable, number>>;
  /** Rows from the backup that were skipped because a matching row already existed. */
  skipped: Partial<Record<BackupTable, number>>;
  rowsRestored: number;
  photosRestored: number;
  photosSkipped: number;
  safetySnapshotUri: string | null;
}

/**
 * Adds the contents of `fileUri` to the hostel records in online storage.
 *
 * This is a merge, not a replace: existing rows are never touched, and a
 * backup row that shares an id (or, for fee records, a studentId+period) with
 * one already stored is skipped rather than overwriting it. That makes
 * importing the phone app's backup -- or re-importing the same file --
 * safe to run any number of times without losing local edits. `settings`
 * (active branch, admission counters, last-backup time) is per-installation
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
    // A brand-new hostel has nothing to snapshot.
    safetySnapshotUri = null;
  }


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
  const photoMap = new Map(photoWrites.map((photo) => [photo.file, photo.base64]));

  // Merge -- add what is new, keep everything already in online storage.
  // A record whose id already exists (or, for bills, whose inmate + month
  // already has one) is skipped rather than overwritten, which makes
  // importing the same file twice harmless.
  onProgress?.({ phase: "restoring", fraction: 0.4, detail: "Merging records" });
  const plan = planMerge(pendingRows);
  const inserted = plan.inserted;
  const skipped = plan.skipped;

  const knownPhotos = await storedPhotoIds();
  const uploadedPhotos = new Map<string, string>();
  const alreadyStored = new Set<string>();
  let photosRestored = 0;

  /** Points a record at a stored photo, uploading the file's copy if needed. */
  const remapPhoto = async (name: unknown, branchId?: string | null): Promise<string | null> => {
    if (typeof name !== "string" || !name) return null;
    if (knownPhotos.has(name)) {
      alreadyStored.add(name);
      return name;
    }
    const done = uploadedPhotos.get(name);
    if (done) return done;
    const base64 = photoMap.get(name);
    // A snapshot carries no photo bytes; its records keep their stored ids.
    if (!base64) return name;
    const id = await uploadPhotoBase64(base64, branchId);
    uploadedPhotos.set(name, id);
    photosRestored += 1;
    return id;
  };

  const steps = plan.simple.length + plan.feeDocs.size + plan.messageBatches.size;
  let stepsDone = 0;
  const tick = (detail: string) => {
    stepsDone += 1;
    onProgress?.({ phase: "restoring", fraction: 0.4 + 0.58 * (stepsDone / Math.max(steps, 1)), detail });
  };

  await runThrottled(plan.simple, async ({ collection, id, data }) => {
    const body = { ...data };
    if (collection === "inmates") {
      const branch = body.branchId as string | null;
      body.photoFile = await remapPhoto(body.photoFile, branch);
      body.idProofFile = await remapPhoto(body.idProofFile, branch);
      body.idProofBackFile = await remapPhoto(body.idProofBackFile, branch);
    } else if (collection === "complaints") {
      body.photoFile = await remapPhoto(body.photoFile, body.branchId as string | null);
    }
    await put(collection, id, body);
    tick(`Adding ${collection}`);
  });

  await runThrottled([...plan.feeDocs.entries()], async ([docId, incoming]) => {
    await withLock("fees", docId, async () => {
      const current = (await freshWhere<FeeYearDoc>("fees", "studentId", incoming.studentId)).find(
        (doc) => doc.year === incoming.year
      );
      const bills: Record<string, BillDoc> = { ...(current?.bills ?? {}) };
      for (const [period, bill] of Object.entries(incoming.bills)) {
        if (bills[period]) {
          // Raised elsewhere since the plan was made: keep the existing bill.
          continue;
        }
        bills[period] = bill;
      }
      for (const [billId, payments] of incoming.extraPayments) {
        const target = Object.values(bills).find((bill) => bill.id === billId);
        if (!target) continue;
        target.payments = { ...(target.payments ?? {}) };
        for (const payment of payments) {
          if (!target.payments[payment.id]) target.payments[payment.id] = payment;
        }
      }
      await put("fees", docId, {
        studentId: incoming.studentId,
        year: incoming.year,
        branchId: find<Inmate>("inmates", incoming.studentId)?.branchId ?? current?.branchId ?? null,
        bills,
      });
    });
    tick("Adding bills and payments");
  });

  await runThrottled([...plan.messageBatches.entries()], async ([batchId, batch]) => {
    const existingChunks = entries<{ batchId: string }>("messages").filter(([, doc]) => doc.batchId === batchId).length;
    for (let start = 0, chunk = existingChunks; start < batch.entries.length; start += 100, chunk += 1) {
      const part = Object.fromEntries(batch.entries.slice(start, start + 100).map((entry) => [entry.id, entry]));
      await put("messages", `${batchId}-${chunk}`, {
        batchId,
        branchId: limitedToBranch(),
        chunk,
        kind: batch.kind,
        createdAt: batch.createdAt,
        entries: part,
      });
    }
    tick("Adding message history");
  });

  const rowsRestored = Object.values(inserted).reduce((sum, n) => sum + (n ?? 0), 0);
  if (rowsRestored > 0) {
    logActivity({
      action: "imported",
      entity: "backup",
      entityId: header.createdAt.toString(),
      label: `${rowsRestored} record${rowsRestored === 1 ? "" : "s"} added from a backup file`,
      branchId: null,
    });
  }

  onProgress?.({ phase: "done", fraction: 1, detail: "Import complete" });

  return {
    counts: header.counts,
    inserted,
    skipped,
    rowsRestored,
    photosRestored,
    photosSkipped: alreadyStored.size,
    safetySnapshotUri,
  };
}

// --- merge planning -------------------------------------------------------------

type CollectionWrite = {
  collection: "branches" | "rooms" | "inmates" | "templates" | "notices" | "complaints";
  id: string;
  data: Record<string, unknown>;
};

interface MergePlan {
  simple: CollectionWrite[];
  feeDocs: Map<
    string,
    { studentId: string; year: string; bills: Record<string, BillDoc>; extraPayments: Map<string, PaymentDoc[]> }
  >;
  messageBatches: Map<string, { kind: MessageKind; createdAt: number; entries: Omit<MessageLogEntry, "batchId">[] }>;
  inserted: Partial<Record<BackupTable, number>>;
  skipped: Partial<Record<BackupTable, number>>;
}

const num = (value: unknown, fallback = 0): number => {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined || value === "" ? null : num(value);
const str = (value: unknown, fallback = ""): string =>
  value === null || value === undefined ? fallback : String(value);
const strOrNull = (value: unknown): string | null =>
  value === null || value === undefined || value === "" ? null : String(value);

/** Records written before branches existed belong to the first hostel. */
const FIRST_BRANCH = "branch-thammanam";

function branchDoc(row: Row): Branch {
  return {
    id: str(row.id),
    name: str(row.name),
    shortName: str(row.shortName),
    code: str(row.code),
    sortOrder: num(row.sortOrder),
    createdAt: num(row.createdAt, Date.now()),
    updatedAt: num(row.updatedAt, Date.now()),
  };
}

function roomDoc(row: Row): Room {
  return {
    id: str(row.id),
    branchId: str(row.branchId) || FIRST_BRANCH,
    block: str(row.block),
    roomNumber: str(row.roomNumber),
    floor: str(row.floor),
    capacity: num(row.capacity, 1),
    rent: num(row.rent),
    deposit: num(row.deposit),
    amenities: str(row.amenities),
    notes: str(row.notes),
    createdAt: num(row.createdAt, Date.now()),
    updatedAt: num(row.updatedAt, Date.now()),
  };
}

function inmateDoc(row: Row): Inmate {
  const admissionType = row.admissionType === "stay" ? "stay" : "monthly";
  return {
    id: str(row.id),
    admissionNo: str(row.admissionNo),
    fullName: str(row.fullName),
    phone: str(row.phone),
    guardianName: str(row.guardianName),
    guardianPhone: str(row.guardianPhone),
    email: str(row.email),
    course: str(row.course),
    year: str(row.year),
    address: str(row.address),
    idProof: str(row.idProof),
    photoFile: strOrNull(row.photoFile),
    idProofFile: strOrNull(row.idProofFile),
    idProofBackFile: strOrNull(row.idProofBackFile),
    roomId: strOrNull(row.roomId),
    branchId: str(row.branchId) || FIRST_BRANCH,
    status: row.status === "left" ? "left" : "active",
    admissionType,
    stayDays: admissionType === "stay" ? numOrNull(row.stayDays) : null,
    monthlyRent: num(row.monthlyRent),
    deposit: num(row.deposit),
    billingCycleDays: num(row.billingCycleDays, 30),
    joinedOn: str(row.joinedOn),
    leftOn: strOrNull(row.leftOn),
    notes: str(row.notes),
    createdAt: num(row.createdAt, Date.now()),
    updatedAt: num(row.updatedAt, Date.now()),
  };
}

function noticeDoc(row: Row): Notice {
  return {
    id: str(row.id),
    branchId: strOrNull(row.branchId),
    title: str(row.title),
    body: str(row.body),
    category: (str(row.category) || "general") as Notice["category"],
    pinned: Boolean(num(row.pinned)) || row.pinned === true,
    postedOn: str(row.postedOn),
    lastSentAt: numOrNull(row.lastSentAt),
    createdAt: num(row.createdAt, Date.now()),
    updatedAt: num(row.updatedAt, Date.now()),
  };
}

function complaintDoc(row: Row): Complaint {
  return {
    id: str(row.id),
    branchId: str(row.branchId) || FIRST_BRANCH,
    roomId: strOrNull(row.roomId),
    studentId: strOrNull(row.studentId),
    title: str(row.title),
    description: str(row.description),
    category: (str(row.category) || "other") as Complaint["category"],
    status: (str(row.status) || "open") as Complaint["status"],
    photoFile: strOrNull(row.photoFile),
    raisedOn: str(row.raisedOn),
    resolvedAt: numOrNull(row.resolvedAt),
    resolution: str(row.resolution),
    createdAt: num(row.createdAt, Date.now()),
    updatedAt: num(row.updatedAt, Date.now()),
  };
}

function templateDoc(row: Row): MessageTemplate {
  return {
    id: str(row.id),
    name: str(row.name),
    kind: (str(row.kind) || "custom") as MessageKind,
    body: str(row.body),
    isBuiltIn: Boolean(num(row.isBuiltIn)) || row.isBuiltIn === true,
    createdAt: num(row.createdAt, Date.now()),
    updatedAt: num(row.updatedAt, Date.now()),
  };
}

function billDoc(row: Row): BillDoc {
  return {
    id: str(row.id),
    period: str(row.period),
    rent: num(row.rent),
    electricity: num(row.electricity),
    water: num(row.water),
    other: num(row.other),
    discount: num(row.discount),
    total: num(row.total),
    dueDate: str(row.dueDate),
    note: str(row.note),
    createdAt: num(row.createdAt, Date.now()),
    updatedAt: num(row.updatedAt, Date.now()),
    payments: {},
  };
}

function paymentDoc(row: Row): PaymentDoc {
  return {
    id: str(row.id),
    amount: num(row.amount),
    method: (str(row.method) || "cash") as PaymentMethod,
    paidOn: str(row.paidOn),
    reference: str(row.reference),
    note: str(row.note),
    createdAt: num(row.createdAt, Date.now()),
  };
}

/** Decides, row by row, what the backup adds to the live records. */
function planMerge(rows: { table: string; row: Row }[]): MergePlan {
  const plan: MergePlan = { simple: [], feeDocs: new Map(), messageBatches: new Map(), inserted: {}, skipped: {} };
  const add = (table: BackupTable) => (plan.inserted[table] = (plan.inserted[table] ?? 0) + 1);
  const skip = (table: BackupTable) => (plan.skipped[table] = (plan.skipped[table] ?? 0) + 1);

  const COLLECTION: Partial<Record<BackupTable, CollectionWrite["collection"]>> = {
    branches: "branches",
    rooms: "rooms",
    students: "inmates",
    message_templates: "templates",
    notices: "notices",
    complaints: "complaints",
  };
  const BUILD: Partial<Record<BackupTable, (row: Row) => object>> = {
    branches: branchDoc,
    rooms: roomDoc,
    students: inmateDoc,
    message_templates: templateDoc,
    notices: noticeDoc,
    complaints: complaintDoc,
  };

  const seen = new Set<string>();
  const builtInNames = new Set(
    list<MessageTemplate>("templates")
      .filter((template) => template.isBuiltIn)
      .map((template) => template.name)
  );

  // Bills already in online storage, by id and by inmate + month.
  const liveBills = allBills();
  const billIds = new Set(liveBills.map((bill) => bill.id));
  const billSlots = new Set(liveBills.map((bill) => `${bill.studentId}|${bill.period}`));
  const paymentIds = new Set(liveBills.flatMap((bill) => bill.payments.map((payment) => payment.id)));
  /** Where each bill lives -- in storage already, or added by this backup. */
  const billHome = new Map<string, { docId: string; studentId: string; year: string; period: string; isNew: boolean }>();
  for (const bill of liveBills) {
    billHome.set(bill.id, { docId: bill.docId, studentId: bill.studentId, year: bill.period.slice(0, 4), period: bill.period, isNew: false });
  }
  const messageIds = new Set(
    list<ChunkDoc>("messages").flatMap((doc) => Object.keys(doc.entries ?? {}))
  );

  const feeDocFor = (studentId: string, period: string) => {
    const docId = feeDocId(studentId, period);
    let doc = plan.feeDocs.get(docId);
    if (!doc) {
      doc = { studentId, year: period.slice(0, 4), bills: {}, extraPayments: new Map() };
      plan.feeDocs.set(docId, doc);
    }
    return { docId, doc };
  };

  for (const { table: rawTable, row } of rows) {
    const table = rawTable as BackupTable;
    const id = str(row.id);
    const collection = COLLECTION[table];
    const build = BUILD[table];

    if (collection && build) {
      const key = `${collection}/${id}`;
      const duplicateBuiltIn =
        table === "message_templates" && Boolean(num(row.isBuiltIn)) && builtInNames.has(str(row.name));
      if (!id || seen.has(key) || find(collection, id) || duplicateBuiltIn) {
        skip(table);
        continue;
      }
      seen.add(key);
      plan.simple.push({ collection, id, data: build(row) as Record<string, unknown> });
      add(table);
      continue;
    }

    if (table === "fee_records") {
      const studentId = str(row.studentId);
      const period = str(row.period);
      const slot = `${studentId}|${period}`;
      if (!id || !studentId || !period || billIds.has(id) || billSlots.has(slot)) {
        skip(table);
        continue;
      }
      billIds.add(id);
      billSlots.add(slot);
      const { docId, doc } = feeDocFor(studentId, period);
      doc.bills[period] = billDoc(row);
      billHome.set(id, { docId, studentId, year: doc.year, period, isNew: true });
      add(table);
      continue;
    }

    if (table === "payments") {
      const home = billHome.get(str(row.feeRecordId));
      if (!id || !home || paymentIds.has(id)) {
        skip(table);
        continue;
      }
      paymentIds.add(id);
      const payment = paymentDoc(row);
      const { doc } = feeDocFor(home.studentId, home.period);
      if (home.isNew) {
        const bill = doc.bills[home.period];
        bill.payments = { ...(bill.payments ?? {}), [payment.id]: payment };
      } else {
        const list = doc.extraPayments.get(str(row.feeRecordId)) ?? [];
        list.push(payment);
        doc.extraPayments.set(str(row.feeRecordId), list);
      }
      add(table);
      continue;
    }

    if (table === "message_log") {
      const batchId = str(row.batchId);
      if (!id || !batchId || messageIds.has(id)) {
        skip(table);
        continue;
      }
      messageIds.add(id);
      const kind = (str(row.kind) || "custom") as MessageKind;
      const createdAt = num(row.createdAt, Date.now());
      const batch = plan.messageBatches.get(batchId) ?? { kind, createdAt, entries: [] };
      batch.entries.push({
        id,
        studentId: strOrNull(row.studentId),
        recipientName: str(row.recipientName),
        phone: str(row.phone),
        kind,
        body: str(row.body),
        status: (str(row.status) || "queued") as MessageLogEntry["status"],
        createdAt,
        sentAt: numOrNull(row.sentAt),
      });
      plan.messageBatches.set(batchId, batch);
      add(table);
    }
    // Settings are per-installation configuration, not hostel records, and
    // are deliberately never imported.
  }

  return plan;
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
