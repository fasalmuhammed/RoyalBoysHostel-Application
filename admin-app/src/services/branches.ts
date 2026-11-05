import { Branch } from "@/types";
import { canWriteRecords, count, logActivity, patch, put } from "@/store/cloud";
import { allBranches, allInmates, allRooms, branchById, compareRaw } from "@/store/views";

/**
 * Branch scoping.
 *
 * Both hostels live in one store. "Switching branch" changes a filter, not
 * the store -- so a single export always covers the whole organisation, and
 * moving an inmate between branches is an edit rather than a migration.
 *
 * The active branch is held here as module state rather than threaded through
 * every query signature. Only one branch is ever active in the UI, and passing
 * it explicitly through several dozen call sites would add noise without
 * removing the underlying assumption.
 */

let activeBranchId: string | null = null;

/** Set by AppContext once the admin picks a branch. */
export function setActiveBranchId(id: string | null): void {
  activeBranchId = id;
}

export function getActiveBranchId(): string | null {
  return activeBranchId;
}

/**
 * The branch a new record belongs to.
 *
 * Writes must never guess: creating an inmate with no branch would leave a row
 * invisible from either side of the app.
 */
export function requireActiveBranchId(): string {
  if (!activeBranchId) {
    throw new Error("No branch is selected. Choose a hostel before adding records.");
  }
  return activeBranchId;
}

/**
 * Whether a record belongs to the active branch. Everything matches when no
 * branch is active, which is what backup and whole-organisation reports want.
 */
export function inActiveBranch(branchId: string | null | undefined): boolean {
  return !activeBranchId || branchId === activeBranchId;
}

/** Like `inActiveBranch`, but also matches records shared across every branch. */
export function inActiveBranchOrShared(branchId: string | null | undefined): boolean {
  return !activeBranchId || branchId === activeBranchId || branchId == null;
}

/**
 * The two hostels. Ids are fixed strings rather than generated uuids so a
 * backup taken on any device lines up with the same branches everywhere.
 */
const DEFAULT_BRANCHES: Omit<Branch, "createdAt" | "updatedAt">[] = [
  { id: "branch-thammanam", name: "Thammanam - Royal Boys Hostel", shortName: "Thammanam", code: "T", sortOrder: 1 },
  { id: "branch-Kalamassery", name: "Kalamassery - Royal Boys Hostel", shortName: "Kalamassery", code: "K", sortOrder: 2 },
];

/**
 * Creates the two branches the first time the records are opened. Fixed ids
 * make this safe if two people open a brand-new store at the same moment.
 */
export async function seedBranches(): Promise<void> {
  if (count("branches") > 0 || canWriteRecords() === false) return;
  const now = Date.now();
  for (const branch of DEFAULT_BRANCHES) {
    await put("branches", branch.id, { ...branch, createdAt: now, updatedAt: now });
  }
}

function byOrder(a: Branch, b: Branch): number {
  return a.sortOrder - b.sortOrder || compareRaw(a.name, b.name);
}

/**
 * Hostels made of more than one building, until the list is kept with the
 * hostel's own record. Thammanam is two buildings a short walk apart.
 */
const DEFAULT_HOUSES: Record<string, string[]> = {
  "branch-thammanam": ["Pushpamangalam", "Royal House"],
};

/** The buildings of a hostel; empty when it is a single building. */
export function housesOf(branch: Pick<Branch, "id" | "houses"> | null | undefined): string[] {
  if (!branch) return [];
  return branch.houses && branch.houses.length > 0 ? branch.houses : (DEFAULT_HOUSES[branch.id] ?? []);
}

export async function listBranches(): Promise<Branch[]> {
  return [...allBranches()].sort(byOrder).map((branch) => ({ ...branch, houses: housesOf(branch) }));
}

export async function getBranch(id: string): Promise<Branch | null> {
  return branchById(id);
}

export async function renameBranch(id: string, name: string, shortName: string): Promise<void> {
  if (!branchById(id)) return;
  await patch("branches", id, { name: name.trim(), shortName: shortName.trim(), updatedAt: Date.now() });
  logActivity({ action: "updated", entity: "branch", entityId: id, label: shortName.trim() || name.trim(), branchId: id });
}

export interface BranchSummary extends Branch {
  inmates: number;
  rooms: number;
}

/** Headline counts per branch, for the picker. */
export async function listBranchSummaries(): Promise<BranchSummary[]> {
  const inmates = allInmates();
  const rooms = allRooms();
  return (await listBranches()).map((branch) => ({
    ...branch,
    inmates: inmates.filter((item) => item.branchId === branch.id && item.status === "active").length,
    rooms: rooms.filter((item) => item.branchId === branch.id).length,
  }));
}

/**
 * Formats an inmate's id for display, e.g. `T-14`.
 *
 * Numbering restarts per branch, so the branch letter is what makes an id
 * unambiguous on a receipt or a spreadsheet shared between the two hostels.
 */
export function formatInmateId(branchCode: string | null | undefined, admissionNo: string): string {
  if (!admissionNo) return "—";
  return branchCode ? `${branchCode}-${admissionNo}` : admissionNo;
}
