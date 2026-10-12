import { Complaint, ComplaintCategory, ComplaintStatus, ComplaintWithContext } from "@/types";
import { newId } from "@/utils/id";
import { toIsoDate } from "@/utils/format";
import { find, list, logActivity, patch, put, remove } from "@/store/cloud";
import { contains, inmateById, roomById, roomLabelOf } from "@/store/views";
import { inActiveBranch, requireActiveBranchId } from "./branches";
import { deletePhoto } from "./photos";

export type ComplaintInput = Omit<
  Complaint,
  "id" | "createdAt" | "updatedAt" | "resolvedAt" | "resolution"
>;

export type ComplaintFilter = "all" | ComplaintStatus;

function withContext(complaint: Complaint): ComplaintWithContext {
  const raisedBy = inmateById(complaint.studentId);
  return {
    ...complaint,
    roomLabel: roomLabelOf(roomById(complaint.roomId)),
    raisedByName: raisedBy ? raisedBy.fullName : null,
    raisedByPhoto: raisedBy ? raisedBy.photoFile : null,
  };
}

const STATUS_RANK: Record<ComplaintStatus, number> = { open: 0, in_progress: 1, resolved: 2 };

export async function listComplaints(
  filter: ComplaintFilter = "all",
  search = ""
): Promise<ComplaintWithContext[]> {
  const term = search.trim().toLowerCase();
  return list<Complaint>("complaints")
    .filter((complaint) => inActiveBranch(complaint.branchId))
    .filter((complaint) => filter === "all" || complaint.status === filter)
    .filter((complaint) => !term || contains(complaint.title, term) || contains(complaint.description, term))
    .sort(
      (a, b) =>
        (STATUS_RANK[a.status] ?? 2) - (STATUS_RANK[b.status] ?? 2) || b.createdAt - a.createdAt
    )
    .map(withContext);
}

export async function getComplaint(id: string): Promise<ComplaintWithContext | null> {
  const complaint = find<Complaint>("complaints", id);
  return complaint ? withContext(complaint) : null;
}

export async function createComplaint(input: ComplaintInput): Promise<string> {
  const id = newId();
  const now = Date.now();
  const branchId = input.branchId || requireActiveBranchId();

  await put("complaints", id, {
    id,
    branchId,
    roomId: input.roomId,
    studentId: input.studentId,
    title: input.title,
    description: input.description,
    category: input.category,
    status: input.status,
    photoFile: input.photoFile,
    raisedOn: input.raisedOn || toIsoDate(),
    resolvedAt: null,
    resolution: "",
    createdAt: now,
    updatedAt: now,
  });
  logActivity({ action: "created", entity: "complaint", entityId: id, label: input.title, branchId });
  return id;
}

export async function updateComplaint(id: string, input: ComplaintInput): Promise<void> {
  const existing = find<Complaint>("complaints", id);
  if (!existing) return;

  await patch("complaints", id, {
    roomId: input.roomId,
    studentId: input.studentId,
    title: input.title,
    description: input.description,
    category: input.category,
    status: input.status,
    photoFile: input.photoFile,
    raisedOn: input.raisedOn || toIsoDate(),
    updatedAt: Date.now(),
  });

  if (existing.photoFile && existing.photoFile !== input.photoFile) {
    deletePhoto(existing.photoFile);
  }
  logActivity({ action: "updated", entity: "complaint", entityId: id, label: input.title, branchId: existing.branchId });
}

/**
 * Moves a complaint along.
 *
 * `resolvedAt` is stamped only on the way into `resolved`, and cleared on the
 * way out, so reopening something does not leave a resolution date on an open
 * problem.
 */
export async function setStatus(
  id: string,
  status: ComplaintStatus,
  resolution = ""
): Promise<void> {
  const existing = find<Complaint>("complaints", id);
  if (!existing) return;
  await patch("complaints", id, {
    status,
    resolvedAt: status === "resolved" ? Date.now() : null,
    resolution: status === "resolved" ? resolution : "",
    updatedAt: Date.now(),
  });
  logActivity({
    action: "updated",
    entity: "complaint",
    entityId: id,
    label: `${existing.title} · ${STATUS_LABELS[status]}`,
    branchId: existing.branchId,
  });
}

export async function deleteComplaint(id: string): Promise<void> {
  const existing = find<Complaint>("complaints", id);
  await remove("complaints", id);
  deletePhoto(existing?.photoFile ?? null);
  if (existing) {
    logActivity({ action: "deleted", entity: "complaint", entityId: id, label: existing.title, branchId: existing.branchId });
  }
}

export interface ComplaintCounts {
  all: number;
  open: number;
  in_progress: number;
  resolved: number;
}

export async function complaintCounts(): Promise<ComplaintCounts> {
  const rows = list<Complaint>("complaints").filter((complaint) => inActiveBranch(complaint.branchId));
  return {
    all: rows.length,
    open: rows.filter((complaint) => complaint.status === "open").length,
    in_progress: rows.filter((complaint) => complaint.status === "in_progress").length,
    resolved: rows.filter((complaint) => complaint.status === "resolved").length,
  };
}

export const CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  electrical: "Electrical",
  plumbing: "Plumbing",
  furniture: "Furniture",
  cleanliness: "Cleanliness",
  internet: "Wi-Fi / Internet",
  food: "Food / Mess",
  other: "Other",
};

export const STATUS_LABELS: Record<ComplaintStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
};

export const CATEGORY_ICONS: Record<ComplaintCategory, string> = {
  electrical: "flash-outline",
  plumbing: "water-outline",
  furniture: "bed-outline",
  cleanliness: "sparkles-outline",
  internet: "wifi-outline",
  food: "restaurant-outline",
  other: "ellipsis-horizontal-circle-outline",
};
