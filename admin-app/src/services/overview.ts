import { Notice } from "@/types";
import { list } from "@/store/cloud";
import {
  allBills,
  allInmates,
  allRooms,
  branchById,
  compareRaw,
  compareRooms,
  compareText,
  contains,
  inmateById,
  occupancyByRoom,
  roomById,
  roomLabelOf,
} from "@/store/views";
import { inActiveBranch, inActiveBranchOrShared } from "./branches";
import { listDueForReminder } from "./fees";
import { pendingMessageCount } from "./messaging";
import { loadSettings } from "./settings";
import { daysUntil, toIsoDate } from "@/utils/format";

/**
 * Cross-cutting reads that span several kinds of record: the global search
 * box and the notification feed.
 *
 * Both are derived on demand rather than stored, so the alerts can never be
 * stale or need dismissing twice -- and with live updates they change the
 * moment someone on another device fixes the cause.
 */

export interface SearchHit {
  kind: "inmate" | "room" | "fee" | "notice";
  id: string;
  title: string;
  subtitle: string;
  /** Stored photo id, when the hit is a person. */
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

  const inmates = allInmates()
    .filter((inmate) => inActiveBranch(inmate.branchId))
    .filter(
      (inmate) => contains(inmate.fullName, query) || contains(inmate.phone, query) || contains(inmate.admissionNo, query)
    )
    .sort((a, b) => compareText(a.fullName, b.fullName))
    .slice(0, 12);

  const rooms = allRooms()
    .filter((room) => inActiveBranch(room.branchId))
    .filter((room) => contains(`${room.block}-${room.roomNumber}`, query))
    .sort(compareRooms)
    .slice(0, 8);

  const fees = allBills()
    .map((bill) => ({ bill, inmate: inmateById(bill.studentId) }))
    .filter(({ inmate }) => inmate && inActiveBranch(inmate.branchId) && contains(inmate.fullName, query))
    .sort((a, b) => compareRaw(b.bill.period, a.bill.period))
    .slice(0, 8);

  const notices = list<Notice>("notices")
    .filter((notice) => inActiveBranchOrShared(notice.branchId))
    .filter((notice) => contains(notice.title, query) || contains(notice.body, query))
    .sort((a, b) => compareRaw(b.postedOn, a.postedOn))
    .slice(0, 8);

  const results: SearchResults = {
    inmates: inmates.map((inmate) => {
      const code = branchById(inmate.branchId)?.code ?? null;
      const roomLabel = roomLabelOf(roomById(inmate.roomId));
      return {
        kind: "inmate",
        id: inmate.id,
        title: inmate.fullName,
        subtitle: [
          code ? `${code}-${inmate.admissionNo}` : inmate.admissionNo,
          roomLabel ? `Room ${roomLabel}` : "No room",
          inmate.phone,
        ]
          .filter(Boolean)
          .join(" · "),
        photoFile: inmate.photoFile,
      };
    }),
    rooms: rooms.map((room) => ({
      kind: "room",
      id: room.id,
      title: `Room ${roomLabelOf(room)}`,
      subtitle: `${occupancyByRoom().get(room.id) ?? 0} of ${room.capacity} beds taken`,
    })),
    fees: fees.map(({ bill, inmate }) => {
      const balance = bill.total - bill.amountPaid;
      return {
        kind: "fee",
        id: bill.id,
        title: inmate?.fullName ?? "",
        subtitle: `${bill.period} · ${balance > 0.01 ? "outstanding" : "settled"}`,
      };
    }),
    notices: notices.map((notice) => ({
      kind: "notice",
      id: notice.id,
      title: notice.title,
      subtitle: notice.postedOn,
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
      body: "Download a backup file now and then, so a copy exists outside Claude storage.",
      action: "backup",
    });
  }

  const active = allInmates().filter((inmate) => inmate.status === "active" && inActiveBranch(inmate.branchId));

  const unassigned = active.filter((inmate) => !inmate.roomId).length;
  if (unassigned > 0) {
    alerts.push({
      id: "unassigned",
      tone: "warning",
      icon: "bed-outline",
      title: `${unassigned} inmate(s) have no room`,
      body: "Allocate a bed so their rent is priced from the room.",
      action: "inmates",
    });
  }

  const noPhone = active.filter((inmate) => (inmate.phone ?? "").trim() === "").length;
  if (noPhone > 0) {
    alerts.push({
      id: "no-phone",
      tone: "info",
      icon: "call-outline",
      title: `${noPhone} inmate(s) have no phone number`,
      body: "They cannot be reached by the WhatsApp reminders.",
      action: "inmates",
    });
  }

  const pending = pendingMessageCount();
  if (pending > 0) {
    alerts.push({
      id: "messages-pending",
      tone: "info",
      icon: "logo-whatsapp",
      title: `${pending} message(s) still to send`,
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
