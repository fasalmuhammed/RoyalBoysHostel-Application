import { getDb } from "@/db";
import { Room, RoomWithOccupancy } from "@/types";
import { newId } from "@/utils/id";
import { branchClause, requireActiveBranchId } from "./branches";

type RoomInput = Omit<Room, "id" | "createdAt" | "updatedAt">;

const SELECT_WITH_OCCUPANCY = `
  SELECT r.*,
         COALESCE(o.occupied, 0) AS occupied,
         MAX(r.capacity - COALESCE(o.occupied, 0), 0) AS vacant
  FROM rooms r
  LEFT JOIN (
    SELECT roomId, COUNT(*) AS occupied
    FROM students
    WHERE status = 'active' AND roomId IS NOT NULL
    GROUP BY roomId
  ) o ON o.roomId = r.id
`;

/**
 * Occupancy is always derived from `students.roomId` rather than stored on the
 * room. A denormalised counter would drift the moment a student is deleted or
 * a backup is restored mid-edit.
 */
export async function listRooms(search = ""): Promise<RoomWithOccupancy[]> {
  const db = await getDb();

  const clauses: string[] = [];
  const params: string[] = [];

  const branch = branchClause("r.branchId");
  if (branch.sql) {
    clauses.push(branch.sql);
    params.push(...branch.params);
  }

  const term = search.trim().toLowerCase();
  if (term) {
    clauses.push("(LOWER(r.block || ' ' || r.roomNumber) LIKE ? OR LOWER(r.roomNumber) LIKE ?)");
    params.push(`%${term}%`, `%${term}%`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db.getAllAsync<RoomWithOccupancy>(
    `${SELECT_WITH_OCCUPANCY} ${where} ORDER BY r.block, CAST(r.roomNumber AS INTEGER), r.roomNumber;`,
    params
  );
}

export async function getRoom(id: string): Promise<RoomWithOccupancy | null> {
  const db = await getDb();
  return db.getFirstAsync<RoomWithOccupancy>(`${SELECT_WITH_OCCUPANCY} WHERE r.id = ?;`, id);
}

export async function createRoom(input: RoomInput): Promise<string> {
  const db = await getDb();
  const id = newId();
  const now = Date.now();
  const branchId = input.branchId || requireActiveBranchId();
  await db.runAsync(
    `INSERT INTO rooms (id, branchId, block, roomNumber, floor, capacity, rent, deposit, amenities, notes, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    id, branchId, input.block, input.roomNumber, input.floor, input.capacity,
    input.rent, input.deposit, input.amenities, input.notes, now, now
  );
  return id;
}

export async function updateRoom(id: string, input: RoomInput): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE rooms SET block = ?, roomNumber = ?, floor = ?, capacity = ?, rent = ?,
       deposit = ?, amenities = ?, notes = ?, updatedAt = ?
     WHERE id = ?;`,
    input.block, input.roomNumber, input.floor, input.capacity, input.rent,
    input.deposit, input.amenities, input.notes, Date.now(), id
  );
}

/**
 * Deleting a room detaches its occupants (ON DELETE SET NULL) rather than
 * removing them, so a mis-tap can never destroy student records.
 */
export async function deleteRoom(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM rooms WHERE id = ?;", id);
}

export async function roomLabel(id: string | null): Promise<string | null> {
  if (!id) return null;
  const room = await getRoom(id);
  return room ? formatRoomLabel(room) : null;
}

export function formatRoomLabel(room: Pick<Room, "block" | "roomNumber">): string {
  return room.block ? `${room.block}-${room.roomNumber}` : room.roomNumber;
}

export interface OccupancyTotals {
  rooms: number;
  beds: number;
  occupied: number;
  vacant: number;
}

export async function occupancyTotals(): Promise<OccupancyTotals> {
  const db = await getDb();
  const roomBranch = branchClause("branchId");
  const roomWhere = roomBranch.sql ? `WHERE ${roomBranch.sql}` : "";
  const studentBranch = branchClause("branchId");

  const row = await db.getFirstAsync<{ rooms: number; beds: number }>(
    `SELECT COUNT(*) AS rooms, COALESCE(SUM(capacity), 0) AS beds FROM rooms ${roomWhere};`,
    roomBranch.params
  );
  const occ = await db.getFirstAsync<{ occupied: number }>(
    `SELECT COUNT(*) AS occupied FROM students
     WHERE status = 'active' AND roomId IS NOT NULL
     ${studentBranch.sql ? `AND ${studentBranch.sql}` : ""};`,
    studentBranch.params
  );
  const beds = row?.beds ?? 0;
  const occupied = occ?.occupied ?? 0;
  return {
    rooms: row?.rooms ?? 0,
    beds,
    occupied,
    vacant: Math.max(beds - occupied, 0),
  };
}
