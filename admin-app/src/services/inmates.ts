import { Complaint, Inmate, InmateStatus, Room } from "@/types";
import { newId } from "@/utils/id";
import { toIsoDate } from "@/utils/format";
import { entries, find, fresh, freshWhere, list, logActivity, patch, put, remove, withLock } from "@/store/cloud";
import {
  FeeYearDoc,
  allInmates,
  branchById,
  castInt,
  compareText,
  contains,
  inmateById,
  outstandingByStudent,
  roomById,
  roomLabelOf,
} from "@/store/views";
import { deletePhoto } from "./photos";
import { getActiveBranchId, inActiveBranch, requireActiveBranchId } from "./branches";

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
 * `outstanding` comes with every row: "who owes money" is the first thing an
 * admin scans this list for.
 */
function withRoom(inmate: Inmate): InmateWithRoom {
  const room = roomById(inmate.roomId);
  const branch = branchById(inmate.branchId);
  return {
    ...inmate,
    roomLabel: roomLabelOf(room),
    roomRent: room ? room.rent : null,
    branchCode: branch ? branch.code : null,
    branchName: branch ? branch.shortName : null,
    outstanding: outstandingByStudent().get(inmate.id) ?? 0,
  };
}

const byName = (a: Inmate, b: Inmate) => compareText(a.fullName, b.fullName);

export async function listInmates(search = "", filter: InmateFilter = "active"): Promise<InmateWithRoom[]> {
  const term = search.trim().toLowerCase();
  return allInmates()
    .filter((inmate) => {
      if (!inActiveBranch(inmate.branchId)) return false;
      if ((filter === "active" || filter === "left") && inmate.status !== filter) return false;
      if (filter === "unassigned" && !(inmate.status === "active" && !inmate.roomId)) return false;
      return (
        !term ||
        contains(inmate.fullName, term) ||
        contains(inmate.admissionNo, term) ||
        contains(inmate.phone, term)
      );
    })
    .sort(byName)
    .map(withRoom);
}

export async function getInmate(id: string): Promise<InmateWithRoom | null> {
  const inmate = inmateById(id);
  return inmate ? withRoom(inmate) : null;
}

/** Occupants are already implicitly scoped: a room belongs to one branch. */
export async function listInmatesInRoom(roomId: string): Promise<InmateWithRoom[]> {
  return allInmates()
    .filter((inmate) => inmate.roomId === roomId && inmate.status === "active")
    .sort(byName)
    .map(withRoom);
}

/**
 * Thrown when an assignment would exceed a room's capacity. The caller shows
 * the message directly, so it is written for the admin, not for a log.
 */
export class RoomFullError extends Error {}

/**
 * Guards room capacity at the point of write.
 *
 * Runs inside the room's lock and counts from the server's current copy, so
 * two people filling the last bed from two phones cannot both succeed.
 */
async function assertRoomHasSpace(roomId: string, excludeInmateId: string | null): Promise<void> {
  const room = await fresh<Room>("rooms", roomId);
  if (!room) throw new RoomFullError("That room no longer exists.");

  const occupants = await freshWhere<Inmate>("inmates", "roomId", roomId);
  const occupied = occupants.filter(
    (inmate) => inmate.status === "active" && inmate.id !== excludeInmateId
  ).length;

  if (occupied >= room.capacity) {
    const label = room.block ? `${room.block}-${room.roomNumber}` : room.roomNumber;
    throw new RoomFullError(
      `Room ${label} is full (${room.capacity} of ${room.capacity} beds taken). ` +
        "Free a bed or pick another room."
    );
  }
}

/** Where each branch's admission sequence is kept. */
const counterId = (branchId: string) => `admission-${branchId}`;

/**
 * Next admission number in the sequence: 1 for the first inmate, then 2, 3...
 *
 * Takes the greater of a stored counter and the highest number in use.
 * The counter alone would be wrong after restoring an older backup; the
 * maximum alone would reissue a departed inmate's number the moment the
 * highest-numbered inmate is deleted. Together they never go backwards.
 */
function highestIssued(counterValue: number, inmates: Inmate[], branchId: string): number {
  const inUse = inmates
    .filter((inmate) => inmate.branchId === branchId)
    .reduce((max, inmate) => Math.max(max, castInt(inmate.admissionNo)), 0);
  return Math.max(counterValue || 0, inUse);
}

