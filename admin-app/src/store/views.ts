/**
 * Derived views over the live records: the joins, sums and orderings that
 * SQLite used to compute. Each is cached until the next change.
 */
import type { Branch, FeeRecord, Inmate, Payment, PaymentMethod, Room } from "@/types";
import { entries, find, list, storeVersion } from "./cloud";

// --- fee documents ----------------------------------------------------------

/**
 * Bills are grouped one document per inmate per calendar year
 * (`fees/<studentId>_<yyyy>`), each bill keyed by its period and carrying its
 * payments. That keeps the database far below its document cap as years of
 * monthly bills accumulate, and keeps a bill and its payments in a single
 * document, so recording a payment is one write.
 */
export interface PaymentDoc {
  id: string;
  amount: number;
  method: PaymentMethod;
  paidOn: string;
  reference: string;
  note: string;
  createdAt: number;
}

export interface BillDoc {
  id: string;
  period: string;
  rent: number;
  electricity: number;
  water: number;
  other: number;
  discount: number;
  total: number;
  dueDate: string;
  /**
   * Set when a bill is part-paid: the day the inmate promised the balance
   * for. Until then the bill is not chased; on that day it is due again.
   * Empty once the bill is settled or no promise was made.
   */
  promisedDate?: string;
  note: string;
  createdAt: number;
  updatedAt: number;
  payments?: Record<string, PaymentDoc>;
}

export interface FeeYearDoc {
  studentId: string;
  year: string;
  /** The inmate's branch, kept on the document so access can be checked by it. */
  branchId?: string | null;
  bills?: Record<string, BillDoc>;
}

/** A bill as the services use it: the SQLite row shape plus its payments. */
export interface BillEntry extends FeeRecord {
  docId: string;
  payments: Payment[];
}

export function feeDocId(studentId: string, period: string): string {
  return `${studentId}_${period.slice(0, 4)}`;
}

/** Money is summed in paise-free floats, as SQLite did; this keeps ties stable. */
export function sumPayments(payments: Record<string, PaymentDoc> | undefined): number {
  return Object.values(payments ?? {}).reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
}

export function toBillEntry(docId: string, studentId: string, bill: BillDoc): BillEntry {
  const payments = Object.values(bill.payments ?? {}).map<Payment>((payment) => ({
    id: payment.id,
    feeRecordId: bill.id,
    studentId,
    amount: payment.amount,
    method: payment.method,
    paidOn: payment.paidOn,
    reference: payment.reference,
    note: payment.note,
    createdAt: payment.createdAt,
  }));
  return {
    id: bill.id,
    studentId,
    period: bill.period,
    rent: bill.rent,
    electricity: bill.electricity,
    water: bill.water,
    other: bill.other,
    discount: bill.discount,
    total: bill.total,
    amountPaid: sumPayments(bill.payments),
    dueDate: bill.dueDate,
    promisedDate: bill.promisedDate ?? "",
    note: bill.note,
    createdAt: bill.createdAt,
    updatedAt: bill.updatedAt,
    docId,
    payments,
  };
}

// --- memoisation --------------------------------------------------------------

function memo<T>(compute: () => T): () => T {
  let cachedAt = -1;
  let value: T;
  return () => {
    const now = storeVersion();
    if (now !== cachedAt) {
      value = compute();
      cachedAt = now;
    }
    return value;
  };
}

interface FeeIndex {
  bills: BillEntry[];
  byId: Map<string, BillEntry>;
  byStudent: Map<string, BillEntry[]>;
  byPayment: Map<string, BillEntry>;
}

const feeIndex = memo<FeeIndex>(() => {
  const bills: BillEntry[] = [];
  const byId = new Map<string, BillEntry>();
  const byStudent = new Map<string, BillEntry[]>();
  const byPayment = new Map<string, BillEntry>();
  for (const [docId, doc] of entries<FeeYearDoc>("fees")) {
    if (!doc.studentId) continue;
    for (const bill of Object.values(doc.bills ?? {})) {
      if (!bill?.id) continue;
      const entry = toBillEntry(docId, doc.studentId, bill);
      bills.push(entry);
      byId.set(entry.id, entry);
      const forStudent = byStudent.get(doc.studentId);
      if (forStudent) forStudent.push(entry);
      else byStudent.set(doc.studentId, [entry]);
      for (const payment of entry.payments) byPayment.set(payment.id, entry);
    }
  }
  return { bills, byId, byStudent, byPayment };
});

// --- one building of a hostel --------------------------------------------------
//
// When a single building is chosen at the top of the app, everything read
// through the three lists below is narrowed to it, so every screen, total and
// report follows without knowing about buildings at all. A room is in a
// building by its block; an inmate by their room; a bill by its inmate. An
// inmate of that hostel with no room yet shows in every one of its buildings
// (with a NO ROOM badge), so nobody waiting for a bed -- or their bill -- is
// ever out of sight; once given a room, they show only in its building.

let activeHouse: string | null = null;
/** The hostel the chosen building belongs to. */
let activeHouseBranch: string | null = null;

/** Letters only, without vowels: "PUSHPAMANGLAM" and "Pushpamangalam" match. */
const houseKey = (name: string | null | undefined): string =>
  String(name ?? "").toLowerCase().replace(/[^a-z]/g, "").replace(/[aeiou]/g, "");

