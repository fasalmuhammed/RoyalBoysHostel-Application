import { getDb } from "@/db";
import { Branch } from "@/types";

/**
 * Branch scoping.
 *
 * Both hostels live in one database and one backup file. "Switching branch"
 * changes a filter, not the store -- so a single export always covers the whole
 * organisation, and moving an inmate between branches is an edit rather than a
 * migration.
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
 * SQL fragment scoping a query to the active branch.
 *
 * Returns an empty clause when no branch is active, which is what backup and
 * whole-organisation reports want. `column` is a trusted literal supplied by
 * this codebase, never user input.
 */
export function branchClause(column: string): { sql: string; params: string[] } {
  if (!activeBranchId) return { sql: "", params: [] };
  return { sql: `${column} = ?`, params: [activeBranchId] };
}

/** Like `branchClause`, but also matches rows shared across every branch. */
export function branchOrSharedClause(column: string): { sql: string; params: string[] } {
  if (!activeBranchId) return { sql: "", params: [] };
  return { sql: `(${column} = ? OR ${column} IS NULL)`, params: [activeBranchId] };
}

export async function listBranches(): Promise<Branch[]> {
  const db = await getDb();
  return db.getAllAsync<Branch>("SELECT * FROM branches ORDER BY sortOrder, name;");
}

export async function getBranch(id: string): Promise<Branch | null> {
  const db = await getDb();
  return db.getFirstAsync<Branch>("SELECT * FROM branches WHERE id = ?;", id);
}

export async function renameBranch(id: string, name: string, shortName: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE branches SET name = ?, shortName = ?, updatedAt = ? WHERE id = ?;",
    name.trim(),
    shortName.trim(),
    Date.now(),
    id
  );
}

export interface BranchSummary extends Branch {
  inmates: number;
  rooms: number;
}

/** Headline counts per branch, for the picker. */
export async function listBranchSummaries(): Promise<BranchSummary[]> {
  const db = await getDb();
  return db.getAllAsync<BranchSummary>(
    `SELECT b.*,
            (SELECT COUNT(*) FROM students s
              WHERE s.branchId = b.id AND s.status = 'active') AS inmates,
            (SELECT COUNT(*) FROM rooms r WHERE r.branchId = b.id) AS rooms
     FROM branches b
     ORDER BY b.sortOrder, b.name;`
  );
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