/** Claims the next number and advances the counter. Run inside the counter's lock. */
async function claimAdmissionNo(branchId: string): Promise<string> {
  const counter = await fresh<{ value?: number }>("counters", counterId(branchId));
  const inmates = await freshWhere<Inmate>("inmates", "branchId", branchId);
  const next = highestIssued(Number(counter?.value) || 0, inmates, branchId) + 1;
  await put("counters", counterId(branchId), { branchId, value: next });
  return String(next);
}

export async function createInmate(input: InmateInput): Promise<string> {
  const id = newId();
  const now = Date.now();
  const branchId = input.branchId || requireActiveBranchId();
  // Every caller gets today's "monthly" behaviour even if it predates the field.
  const admissionType = input.admissionType ?? "monthly";
  const stayDays = admissionType === "stay" ? (input.stayDays ?? null) : null;
  const typedNumber = input.admissionNo.trim();

  const write = async () => {
    if (input.roomId && input.status === "active") await assertRoomHasSpace(input.roomId, null);
    // Numbering restarts per branch; issued under the counter's lock so two
    // quick saves on two devices cannot claim the same number.
    const admissionNo = typedNumber || (await claimAdmissionNo(branchId));
    await put("inmates", id, {
      id,
      branchId,
      admissionNo,
      fullName: input.fullName,
      phone: input.phone,
      guardianName: input.guardianName,
      guardianPhone: input.guardianPhone,
      email: input.email,
      course: input.course,
      year: input.year,
      address: input.address,
      idProof: input.idProof,
      photoFile: input.photoFile,
      idProofFile: input.idProofFile,
      idProofBackFile: input.idProofBackFile,
      roomId: input.roomId,
      status: input.status,
      monthlyRent: input.monthlyRent,
      billingCycleDays: input.billingCycleDays,
      admissionType,
      stayDays,
      joinedOn: input.joinedOn,
      leftOn: input.leftOn,
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
    });
  };

  const numbered = typedNumber ? write : () => withLock("counters", counterId(branchId), write);
  if (input.roomId && input.status === "active") {
    await withLock("rooms", input.roomId, numbered);
  } else {
    await numbered();
  }

  logActivity({ action: "created", entity: "inmate", entityId: id, label: input.fullName, branchId });
  return id;
}

export async function updateInmate(id: string, input: InmateInput): Promise<void> {
  const existing = inmateById(id);
  if (!existing) return;

  const admissionType = input.admissionType ?? "monthly";
  const stayDays = admissionType === "stay" ? (input.stayDays ?? null) : null;

  // The admission number and branch are not edited here: the number is the
  // inmate's id on past receipts, and branch moves go through moveToBranch.
  const write = async () => {
    const movingIn = input.roomId && input.status === "active" && input.roomId !== existing.roomId;
    if (movingIn && input.roomId) await assertRoomHasSpace(input.roomId, id);
    await patch("inmates", id, {
      fullName: input.fullName,
      phone: input.phone,
      guardianName: input.guardianName,
      guardianPhone: input.guardianPhone,
      email: input.email,
      course: input.course,
      year: input.year,
      address: input.address,
      idProof: input.idProof,
      photoFile: input.photoFile,
      idProofFile: input.idProofFile,
      idProofBackFile: input.idProofBackFile,
      roomId: input.roomId,
      status: input.status,
      monthlyRent: input.monthlyRent,
      billingCycleDays: input.billingCycleDays,
      admissionType,
      stayDays,
      joinedOn: input.joinedOn,
      leftOn: input.leftOn,
      notes: input.notes,
      updatedAt: Date.now(),
    });
  };

  const movingIn = input.roomId && input.status === "active" && input.roomId !== existing.roomId;
  if (movingIn && input.roomId) await withLock("rooms", input.roomId, write);
  else await write();

  // Drop the old images only once the record that referenced them is saved.
  if (existing.photoFile && existing.photoFile !== input.photoFile) deletePhoto(existing.photoFile);
  if (existing.idProofFile && existing.idProofFile !== input.idProofFile) deletePhoto(existing.idProofFile);
  if (existing.idProofBackFile && existing.idProofBackFile !== input.idProofBackFile) {
    deletePhoto(existing.idProofBackFile);
  }

  logActivity({ action: "updated", entity: "inmate", entityId: id, label: input.fullName, branchId: existing.branchId });
}

/** Assigns or clears an inmate's bed. Passing null vacates them. */
export async function assignRoom(studentId: string, roomId: string | null): Promise<void> {
  const inmate = inmateById(studentId);
  if (roomId) {
    await withLock("rooms", roomId, async () => {
      await assertRoomHasSpace(roomId, studentId);
      await patch("inmates", studentId, { roomId, updatedAt: Date.now() });
    });
  } else {
    await patch("inmates", studentId, { roomId: null, updatedAt: Date.now() });
  }
  if (inmate) {
    logActivity({ action: "updated", entity: "inmate", entityId: studentId, label: inmate.fullName, branchId: inmate.branchId });
  }
}

