/**
 * Domain model.
 *
 * Every record carries a UUID `id` plus `createdAt` / `updatedAt` epoch millis.
 * Nothing here depends on a server: ids are generated on-device so a backup
 * restored onto a different phone keeps every relationship intact.
 */

/**
 * A hostel branch. Both branches share one database, one backup file and one
 * install; the active branch is a filter over that shared store.
 */
export interface Branch {
  id: string;
  /** Full name as it appears on receipts and messages. */
  name: string;
  /** Short label for chips and headers, e.g. "Thammanam". */
  shortName: string;
  /** Single letter prefixed to inmate ids, e.g. "T" -> T-14. */
  code: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export type InmateStatus = "active" | "left";

/**
 * `"monthly"` is the recurring cycle every student defaults to. `"stay"` is a
 * short-term guest admitted for a fixed number of days (`stayDays`) and
 * billed exactly once for the whole stay -- see services/fees.ts, which
 * excludes `"stay"` students from the monthly "raise bills" batch.
 */
export type AdmissionType = "monthly" | "stay";

export interface Inmate {
  id: string;
  admissionNo: string;
  fullName: string;
  phone: string;
  guardianName: string;
  guardianPhone: string;
  email: string;
  course: string;
  year: string;
  address: string;
  /** Who to ring in an emergency, when it is not the guardian. Blank on older records. */
  emergencyPhone?: string;
  /** e.g. "O+". Optional. */
  bloodGroup?: string;
  /** College or company. Optional. */
  institution?: string;
  /** Legacy free-text field (e.g. "Aadhaar last 4 digits"). Kept for old records; no longer editable. */
  idProof: string;
  /** Filename (not a full URI) inside the app's photos directory. */
  photoFile: string | null;
  /** Filename inside the app's photos directory: front of the Aadhaar/ID proof. */
  idProofFile: string | null;
  /** Filename inside the app's photos directory: back of the Aadhaar/ID proof. */
  idProofBackFile: string | null;
  roomId: string | null;
  /** Which branch this inmate belongs to. */
  branchId: string;
  status: InmateStatus;
  /** `"monthly"` (recurring) or `"stay"` (fixed number of days, billed once). */
  admissionType: AdmissionType;
  /** Total length of a `"stay"` admission, in days. Null/ignored for `"monthly"`. */
  stayDays: number | null;
  /**
   * Agreed rent for this student, in rupees. For `admissionType === "monthly"`
   * this is a monthly rate, pre-filled from their room when one is assigned
   * but editable. For `admissionType === "stay"` it is instead the flat total
   * for the whole stay, typed directly (no per-day proration).
   */
  monthlyRent: number;
  /**
   * Legacy field, no longer editable or read by billing logic -- a monthly
   * bill's due date is now the day-of-month the student joined on (see
   * `services/fees.ts` `dueDateFor`/`anchorDayFor`). Kept only because old
   * records and backups still carry a value here.
   */
  billingCycleDays: number;
  /** ISO yyyy-mm-dd. */
  joinedOn: string;
  leftOn: string | null;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface Room {
  id: string;
  /** Which branch this room is in. */
  branchId: string;
  block: string;
  roomNumber: string;
  floor: string;
  capacity: number;
  /** Monthly rent per bed, in rupees. */
  rent: number;
  deposit: number;
  amenities: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

/** A room joined with its live occupancy counts. */
export interface RoomWithOccupancy extends Room {
  occupied: number;
  vacant: number;
}

export type FeeStatus = "paid" | "unpaid" | "partial";

export interface FeeRecord {
  id: string;
  studentId: string;
  /** Billing period as `yyyy-MM`, e.g. "2026-08". */
  period: string;
  rent: number;
  electricity: number;
  water: number;
  other: number;
  discount: number;
  /** rent + electricity + water + other - discount. Stored, not derived, so a
   *  past invoice is never silently rewritten by a later rent change. */
  total: number;
  amountPaid: number;
  /** ISO yyyy-mm-dd. */
  dueDate: string;
  note: string;
  createdAt: number;
  updatedAt: number;
}

export interface FeeRecordWithInmate extends FeeRecord {
  studentName: string;
  admissionNo: string;
  studentPhone: string;
  photoFile: string | null;
  roomLabel: string | null;
  status: FeeStatus;
  balance: number;
  /** The billing student's current admission type, for a "one-time stay" badge. */
  admissionType: AdmissionType;
}

export type PaymentMethod = "cash" | "upi" | "card" | "bank" | "cheque";

export interface Payment {
  id: string;
  feeRecordId: string;
  studentId: string;
  amount: number;
  method: PaymentMethod;
  /** ISO yyyy-mm-dd. */
  paidOn: string;
  reference: string;
  note: string;
  createdAt: number;
}

export type NoticeCategory = "general" | "event" | "maintenance" | "urgent";

/**
 * A hostel notice. Kept as a record in its own right rather than only as a
 * sent message, so the board still reads as a board after the WhatsApp batch
 * has been sent and cleared.
 */
export interface Notice {
  id: string;
  /** Owning branch, or null when the notice applies to every branch. */
  branchId: string | null;
  title: string;
  body: string;
  category: NoticeCategory;
  /** Pinned notices sort to the top of the board regardless of date. */
  pinned: boolean;
  /** ISO yyyy-mm-dd. */
  postedOn: string;
  /** Epoch millis of the last WhatsApp batch raised from this notice. */
  lastSentAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export type ComplaintStatus = "open" | "in_progress" | "resolved";

export type ComplaintCategory =
  | "electrical"
  | "plumbing"
  | "furniture"
  | "cleanliness"
  | "internet"
  | "food"
  | "other";

/**
 * A maintenance complaint.
 *
 * Both `roomId` and `studentId` are nullable and clear rather than cascade:
 * most complaints are about a fitting, not a person, so one must outlive the
 * inmate who reported it and the room being reorganised.
 */
export interface Complaint {
  id: string;
  branchId: string;
  roomId: string | null;
  /** Who reported it, when that is worth recording. */
  studentId: string | null;
  title: string;
  description: string;
  category: ComplaintCategory;
  status: ComplaintStatus;
  photoFile: string | null;
  /** ISO yyyy-mm-dd. */
  raisedOn: string;
  /** Epoch millis, set only while the status is `resolved`. */
  resolvedAt: number | null;
  resolution: string;
  createdAt: number;
  updatedAt: number;
}

export interface ComplaintWithContext extends Complaint {
  roomLabel: string | null;
  raisedByName: string | null;
  raisedByPhoto: string | null;
}

export type MessageKind = "announcement" | "fee_reminder" | "custom";

export interface MessageTemplate {
  id: string;
  name: string;
  kind: MessageKind;
  body: string;
  /** Built-in templates are seeded on first run and cannot be deleted. */
  isBuiltIn: boolean;
  createdAt: number;
  updatedAt: number;
}

export type MessageStatus = "queued" | "sent" | "skipped" | "failed";

/**
 * One row per intended WhatsApp message. The app never sends silently — it
 * opens WhatsApp with the text pre-filled and records the outcome here, so the
 * admin can see exactly who has and has not been contacted.
 */
export interface MessageLogEntry {
  id: string;
  batchId: string;
  studentId: string | null;
  recipientName: string;
  phone: string;
  kind: MessageKind;
  body: string;
  status: MessageStatus;
  createdAt: number;
  sentAt: number | null;
}

export interface MessageBatchSummary {
  batchId: string;
  kind: MessageKind;
  createdAt: number;
  total: number;
  sent: number;
  pending: number;
  preview: string;
}

/** Free-form key/value app settings, typed at the accessor level. */
export interface AppSettings {
  hostelName: string;
  /** Digits only, no +, used to build wa.me links. e.g. "91" for India. */
  countryCode: string;
  currencySymbol: string;
  /** Branch selected on the last run, used to preselect the picker. */
  activeBranchId: string | null;
  /** Warn on the dashboard when the last backup is older than this. */
  backupReminderDays: number;
  lastBackupAt: number | null;
  autoBackupEnabled: boolean;
  setupComplete: boolean;
}
