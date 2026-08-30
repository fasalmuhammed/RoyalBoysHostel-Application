import { getDb } from "@/db";
import { Complaint, ComplaintCategory, ComplaintStatus, ComplaintWithContext } from "@/types";
import { newId } from "@/utils/id";
import { toIsoDate } from "@/utils/format";
import { branchClause, requireActiveBranchId } from "./branches";
import { deletePhoto } from "./photos";

export type ComplaintInput = Omit<
  Complaint,
  "id" | "createdAt" | "updatedAt" | "resolvedAt" | "resolution"
>;

export type ComplaintFilter = "all" | ComplaintStatus;

const SELECT_WITH_CONTEXT = `
  SELECT c.*,
         CASE WHEN r.id IS NULL THEN NULL
              WHEN r.block = '' THEN r.roomNumber
              ELSE r.block || '-' || r.roomNumber END AS roomLabel,
         s.fullName AS raisedByName,
         s.photoFile AS raisedByPhoto
  FROM complaints c
  LEFT JOIN rooms r ON r.id = c.roomId
  LEFT JOIN students s ON s.id = c.studentId
`;

export async function listComplaints(
  filter: ComplaintFilter = "all",
  search = ""
): Promise<ComplaintWithContext[]> {
  const db = await getDb();

  const clauses: string[] = [];
  const params: (string | number)[] = [];

  const branch = branchClause("c.branchId");
  if (branch.sql) {
    clauses.push(branch.sql);
    params.push(...branch.params);
  }
  if (filter !== "all") {
    clauses.push("c.status = ?");
    params.push(filter);
  }
  const term = search.trim().toLowerCase();
  if (term) {
    clauses.push("(LOWER(c.title) LIKE ? OR LOWER(c.description) LIKE ?)");
    params.push(`%${term}%`, `%${term}%`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db.getAllAsync<ComplaintWithContext>(
    `${SELECT_WITH_CONTEXT} ${where}
     ORDER BY
       CASE c.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
       c.createdAt DESC;`,
    params
  );
}

export async function getComplaint(id: string): Promise<ComplaintWithContext | null> {
  const db = await getDb();
  return db.getFirstAsync<ComplaintWithContext>(`${SELECT_WITH_CONTEXT} WHERE c.id = ?;`, id);
}

export async function createComplaint(input: ComplaintInput): Promise<string> {
  const db = await getDb();
  const id = newId();
  const now = Date.now();
  const branchId = input.branchId || requireActiveBranchId();

  await db.runAsync(
    `INSERT INTO complaints (id, branchId, roomId, studentId, title, description, category,
       status, photoFile, raisedOn, resolvedAt, resolution, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '', ?, ?);`,
    id, branchId, input.roomId, input.studentId, input.title, input.description,
    input.category, input.status, input.photoFile, input.raisedOn || toIsoDate(), now, now
  );
  return id;
}

export async function updateComplaint(id: string, input: ComplaintInput): Promise<void> {
  const db = await getDb();
  const existing = await getComplaint(id);

  await db.runAsync(
    `UPDATE complaints SET roomId = ?, studentId = ?, title = ?, description = ?,
       category = ?, status = ?, photoFile = ?, raisedOn = ?, updatedAt = ?
     WHERE id = ?;`,
    input.roomId, input.studentId, input.title, input.description, input.category,
    input.status, input.photoFile, input.raisedOn || toIsoDate(), Date.now(), id
  );

  if (existing?.photoFile && existing.photoFile !== input.photoFile) {
    deletePhoto(existing.photoFile);
  }
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
  const db = await getDb();
  await db.runAsync(
    "UPDATE complaints SET status = ?, resolvedAt = ?, resolution = ?, updatedAt = ? WHERE id = ?;",
    status,
    status === "resolved" ? Date.now() : null,
    status === "resolved" ? resolution : "",
    Date.now(),
    id
  );
}

export async function deleteComplaint(id: string): Promise<void> {
  const db = await getDb();
  const existing = await getComplaint(id);
  await db.runAsync("DELETE FROM complaints WHERE id = ?;", id);
  deletePhoto(existing?.photoFile ?? null);
}

export interface ComplaintCounts {
  all: number;
  open: number;
  in_progress: number;
  resolved: number;
}

export async function complaintCounts(): Promise<ComplaintCounts> {
  const db = await getDb();
  const branch = branchClause("branchId");
  const where = branch.sql ? `WHERE ${branch.sql}` : "";
  const row = await db.getFirstAsync<Record<string, number>>(
    `SELECT COUNT(*) AS all_count,
            COALESCE(SUM(status = 'open'), 0)        AS open_count,
            COALESCE(SUM(status = 'in_progress'), 0) AS progress_count,
            COALESCE(SUM(status = 'resolved'), 0)    AS resolved_count
     FROM complaints ${where};`,
    branch.params
  );
  return {
    all: row?.all_count ?? 0,
    open: row?.open_count ?? 0,
    in_progress: row?.progress_count ?? 0,
    resolved: row?.resolved_count ?? 0,
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
