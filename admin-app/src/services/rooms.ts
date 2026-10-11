import { Complaint, Inmate, Room, RoomWithOccupancy } from "@/types";
import { newId } from "@/utils/id";
import { list, logActivity, patch, put, remove } from "@/store/cloud";
import { allInmates, allRooms, compareRooms, contains, occupancyByRoom, roomById, roomLabelOf } from "@/store/views";
import { inActiveBranch, requireActiveBranchId } from "./branches";

type RoomInput = Omit<Room, "id" | "createdAt" | "updatedAt">;

function withOccupancy(room: Room): RoomWithOccupancy {
  const occupied = occupancyByRoom().get(room.id) ?? 0;
  return { ...room, occupied, vacant: Math.max(room.capacity - occupied, 0) };
}

/**
 * Occupancy is always derived from inmates' `roomId` rather than stored on the
 * room. A denormalised counter would drift the moment an inmate is deleted or
 * a backup is restored mid-edit.
 */
export async function listRooms(search = ""): Promise<RoomWithOccupancy[]> {
  const term = search.trim().toLowerCase();
  return allRooms()
    .filter((room) => inActiveBranch(room.branchId))
    .filter((room) => !term || contains(`${room.block} ${room.roomNumber}`, term) || contains(room.roomNumber, term))
    .sort(compareRooms)
    .map(withOccupancy);
}

export async function getRoom(id: string): Promise<RoomWithOccupancy | null> {
  const room = roomById(id);
  return room ? withOccupancy(room) : null;
}

export async function createRoom(input: RoomInput): Promise<string> {
  const id = newId();
  const now = Date.now();
  const branchId = input.branchId || requireActiveBranchId();
  await put("rooms", id, {
    id,
    branchId,
    block: input.block,
    roomNumber: input.roomNumber,
    floor: input.floor,
    capacity: input.capacity,
    rent: input.rent,
    deposit: input.deposit,
    amenities: input.amenities,
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  });
  logActivity({ action: "created", entity: "room", entityId: id, label: `Room ${formatRoomLabel(input)}`, branchId });
  return id;
}

export async function updateRoom(id: string, input: RoomInput): Promise<void> {
  const existing = roomById(id);
  if (!existing) return;
  await patch("rooms", id, {
    block: input.block,
    roomNumber: input.roomNumber,
    floor: input.floor,
    capacity: input.capacity,
    rent: input.rent,
    deposit: input.deposit,
    amenities: input.amenities,
    notes: input.notes,
    updatedAt: Date.now(),
  });
  logActivity({ action: "updated", entity: "room", entityId: id, label: `Room ${formatRoomLabel(input)}`, branchId: existing.branchId });
}

/**
 * Deleting a room detaches its occupants rather than removing them, so a
 * mis-tap can never destroy inmate records. Complaints about the room keep
 * their history and simply lose the room link.
 */
export async function deleteRoom(id: string): Promise<void> {
  const existing = roomById(id);
  for (const inmate of allInmates().filter((item: Inmate) => item.roomId === id)) {
    await patch("inmates", inmate.id, { roomId: null });
  }
  for (const complaint of list<Complaint>("complaints").filter((item) => item.roomId === id)) {
    await patch("complaints", complaint.id, { roomId: null });
  }
  await remove("rooms", id);
  if (existing) {
    logActivity({ action: "deleted", entity: "room", entityId: id, label: `Room ${formatRoomLabel(existing)}`, branchId: existing.branchId });
  }
}

export async function roomLabel(id: string | null): Promise<string | null> {
  if (!id) return null;
  return roomLabelOf(roomById(id));
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
  const rooms = allRooms().filter((room) => inActiveBranch(room.branchId));
  const beds = rooms.reduce((sum, room) => sum + room.capacity, 0);
  const occupied = allInmates().filter(
    (inmate) => inmate.status === "active" && inmate.roomId && inActiveBranch(inmate.branchId)
  ).length;
  return { rooms: rooms.length, beds, occupied, vacant: Math.max(beds - occupied, 0) };
}
