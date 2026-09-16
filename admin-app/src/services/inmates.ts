import { getDb } from "@/db";
import { Inmate, InmateStatus } from "@/types";
import { newId } from "@/utils/id";
import { toIsoDate } from "@/utils/format";
import { deletePhoto } from "./photos";
import { branchClause, getActiveBranchId, requireActiveBranchId } from "./branches";

export type InmateInput = Omit<Inmate, "id" | "createdAt" | "updatedAt">;

export interface InmateWithRoom extends Inmate {
  roomLabel: string | null;
  /** Rent of the assigned room, used to pre-fill new invoices. */
  roomRent: number | null;
  /** Branch letter, for rendering the id as `T-14`. */
  branchCode: string | null;
  branchName: string | null;
  /** Unpaid balance across every bill raised for them. 0 when settled. */
  outstanding: number;
}

export type InmateFilter = "all" | "active" | "left" | "unassigned";

/**
 * `outstanding` is summed in the same read rather than fetched per row: "who
 * owes money" is the first thing an admin scans this list for, and a
 * follow-up query per inmate would turn one read into hundreds.
 */
const SELECT_WITH_ROOM = `
  SELECT s.*,
         CASE WHEN r.id IS NULL THEN NULL
              WHEN r.block = '' THEN r.roomNumber
              ELSE r.block || '-' || r.roomNumber END AS roomLabel,
         r.rent AS roomRent,
         b.code AS branchCode,
         b.shortName AS branchName,
         COALESCE((SELECT SUM(f.total - f.amountPaid) FROM fee_records f
                   WHERE f.studentId = s.id AND f.amountPaid < f.total - 0.01), 0) AS outstanding
  FROM students s
  LEFT JOIN rooms r ON r.id = s.roomId
  LEFT JOIN branches b ON b.id = s.branchId
`;

