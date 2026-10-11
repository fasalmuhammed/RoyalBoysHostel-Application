import { Notice, NoticeCategory } from "@/types";
import { newId } from "@/utils/id";
import { toIsoDate } from "@/utils/format";
import { find, list, logActivity, patch, put, remove } from "@/store/cloud";
import { compareRaw, contains } from "@/store/views";
import { inActiveBranchOrShared } from "./branches";

export type NoticeInput = Omit<Notice, "id" | "createdAt" | "updatedAt" | "lastSentAt">;

export type NoticeFilter = "all" | NoticeCategory;

/** Older records (and restored phone backups) may carry `pinned` as 0/1. */
function hydrate(notice: Notice): Notice {
  return { ...notice, pinned: Boolean(notice.pinned) };
}

function visibleNotices(): Notice[] {
  // A notice with no branch applies to every branch, so it shows on both boards.
  return list<Notice>("notices").map(hydrate).filter((notice) => inActiveBranchOrShared(notice.branchId));
}

export async function listNotices(filter: NoticeFilter = "all", search = ""): Promise<Notice[]> {
  const term = search.trim().toLowerCase();
  return visibleNotices()
    .filter((notice) => filter === "all" || notice.category === filter)
    .filter((notice) => !term || contains(notice.title, term) || contains(notice.body, term))
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) || compareRaw(b.postedOn, a.postedOn) || b.createdAt - a.createdAt
    );
}

export async function getNotice(id: string): Promise<Notice | null> {
  const notice = find<Notice>("notices", id);
  return notice ? hydrate(notice) : null;
}

export async function createNotice(input: NoticeInput): Promise<string> {
  const id = newId();
  const now = Date.now();
  await put("notices", id, {
    id,
    branchId: input.branchId,
    title: input.title,
    body: input.body,
    category: input.category,
    pinned: Boolean(input.pinned),
    postedOn: input.postedOn || toIsoDate(),
    lastSentAt: null,
    createdAt: now,
    updatedAt: now,
  });
  logActivity({ action: "created", entity: "notice", entityId: id, label: input.title, branchId: input.branchId });
  return id;
}

export async function updateNotice(id: string, input: NoticeInput): Promise<void> {
  if (!find("notices", id)) return;
  await patch("notices", id, {
    branchId: input.branchId,
    title: input.title,
    body: input.body,
    category: input.category,
    pinned: Boolean(input.pinned),
    postedOn: input.postedOn || toIsoDate(),
    updatedAt: Date.now(),
  });
  logActivity({ action: "updated", entity: "notice", entityId: id, label: input.title, branchId: input.branchId });
}

export async function deleteNotice(id: string): Promise<void> {
  const existing = find<Notice>("notices", id);
  await remove("notices", id);
  if (existing) {
    logActivity({ action: "deleted", entity: "notice", entityId: id, label: existing.title, branchId: existing.branchId });
  }
}

export async function togglePinned(id: string, pinned: boolean): Promise<void> {
  if (!find("notices", id)) return;
  await patch("notices", id, { pinned, updatedAt: Date.now() });
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
  if (!find("notices", id)) return;
  await patch("notices", id, { lastSentAt: Date.now() });
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
  const rows = visibleNotices();
  const of = (category: NoticeCategory) => rows.filter((notice) => notice.category === category).length;
  return {
    all: rows.length,
    general: of("general"),
    event: of("event"),
    maintenance: of("maintenance"),
    urgent: of("urgent"),
  };
}
