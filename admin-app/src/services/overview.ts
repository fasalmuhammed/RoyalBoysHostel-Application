import { getDb } from "@/db";
import { branchClause, branchOrSharedClause } from "./branches";
import { listDueForReminder } from "./fees";
import { loadSettings } from "./settings";
import { daysUntil, toIsoDate } from "@/utils/format";

/**
 * Cross-cutting reads that span several tables: the global search box and the
 * notification feed.
 *
 * Both are derived on demand rather than stored. There is no push service and
 * no server to keep a notification table in step, so computing the alerts from
 * the data itself means they can never be stale or need dismissing twice.
 */

export interface SearchHit {
  kind: "inmate" | "room" | "fee" | "notice";
  id: string;
  title: string;
  subtitle: string;
  /** Filename of an inmate photo, when the hit is a person. */
  photoFile?: string | null;
}

export interface SearchResults {
  inmates: SearchHit[];
  rooms: SearchHit[];
  fees: SearchHit[];
  notices: SearchHit[];
  total: number;
}

const EMPTY: SearchResults = { inmates: [], rooms: [], fees: [], notices: [], total: 0 };

/** Searches inmates, rooms, bills and notices in the active branch at once. */
export async function globalSearch(term: string): Promise<SearchResults> {
  const query = term.trim().toLowerCase();
  if (query.length < 2) return EMPTY;

  const db = await getDb();
  const like = `%${query}%`;

  const inmateBranch = branchClause("s.branchId");
  const inmates = await db.getAllAsync<{
    id: string;
    fullName: string;
    admissionNo: string;
    phone: string;
    photoFile: string | null;
    code: string | null;
    roomLabel: string | null;
  }>(
    `SELECT s.id, s.fullName, s.admissionNo, s.phone, s.photoFile, b.code,
            CASE WHEN r.id IS NULL THEN NULL
                 WHEN r.block = '' THEN r.roomNumber
                 ELSE r.block || '-' || r.roomNumber END AS roomLabel
     FROM students s
     LEFT JOIN rooms r ON r.id = s.roomId
     LEFT JOIN branches b ON b.id = s.branchId
     WHERE (LOWER(s.fullName) LIKE ? OR s.phone LIKE ? OR s.admissionNo LIKE ?)
       ${inmateBranch.sql ? `AND ${inmateBranch.sql}` : ""}
     ORDER BY s.fullName COLLATE NOCASE LIMIT 12;`,
    [like, like, like, ...inmateBranch.params]
  );

  const roomBranch = branchClause("r.branchId");
  const rooms = await db.getAllAsync<{
    id: string;
    label: string;
    capacity: number;
    occupied: number;
  }>(
    `SELECT r.id,
            CASE WHEN r.block = '' THEN r.roomNumber ELSE r.block || '-' || r.roomNumber END AS label,
            r.capacity,
            COALESCE((SELECT COUNT(*) FROM students s
                      WHERE s.roomId = r.id AND s.status = 'active'), 0) AS occupied
     FROM rooms r
     WHERE LOWER(r.block || '-' || r.roomNumber) LIKE ?
       ${roomBranch.sql ? `AND ${roomBranch.sql}` : ""}
     ORDER BY r.block, CAST(r.roomNumber AS INTEGER) LIMIT 8;`,
    [like, ...roomBranch.params]
  );

  const feeBranch = branchClause("s.branchId");
  const fees = await db.getAllAsync<{
    id: string;
    fullName: string;
    period: string;
    balance: number;
  }>(
    `SELECT f.id, s.fullName, f.period, (f.total - f.amountPaid) AS balance
     FROM fee_records f
     JOIN students s ON s.id = f.studentId
     WHERE LOWER(s.fullName) LIKE ?
       ${feeBranch.sql ? `AND ${feeBranch.sql}` : ""}
     ORDER BY f.period DESC LIMIT 8;`,
    [like, ...feeBranch.params]
  );

  const noticeBranch = branchOrSharedClause("branchId");
  const notices = await db.getAllAsync<{ id: string; title: string; postedOn: string }>(
    `SELECT id, title, postedOn FROM notices
     WHERE (LOWER(title) LIKE ? OR LOWER(body) LIKE ?)
       ${noticeBranch.sql ? `AND ${noticeBranch.sql}` : ""}
     ORDER BY postedOn DESC LIMIT 8;`,
    [like, like, ...noticeBranch.params]
  );

  const results: SearchResults = {
    inmates: inmates.map((row) => ({
      kind: "inmate",
      id: row.id,
      title: row.fullName,
      subtitle: [
        row.code ? `${row.code}-${row.admissionNo}` : row.admissionNo,
        row.roomLabel ? `Room ${row.roomLabel}` : "No room",
        row.phone,
      ]
        .filter(Boolean)
        .join(" · "),
      photoFile: row.photoFile,
    })),
    rooms: rooms.map((row) => ({
      kind: "room",
      id: row.id,
      title: `Room ${row.label}`,
      subtitle: `${row.occupied} of ${row.capacity} beds taken`,
    })),
    fees: fees.map((row) => ({
      kind: "fee",
      id: row.id,
      title: row.fullName,
      subtitle: `${row.period} · ${row.balance > 0.01 ? "outstanding" : "settled"}`,
    })),
    notices: notices.map((row) => ({
      kind: "notice",
      id: row.id,
      title: row.title,
      subtitle: row.postedOn,
    })),
    total: 0,
  };
  results.total =
    results.inmates.length + results.rooms.length + results.fees.length + results.notices.length;
  return results;
}