export async function listInmates(
  search = "",
  filter: InmateFilter = "active"
): Promise<InmateWithRoom[]> {
  const db = await getDb();

  const clauses: string[] = [];
  const params: (string | number)[] = [];

  const branch = branchClause("s.branchId");
  if (branch.sql) {
    clauses.push(branch.sql);
    params.push(...branch.params);
  }

  if (filter === "active" || filter === "left") {
    clauses.push("s.status = ?");
    params.push(filter);
  } else if (filter === "unassigned") {
    clauses.push("s.status = 'active' AND s.roomId IS NULL");
  }

  const term = search.trim().toLowerCase();
  if (term) {
    clauses.push("(LOWER(s.fullName) LIKE ? OR LOWER(s.admissionNo) LIKE ? OR s.phone LIKE ?)");
    params.push(`%${term}%`, `%${term}%`, `%${term}%`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db.getAllAsync<InmateWithRoom>(
    `${SELECT_WITH_ROOM} ${where} ORDER BY s.fullName COLLATE NOCASE;`,
    params
  );
}

export async function getInmate(id: string): Promise<InmateWithRoom | null> {
  const db = await getDb();
  return db.getFirstAsync<InmateWithRoom>(`${SELECT_WITH_ROOM} WHERE s.id = ?;`, id);
}

/** Occupants are already implicitly scoped: a room belongs to one branch. */
export async function listInmatesInRoom(roomId: string): Promise<InmateWithRoom[]> {
  const db = await getDb();
  return db.getAllAsync<InmateWithRoom>(
    `${SELECT_WITH_ROOM} WHERE s.roomId = ? AND s.status = 'active' ORDER BY s.fullName COLLATE NOCASE;`,
    roomId
  );
}

/**
 * Thrown when an assignment would exceed a room's capacity. The caller shows
 * the message directly, so it is written for the admin, not for a log.
 */
export class RoomFullError extends Error {}

interface Queryable {
  getFirstAsync<T>(sql: string, ...params: (string | number)[]): Promise<T | null>;
}

/**
 * Guards room capacity at the point of write.
 *
 * The check and the insert/update run inside one exclusive transaction --
 * checking first and writing later would let two quick taps both pass the
 * check and overfill the room.
 */
async function assertRoomHasSpace(
  txn: Queryable,
  roomId: string,
  excludeInmateId: string | null
): Promise<void> {
  const room = await txn.getFirstAsync<{ capacity: number; block: string; roomNumber: string }>(
    "SELECT capacity, block, roomNumber FROM rooms WHERE id = ?;",
    roomId
  );
  if (!room) throw new RoomFullError("That room no longer exists.");

  const occupied = excludeInmateId
    ? await txn.getFirstAsync<{ n: number }>(
        "SELECT COUNT(*) AS n FROM students WHERE roomId = ? AND status = 'active' AND id <> ?;",
        roomId,
        excludeInmateId
      )
    : await txn.getFirstAsync<{ n: number }>(
        "SELECT COUNT(*) AS n FROM students WHERE roomId = ? AND status = 'active';",
        roomId
      );

  if ((occupied?.n ?? 0) >= room.capacity) {
    const label = room.block ? `${room.block}-${room.roomNumber}` : room.roomNumber;
    throw new RoomFullError(
      `Room ${label} is full (${room.capacity} of ${room.capacity} beds taken). ` +
        "Free a bed or pick another room."
    );
  }
}

/** Where the admission sequence is persisted. Rides along in backups. */
const ADMISSION_COUNTER_KEY = "admissionCounter";

/**
 * Next admission number in the sequence: 1 for the first student, then 2, 3...
 *
 * Takes the greater of a stored counter and the highest number in use.
 *
 * The counter alone would be wrong after restoring a backup written by an
 * older build; the maximum alone would reissue a departed student's number the
 * moment the highest-numbered student is deleted, leaving two people sharing
 * an id across old receipts and exports. Together they never go backwards.
 *
 * It lives as a raw row in `settings` rather than in `AppSettings`: it is
 * bookkeeping, not a preference, and `loadSettings` ignores keys it does not
 * know about.
 */
async function highestIssued(txn: Queryable, branchId: string): Promise<number> {
  const row = await txn.getFirstAsync<{ highest: number | null }>(
    `SELECT MAX(
       COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key = ?), 0),
       COALESCE((SELECT MAX(CAST(admissionNo AS INTEGER)) FROM students WHERE branchId = ?), 0)
     ) AS highest;`,
    `${ADMISSION_COUNTER_KEY}:${branchId}`,
    branchId
  );
  return row?.highest ?? 0;
}

interface Writable extends Queryable {
  runAsync(sql: string, ...params: (string | number | null)[]): Promise<unknown>;
}

/** Claims the next number and advances the counter, inside the caller's transaction. */
async function claimAdmissionNo(txn: Writable, branchId: string): Promise<string> {
  const next = (await highestIssued(txn, branchId)) + 1;
  await txn.runAsync(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;",
    `${ADMISSION_COUNTER_KEY}:${branchId}`,
    String(next)
  );
  return String(next);
}

export async function createInmate(input: InmateInput): Promise<string> {
  const db = await getDb();
  const id = newId();
  const now = Date.now();

  const branchId = input.branchId || requireActiveBranchId();
  // Bound as NULL rather than falling back to the column's own DEFAULT when a
  // caller leaves this unset (SQLite only applies a column DEFAULT when the
  // column is omitted from the statement entirely, not when it's explicitly
  // bound to NULL) -- so every caller gets today's "monthly" behaviour even
  // if it predates this field.
  const admissionType = input.admissionType ?? "monthly";
  const stayDays = admissionType === "stay" ? (input.stayDays ?? null) : null;

  await db.withExclusiveTransactionAsync(async (txn) => {
    if (input.roomId && input.status === "active") {
      await assertRoomHasSpace(txn, input.roomId, null);
    }
    // Allocated inside the transaction so two quick saves cannot claim the
    // same number. Numbering restarts per branch.
    const admissionNo = input.admissionNo.trim() || (await claimAdmissionNo(txn, branchId));
    await txn.runAsync(
      `INSERT INTO students (id, branchId, admissionNo, fullName, phone, guardianName, guardianPhone,
         email, course, year, address, idProof, photoFile, idProofFile, idProofBackFile, roomId, status, monthlyRent,
         billingCycleDays, admissionType, stayDays, joinedOn, leftOn, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      id, branchId, admissionNo, input.fullName, input.phone, input.guardianName, input.guardianPhone,
      input.email, input.course, input.year, input.address, input.idProof, input.photoFile,
      input.idProofFile, input.idProofBackFile, input.roomId, input.status, input.monthlyRent, input.billingCycleDays,
      admissionType, stayDays, input.joinedOn, input.leftOn, input.notes, now, now
    );
  });

  return id;
}

export async function updateInmate(id: string, input: InmateInput): Promise<void> {
  const db = await getDb();
  const existing = await getInmate(id);

  const admissionType = input.admissionType ?? "monthly";
  const stayDays = admissionType === "stay" ? (input.stayDays ?? null) : null;

  await db.withExclusiveTransactionAsync(async (txn) => {
    const movingIn = input.roomId && input.status === "active" && input.roomId !== existing?.roomId;
    if (movingIn && input.roomId) {
      await assertRoomHasSpace(txn, input.roomId, id);
    }
    await txn.runAsync(
      `UPDATE students SET fullName = ?, phone = ?, guardianName = ?,
         guardianPhone = ?, email = ?, course = ?, year = ?, address = ?, idProof = ?,
         photoFile = ?, idProofFile = ?, idProofBackFile = ?, roomId = ?, status = ?, monthlyRent = ?, billingCycleDays = ?,
         admissionType = ?, stayDays = ?, joinedOn = ?, leftOn = ?, notes = ?, updatedAt = ?
       WHERE id = ?;`,
      input.fullName, input.phone, input.guardianName, input.guardianPhone,
      input.email, input.course, input.year, input.address, input.idProof, input.photoFile,
      input.idProofFile, input.idProofBackFile, input.roomId, input.status, input.monthlyRent, input.billingCycleDays,
      admissionType, stayDays, input.joinedOn, input.leftOn, input.notes, Date.now(), id
    );
  });

  // Drop the old images only once the row that referenced them is committed.
  if (existing?.photoFile && existing.photoFile !== input.photoFile) {
    deletePhoto(existing.photoFile);
  }
  if (existing?.idProofFile && existing.idProofFile !== input.idProofFile) {
    deletePhoto(existing.idProofFile);
  }
  if (existing?.idProofBackFile && existing.idProofBackFile !== input.idProofBackFile) {
    deletePhoto(existing.idProofBackFile);
  }
}

/** Assigns or clears a student's bed. Passing null vacates them. */
export async function assignRoom(studentId: string, roomId: string | null): Promise<void> {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    if (roomId) await assertRoomHasSpace(txn, roomId, studentId);
    await txn.runAsync(
      "UPDATE students SET roomId = ?, updatedAt = ? WHERE id = ?;",
      roomId,
      Date.now(),
      studentId
    );
  });
}

/**
 * Updates only the agreed rent.
 *
 * Moving a student between rooms deliberately does not change their rent, so
 * this exists for the caller to apply the new room's rate when the admin
 * explicitly asks for it.
 */
export async function setInmateRent(studentId: string, monthlyRent: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE students SET monthlyRent = ?, updatedAt = ? WHERE id = ?;",
    monthlyRent,
    Date.now(),
    studentId
  );
}

/**
 * Marks a student as having vacated. Their bed is freed but the record -- and
 * every fee row attached to it -- is kept, because past dues stay collectable.
 */
export async function markLeft(studentId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE students SET status = 'left', roomId = NULL, leftOn = ?, updatedAt = ? WHERE id = ?;",
    toIsoDate(),
    Date.now(),
    studentId
  );
}

export async function reinstate(studentId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE students SET status = 'active', leftOn = NULL, updatedAt = ? WHERE id = ?;",
    Date.now(),
    studentId
  );
}

/**
 * Moves an inmate to another branch.
 *
 * Their existing id is kept rather than reissued: the number already appears on
 * past receipts and exports, and renumbering would break that trail. The id is
 * displayed with the new branch's letter from then on.
 */
export async function moveToBranch(studentId: string, branchId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE students SET branchId = ?, roomId = NULL, updatedAt = ? WHERE id = ?;",
    branchId,
    Date.now(),
    studentId
  );
}

/** Permanently removes a student, their photo, and their fee history. */
export async function deleteInmate(studentId: string): Promise<void> {
  const db = await getDb();
  const existing = await getInmate(studentId);
  await db.runAsync("DELETE FROM students WHERE id = ?;", studentId);
  deletePhoto(existing?.photoFile ?? null);
  deletePhoto(existing?.idProofFile ?? null);
  deletePhoto(existing?.idProofBackFile ?? null);
}

/**
 * The number the next new inmate will be given, for display on the form.
 * Read-only -- it does not advance the counter.
 */
export async function peekNextAdmissionNo(branchId?: string): Promise<string> {
  const db = await getDb();
  const target = branchId ?? getActiveBranchId();
  if (!target) return "1";
  return String((await highestIssued(db, target)) + 1);
}

export interface InmateCounts {
  total: number;
  active: number;
  left: number;
  unassigned: number;
}

export async function inmateCounts(): Promise<InmateCounts> {
  const db = await getDb();
  const branch = branchClause("branchId");
  const where = branch.sql ? `WHERE ${branch.sql}` : "";
  const row = await db.getFirstAsync<InmateCounts>(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(status = 'active'), 0) AS active,
            COALESCE(SUM(status = 'left'), 0) AS "left",
            COALESCE(SUM(status = 'active' AND roomId IS NULL), 0) AS unassigned
     FROM students ${where};`,
    branch.params
  );
  return row ?? { total: 0, active: 0, left: 0, unassigned: 0 };
}

export function statusOf(student: Pick<Inmate, "status">): InmateStatus {
  return student.status;
}
