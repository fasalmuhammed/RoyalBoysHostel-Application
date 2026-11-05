/**
 * Registration forms students send by scanning a hostel's QR code.
 *
 * A form arrives through the server (students have no login) and waits here
 * as "pending". Staff look it over, then approve it -- which admits the
 * student as an inmate -- or reject it, which deletes it and its photos.
 */
import { find, list, logActivity, remove } from "@/store/cloud";
import { roomIdInActiveHouse } from "@/store/views";
import { getActiveBranchId, inActiveBranch } from "./branches";
import { RoomFullError, createInmate } from "./inmates";
import { formatRoomLabel, getRoom, listRooms } from "./rooms";
import { deletePhoto } from "./photos";
import { DEFAULT_CYCLE_DAYS } from "./fees";
import { toIsoDate } from "@/utils/format";

export interface Application {
  id: string;
  branchId: string;
  status: "pending";
  fullName: string;
  phone: string;
  email: string;
  course: string;
  year: string;
  institution: string;
  institutionType?: "college" | "company";
  guardianName: string;
  guardianPhone: string;
  emergencyPhone: string;
  address: string;
  bloodGroup: string;
  /** The room the student picked; null when they did not know it. */
  roomId: string | null;
  photoFile: string | null;
  idProofFile: string | null;
  idProofBackFile: string | null;
  /** When the student ticked "I accept the rules" on the form. */
  termsAcceptedAt?: number;
  termsVersion?: string;
  createdAt: number;
}

/** Waiting forms for the hostel being operated, oldest first. */
export function listApplications(): Application[] {
  return list<Application>("applications")
    .filter((a) => inActiveBranch(a.branchId))
    // With one building selected: the forms asking for a room in it, plus
    // those that named no room, which either building may take.
    .filter((a) => !a.roomId || roomIdInActiveHouse(a.roomId))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function countApplications(): number {
  return listApplications().length;
}

export function getApplication(id: string): Application | null {
  return find<Application>("applications", id);
}

export interface RoomGroup {
  roomId: string | null;
  label: string;
  /** Beds free right now; null for "no room chosen". */
  free: number | null;
  applications: Application[];
}

/** The same forms grouped under the room each student chose. */
export async function groupByRoom(applications: Application[]): Promise<RoomGroup[]> {
  const rooms = await listRooms();
  const groups: RoomGroup[] = [];
  for (const room of rooms) {
    const mine = applications.filter((a) => a.roomId === room.id);
    if (mine.length) {
      groups.push({ roomId: room.id, label: `Room ${formatRoomLabel(room)}`, free: room.vacant, applications: mine });
    }
  }
  const known = new Set(rooms.map((room) => room.id));
  const rest = applications.filter((a) => !a.roomId || !known.has(a.roomId));
  if (rest.length) groups.push({ roomId: null, label: "No room chosen", free: null, applications: rest });
  return groups;
}

export interface ApproveOptions {
  /** The room to admit into; may differ from what the student picked. */
  roomId: string | null;
  monthlyRent: number;
  joinedOn?: string;
}

/**
 * Admits the student. Their photos are already in the hostel's photo folder,
 * so the new inmate record simply points at them.
 */
export async function approveApplication(id: string, options: ApproveOptions): Promise<string> {
  const application = getApplication(id);
  if (!application) throw new Error("This form was already handled on another device.");
  if (options.roomId) {
    const room = await getRoom(options.roomId);
    if (room && room.vacant <= 0) throw new RoomFullError(`Room ${formatRoomLabel(room)} is full. Choose another room.`);
  }

  const inmateId = await createInmate({
    admissionNo: "",
    fullName: application.fullName,
    phone: application.phone,
    guardianName: application.guardianName,
    guardianPhone: application.guardianPhone,
    emergencyPhone: application.emergencyPhone,
    bloodGroup: application.bloodGroup,
    institution: application.institution,
    institutionType: application.institutionType ?? "",
    email: application.email,
    course: application.course,
    year: application.year,
    address: application.address,
    idProof: "",
    photoFile: application.photoFile,
    idProofFile: application.idProofFile,
    idProofBackFile: application.idProofBackFile,
    roomId: options.roomId,
    branchId: application.branchId,
    status: "active",
    monthlyRent: options.monthlyRent,
    billingCycleDays: DEFAULT_CYCLE_DAYS,
    admissionType: "monthly",
    stayDays: null,
    joinedOn: options.joinedOn ?? toIsoDate(),
    leftOn: null,
    termsAcceptedAt: application.termsAcceptedAt ?? null,
    termsVersion: application.termsVersion ?? "",
    notes: "Registered with the QR form.",
  });
  await remove("applications", id);
  return inmateId;
}

/** Deletes the form and the photos that came with it. */
export async function rejectApplication(id: string): Promise<void> {
  const application = getApplication(id);
  if (!application) return;
  await remove("applications", id);
  deletePhoto(application.photoFile);
  deletePhoto(application.idProofFile);
  deletePhoto(application.idProofBackFile);
  logActivity({
    action: "deleted",
    entity: "inmate",
    entityId: id,
    label: `${application.fullName} (registration rejected)`,
    branchId: application.branchId,
  });
}

/** Where a hostel's QR code points. */
export function joinLink(branchId: string | null = getActiveBranchId()): string {
  const emulator = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST;
  const base =
    process.env.EXPO_PUBLIC_JOIN_URL ||
    (emulator ? `http://${emulator}:5000` : `https://${process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID}.web.app`);
  return `${base.replace(/\/$/, "")}/join?b=${encodeURIComponent(branchId ?? "")}`;
}
