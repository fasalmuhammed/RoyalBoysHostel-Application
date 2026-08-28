import { getDb } from "@/db";
import { Notice, NoticeCategory } from "@/types";
import { newId } from "@/utils/id";
import { toIsoDate } from "@/utils/format";

export type NoticeInput = Omit<Notice, "id" | "createdAt" | "updatedAt" | "lastSentAt">;

export type NoticeFilter = "all" | NoticeCategory;

/** SQLite has no boolean type, so `pinned` arrives as 0/1. */
type NoticeRow = Omit<Notice, "pinned"> & { pinned: number };

function hydrate(row: NoticeRow): Notice {
  return { ...row, pinned: Boolean(row.pinned) };
}

export async function listNotices(filter: NoticeFilter = "all", search = ""): Promise<Notice[]> {
  const db = await getDb();

  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (filter !== "all") {
    clauses.push("category = ?");
    params.push(filter);
  }

  const term = search.trim().toLowerCase();
  if (term) {
    clauses.push("(LOWER(title) LIKE ? OR LOWER(body) LIKE ?)");
    params.push(`%${term}%`, `%${term}%`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await db.getAllAsync<NoticeRow>(
    `SELECT * FROM notices ${where}
     ORDER BY pinned DESC, postedOn DESC, createdAt DESC;`,
    params
  );
  return rows.map(hydrate);
}

export async function getNotice(id: string): Promise<Notice | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<NoticeRow>("SELECT * FROM notices WHERE id = ?;", id);
  return row ? hydrate(row) : null;
}

export async function createNotice(input: NoticeInput): Promise<string> {
  const db = await getDb();
  const id = newId();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO notices (id, title, body, category, pinned, postedOn, lastSentAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?);`,
    id, input.title, input.body, input.category, input.pinned ? 1 : 0,
    input.postedOn || toIsoDate(), now, now
  );
  return id;
}

export async function updateNotice(id: string, input: NoticeInput): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE notices SET title = ?, body = ?, category = ?, pinned = ?, postedOn = ?, updatedAt = ?
     WHERE id = ?;`,
    input.title, input.body, input.category, input.pinned ? 1 : 0,
    input.postedOn || toIsoDate(), Date.now(), id
  );
}

export async function deleteNotice(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM notices WHERE id = ?;", id);
}

export async function togglePinned(id: string, pinned: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE notices SET pinned = ?, updatedAt = ? WHERE id = ?;",
    pinned ? 1 : 0, Date.now(), id
  );
}

/**
 * Stamps a notice as having been sent out.
 *
 * Recorded when the WhatsApp batch is *prepared*, not when each message
 * actually leaves — the app cannot observe the latter. The send queue remains
 * the accurate per-recipient record; this is only the board's "already
 * circulated" marker.
 */
export async function markNoticeSent(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE notices SET lastSentAt = ? WHERE id = ?;", Date.now(), id);
}

export const CATEGORY_LABELS: Record<NoticeCategory, string> = {
  general: "General",
  event: "Event",
  maintenance: "Maintenance",
  urgent: "Urgent",
};

/**
 * Turns a notice into WhatsApp-ready text.
 *
 * `{{name}}` and `{{hostel}}` are left as placeholders rather than resolved
 * here, so the composer can still merge each recipient's own details — the
 * same substitution every other message type goes through.
 */
export function noticeToMessage(notice: Pick<Notice, "title" | "body">): string {
  const title = notice.title.trim();
  const body = notice.body.trim();
  return `Dear {{name}},\n\n*${title}*\n\n${body}\n\n- {{hostel}}`;
}

export async function noticeCounts(): Promise<Record<NoticeFilter, number>> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, number>>(
    `SELECT COUNT(*) AS all_count,
            COALESCE(SUM(category = 'general'), 0)     AS general,
            COALESCE(SUM(category = 'event'), 0)       AS event,
            COALESCE(SUM(category = 'maintenance'), 0) AS maintenance,
            COALESCE(SUM(category = 'urgent'), 0)      AS urgent
     FROM notices;`
  );
  return {
    all: row?.all_count ?? 0,
    general: row?.general ?? 0,
    event: row?.event ?? 0,
    maintenance: row?.maintenance ?? 0,
    urgent: row?.urgent ?? 0,
  };
}