/** Whether a room's block names the given building, forgiving spelling slips. */
export function isHouse(block: string | null | undefined, house: string): boolean {
  return houseKey(block) !== "" && houseKey(block) === houseKey(house);
}

export function setActiveHouse(house: string | null, branchId: string | null = null): void {
  activeHouse = house;
  activeHouseBranch = house ? branchId : null;
}

export function getActiveHouse(): string | null {
  return activeHouse;
}

const roomInHouse = (room: Room | null): boolean => !activeHouse || (room !== null && isHouse(room.block, activeHouse));
const inmateInHouse = (inmate: Inmate | null): boolean => {
  if (!activeHouse) return true;
  if (inmate === null) return false;
  const room = find<Room>("rooms", inmate.roomId);
  // No room yet: shown in every building of their own hostel.
  if (room === null) return activeHouseBranch === null || inmate.branchId === activeHouseBranch;
  return roomInHouse(room);
};

/** Whether a room (by id) is in the building being looked at. */
export function roomIdInActiveHouse(roomId: string | null | undefined): boolean {
  return !activeHouse || roomInHouse(find<Room>("rooms", roomId));
}

export const allBills = (): BillEntry[] =>
  activeHouse ? feeIndex().bills.filter((bill) => inmateInHouse(find<Inmate>("inmates", bill.studentId))) : feeIndex().bills;
export const billById = (id: string): BillEntry | null => feeIndex().byId.get(id) ?? null;
export const billsForStudent = (studentId: string): BillEntry[] => feeIndex().byStudent.get(studentId) ?? [];
export const billForPayment = (paymentId: string): BillEntry | null => feeIndex().byPayment.get(paymentId) ?? null;

// --- people and places --------------------------------------------------------

export const allInmates = (): Inmate[] =>
  activeHouse ? list<Inmate>("inmates").filter(inmateInHouse) : list<Inmate>("inmates");
export const allRooms = (): Room[] => (activeHouse ? list<Room>("rooms").filter(roomInHouse) : list<Room>("rooms"));
export const allBranches = (): Branch[] => list<Branch>("branches");
export const inmateById = (id: string | null | undefined): Inmate | null => find<Inmate>("inmates", id);
export const roomById = (id: string | null | undefined): Room | null => find<Room>("rooms", id);
export const branchById = (id: string | null | undefined): Branch | null => find<Branch>("branches", id);

/** Active inmates per room. Occupancy is always derived, never stored. */
export const occupancyByRoom = memo<Map<string, number>>(() => {
  const counts = new Map<string, number>();
  for (const inmate of list<Inmate>("inmates")) {
    if (inmate.status === "active" && inmate.roomId) {
      counts.set(inmate.roomId, (counts.get(inmate.roomId) ?? 0) + 1);
    }
  }
  return counts;
});

/** Unpaid balance per inmate across every bill raised for them. */
export const outstandingByStudent = memo<Map<string, number>>(() => {
  const totals = new Map<string, number>();
  for (const bill of feeIndex().bills) {
    if (bill.amountPaid < bill.total - 0.01) {
      totals.set(bill.studentId, (totals.get(bill.studentId) ?? 0) + (bill.total - bill.amountPaid));
    }
  }
  return totals;
});

// --- shared formatting and ordering ------------------------------------------

/** `A-101`, or the bare number when the room has no block. */
/** A block as written in front of a room number: "A" stays "A"; a building's name becomes its initials. */
export function shortBlock(block: string | null | undefined): string {
  const text = String(block ?? "").trim();
  if (text.length <= 4) return text;
  return text
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase())
    .join("");
}

export function roomLabelOf(room: Pick<Room, "block" | "roomNumber"> | null | undefined): string | null {
  if (!room) return null;
  const block = shortBlock(room.block);
  return block === "" ? room.roomNumber : `${block}-${room.roomNumber}`;
}

/** SQLite's `COLLATE NOCASE`: case-insensitive for ASCII letters. */
export function compareText(a: string | null | undefined, b: string | null | undefined): number {
  const x = (a ?? "").toLowerCase();
  const y = (b ?? "").toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

/** SQLite's binary string ordering. */
export function compareRaw(a: string | null | undefined, b: string | null | undefined): number {
  const x = a ?? "";
  const y = b ?? "";
  return x < y ? -1 : x > y ? 1 : 0;
}

/** SQLite's `CAST(x AS INTEGER)`: the leading digits, or 0. */
export function castInt(value: string | null | undefined): number {
  const match = /^\s*[-+]?\d+/.exec(value ?? "");
  return match ? Number.parseInt(match[0], 10) : 0;
}

/** `ORDER BY block, CAST(roomNumber AS INTEGER), roomNumber`. */
export function compareRooms(a: Pick<Room, "block" | "roomNumber">, b: Pick<Room, "block" | "roomNumber">): number {
  return (
    compareRaw(a.block, b.block) ||
    castInt(a.roomNumber) - castInt(b.roomNumber) ||
    compareRaw(a.roomNumber, b.roomNumber)
  );
}

/** Case-insensitive substring match, as `LOWER(x) LIKE %term%`. */
export function contains(value: string | null | undefined, lowerTerm: string): boolean {
  return (value ?? "").toLowerCase().includes(lowerTerm);
}