/**
 * Updates only the agreed rent.
 *
 * Moving an inmate between rooms deliberately does not change their rent, so
 * this exists for the caller to apply the new room's rate when the admin
 * explicitly asks for it.
 */
export async function setInmateRent(studentId: string, monthlyRent: number): Promise<void> {
  await patch("inmates", studentId, { monthlyRent, updatedAt: Date.now() });
}

/**
 * Marks an inmate as having vacated. Their bed is freed but the record -- and
 * every bill attached to it -- is kept, because past dues stay collectable.
 */
export async function markLeft(studentId: string): Promise<void> {
  const inmate = inmateById(studentId);
  if (!inmate) return;
  await patch("inmates", studentId, { status: "left", roomId: null, leftOn: toIsoDate(), updatedAt: Date.now() });
  logActivity({ action: "updated", entity: "inmate", entityId: studentId, label: `${inmate.fullName} left`, branchId: inmate.branchId });
}

export async function reinstate(studentId: string): Promise<void> {
  const inmate = inmateById(studentId);
  if (!inmate) return;
  await patch("inmates", studentId, { status: "active", leftOn: null, updatedAt: Date.now() });
  logActivity({ action: "updated", entity: "inmate", entityId: studentId, label: `${inmate.fullName} reinstated`, branchId: inmate.branchId });
}

/**
 * Moves an inmate to another branch.
 *
 * Their existing id is kept rather than reissued: the number already appears on
 * past receipts and exports, and renumbering would break that trail. The id is
 * displayed with the new branch's letter from then on.
 */
export async function moveToBranch(studentId: string, branchId: string): Promise<void> {
  const inmate = inmateById(studentId);
  if (!inmate) return;
  await patch("inmates", studentId, { branchId, roomId: null, updatedAt: Date.now() });
  logActivity({ action: "updated", entity: "inmate", entityId: studentId, label: `${inmate.fullName} moved branch`, branchId });
}

/** Permanently removes an inmate, their photos, and their fee history. */
export async function deleteInmate(studentId: string): Promise<void> {
  const existing = inmateById(studentId);

  // Bills and payments go with the inmate, as the database cascade did. The
  // server is asked too, in case a bill was raised elsewhere a moment ago.
  const feeDocs = new Set(
    entries<FeeYearDoc>("fees")
      .filter(([, doc]) => doc.studentId === studentId)
      .map(([docId]) => docId)
  );
  for (const doc of await freshWhere<FeeYearDoc>("fees", "studentId", studentId)) {
    feeDocs.add(`${doc.studentId}_${doc.year}`);
  }
  for (const docId of feeDocs) await remove("fees", docId);
  // Complaints outlive the person who raised them.
  for (const complaint of list<Complaint>("complaints").filter((item) => item.studentId === studentId)) {
    await patch("complaints", complaint.id, { studentId: null });
  }
  await remove("inmates", studentId);

  deletePhoto(existing?.photoFile ?? null);
  deletePhoto(existing?.idProofFile ?? null);
  deletePhoto(existing?.idProofBackFile ?? null);

  if (existing) {
    logActivity({ action: "deleted", entity: "inmate", entityId: studentId, label: existing.fullName, branchId: existing.branchId });
  }
}

/**
 * The number the next new inmate will be given, for display on the form.
 * Read-only -- it does not advance the counter.
 */
export async function peekNextAdmissionNo(branchId?: string): Promise<string> {
  const target = branchId ?? getActiveBranchId();
  if (!target) return "1";
  const counter = find<{ value?: number }>("counters", counterId(target));
  return String(highestIssued(Number(counter?.value) || 0, allInmates(), target) + 1);
}

export interface InmateCounts {
  total: number;
  active: number;
  left: number;
  unassigned: number;
}

export async function inmateCounts(): Promise<InmateCounts> {
  const rows = allInmates().filter((inmate) => inActiveBranch(inmate.branchId));
  return {
    total: rows.length,
    active: rows.filter((inmate) => inmate.status === "active").length,
    left: rows.filter((inmate) => inmate.status === "left").length,
    unassigned: rows.filter((inmate) => inmate.status === "active" && !inmate.roomId).length,
  };
}

export function statusOf(student: Pick<Inmate, "status">): InmateStatus {
  return student.status;
}