export type AlertTone = "danger" | "warning" | "info" | "success";

export interface Alert {
  id: string;
  tone: AlertTone;
  icon: string;
  title: string;
  body: string;
  /** Where tapping it should go. */
  action: "fees" | "backup" | "inmates" | "notices" | "messages" | null;
}

/**
 * The notification feed.
 *
 * Everything here is something the admin can act on today, computed live from
 * the data. Nothing is persisted, so there is no read/unread state to drift
 * out of step with reality.
 */
export async function buildAlerts(): Promise<Alert[]> {
  const db = await getDb();
  const settings = await loadSettings();
  const alerts: Alert[] = [];

  const overdue = await listDueForReminder(toIsoDate());
  if (overdue.length > 0) {
    const worst = overdue[0];
    alerts.push({
      id: "fees-overdue",
      tone: "danger",
      icon: "alarm-outline",
      title: `${overdue.length} fee${overdue.length === 1 ? "" : "s"} overdue`,
      body:
        overdue.length === 1
          ? `${worst.studentName} is ${Math.abs(daysUntil(worst.dueDate))} day(s) past due.`
          : `Oldest is ${worst.studentName}, ${Math.abs(daysUntil(worst.dueDate))} day(s) past due.`,
      action: "fees",
    });
  }

  const ageDays = settings.lastBackupAt
    ? Math.floor((Date.now() - settings.lastBackupAt) / 86_400_000)
    : null;
  if (ageDays === null || ageDays >= settings.backupReminderDays) {
    alerts.push({
      id: "backup-overdue",
      tone: "warning",
      icon: "cloud-upload-outline",
      title: ageDays === null ? "You have never backed up" : `Last backup ${ageDays} days ago`,
      body: "If this phone is lost or broken, everything goes with it.",
      action: "backup",
    });
  }

  const branch = branchClause("branchId");
  const unassigned = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM students
     WHERE status = 'active' AND roomId IS NULL
     ${branch.sql ? `AND ${branch.sql}` : ""};`,
    branch.params
  );
  if ((unassigned?.n ?? 0) > 0) {
    alerts.push({
      id: "unassigned",
      tone: "warning",
      icon: "bed-outline",
      title: `${unassigned?.n} inmate(s) have no room`,
      body: "Allocate a bed so their rent is priced from the room.",
      action: "inmates",
    });
  }

  const noPhone = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM students
     WHERE status = 'active' AND TRIM(COALESCE(phone, '')) = ''
     ${branch.sql ? `AND ${branch.sql}` : ""};`,
    branch.params
  );
  if ((noPhone?.n ?? 0) > 0) {
    alerts.push({
      id: "no-phone",
      tone: "info",
      icon: "call-outline",
      title: `${noPhone?.n} inmate(s) have no phone number`,
      body: "They cannot be reached by the WhatsApp reminders.",
      action: "inmates",
    });
  }

  const pending = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM message_log WHERE status = 'queued';"
  );
  if ((pending?.n ?? 0) > 0) {
    alerts.push({
      id: "messages-pending",
      tone: "info",
      icon: "logo-whatsapp",
      title: `${pending?.n} message(s) still to send`,
      body: "Open the send queue to finish the batch.",
      action: "messages",
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: "all-clear",
      tone: "success",
      icon: "checkmark-circle-outline",
      title: "Nothing needs attention",
      body: "Fees are current and your backup is recent.",
      action: null,
    });
  }

  return alerts;
}
