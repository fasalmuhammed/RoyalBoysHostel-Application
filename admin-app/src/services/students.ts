import { getDb } from "@/db";
import { Student, StudentStatus } from "@/types";
import { newId } from "@/utils/id";
import { toIsoDate } from "@/utils/format";
import { deletePhoto } from "./photos";

export type StudentInput = Omit<Student, "id" | "createdAt" | "updatedAt">;

export interface StudentWithRoom extends Student {
  roomLabel: string | null;
  /** Rent of the assigned room, used to pre-fill new invoices. */
  roomRent: number | null;
}

export type StudentFilter = "all" | "active" | "left" | "unassigned";

const SELECT_WITH_ROOM = `
  SELECT s.*,
         CASE WHEN r.id IS NULL THEN NULL
              WHEN r.block = '' THEN r.roomNumber
              ELSE r.block || '-' || r.roomNumber END AS roomLabel,
         r.rent AS roomRent
  FROM students s
  LEFT JOIN rooms r ON r.id = s.roomId
`;

export async function listStudents(
  search = "",
  filter: StudentFilter = "active"
): Promise<StudentWithRoom[]> {
  const db = await getDb();

  const clauses: string[] = [];
  const params: (string | number)[] = [];

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
  return db.getAllAsync<StudentWithRoom>(
    `${SELECT_WITH_ROOM} ${where} ORDER BY s.fullName COLLATE NOCASE;`,
    params
  );
}

export async function getStudent(id: string): Promise<StudentWithRoom | null> {
  const db = await getDb();
  return db.getFirstAsync<StudentWithRoom>(`${SELECT_WITH_ROOM} WHERE s.id = ?;`, id);
}

export async function listStudentsInRoom(roomId: string): Promise<StudentWithRoom[]> {
  const db = await getDb();
  return db.getAllAsync<StudentWithRoom>(
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
  excludeStudentId: string | null
): Promise<void> {
  const room = await txn.getFirstAsync<{ capacity: number; block: string; roomNumber: string }>(
    "SELECT capacity, block, roomNumber FROM rooms WHERE id = ?;",
    roomId
  );
  if (!room) throw new RoomFullError("That room no longer exists.");

  const occupied = excludeStudentId
    ? await txn.getFirstAsync<{ n: number }>(
        "SELECT COUNT(*) AS n FROM students WHERE roomId = ? AND status = 'active' AND id <> ?;",
        roomId,
        excludeStudentId
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

export async function createStudent(input: StudentInput): Promise<string> {
  const db = await getDb();
  const id = newId();
  const now = Date.now();

  await db.withExclusiveTransactionAsync(async (txn) => {
    if (input.roomId && input.status === "active") {
      await assertRoomHasSpace(txn, input.roomId, null);
    }
    await txn.runAsync(
      `INSERT INTO students (id, admissionNo, fullName, phone, guardianName, guardianPhone,
         email, course, year, address, idProof, photoFile, roomId, status, monthlyRent,
         billingCycleDays, joinedOn, leftOn, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      id, input.admissionNo, input.fullName, input.phone, input.guardianName, input.guardianPhone,
      input.email, input.course, input.year, input.address, input.idProof, input.photoFile,
      input.roomId, input.status, input.monthlyRent, input.billingCycleDays,
      input.joinedOn, input.leftOn, input.notes, now, now
    );
  });

  return id;
}

export async function updateStudent(id: string, input: StudentInput): Promise<void> {
  const db = await getDb();
  const existing = await getStudent(id);

  await db.withExclusiveTransactionAsync(async (txn) => {
    const movingIn = input.roomId && input.status === "active" && input.roomId !== existing?.roomId;
    if (movingIn && input.roomId) {
      await assertRoomHasSpace(txn, input.roomId, id);
    }
    await txn.runAsync(
      `UPDATE students SET admissionNo = ?, fullName = ?, phone = ?, guardianName = ?,
         guardianPhone = ?, email = ?, course = ?, year = ?, address = ?, idProof = ?,
         photoFile = ?, roomId = ?, status = ?, monthlyRent = ?, billingCycleDays = ?,
         joinedOn = ?, leftOn = ?, notes = ?, updatedAt = ?
       WHERE id = ?;`,
      input.admissionNo, input.fullName, input.phone, input.guardianName, input.guardianPhone,
      input.email, input.course, input.year, input.address, input.idProof, input.photoFile,
      input.roomId, input.status, input.monthlyRent, input.billingCycleDays,
      input.joinedOn, input.leftOn, input.notes, Date.now(), id
    );
  });

  // Drop the old image only once the row that referenced it is committed.
  if (existing?.photoFile && existing.photoFile !== input.photoFile) {
    deletePhoto(existing.photoFile);
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

/** Permanently removes a student, their photo, and their fee history. */
export async function deleteStudent(studentId: string): Promise<void> {
  const db = await getDb();
  const existing = await getStudent(studentId);
  await db.runAsync("DELETE FROM students WHERE id = ?;", studentId);
  deletePhoto(existing?.photoFile ?? null);
}

export interface StudentCounts {
  total: number;
  active: number;
  left: number;
  unassigned: number;
}

export async function studentCounts(): Promise<StudentCounts> {
  const db = await getDb();
  const row = await db.getFirstAsync<StudentCounts>(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(status = 'active'), 0) AS active,
            COALESCE(SUM(status = 'left'), 0) AS "left",
            COALESCE(SUM(status = 'active' AND roomId IS NULL), 0) AS unassigned
     FROM students;`
  );
  return row ?? { total: 0, active: 0, left: 0, unassigned: 0 };
}

export function statusOf(student: Pick<Student, "status">): StudentStatus {
  return student.status;
}
