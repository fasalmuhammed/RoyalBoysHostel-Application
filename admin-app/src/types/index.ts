/**
 * Domain model.
 *
 * Every record carries a UUID `id` plus `createdAt` / `updatedAt` epoch millis.
 * Nothing here depends on a server: ids are generated on-device so a backup
 * restored onto a different phone keeps every relationship intact.
 */

export type StudentStatus = "active" | "left";

export interface Student {
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
  idProof: string;
  /** Filename (not a full URI) inside the app's photos directory. */
  photoFile: string | null;
  roomId: string | null;
  status: StudentStatus;
  /** ISO yyyy-mm-dd. */
  joinedOn: string;
  leftOn: string | null;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface Room {
  id: string;
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

export interface FeeRecordWithStudent extends FeeRecord {
  studentName: string;
  admissionNo: string;
  studentPhone: string;
  photoFile: string | null;
  roomLabel: string | null;
  status: FeeStatus;
  balance: number;
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
  defaultRent: number;
  /** Day of month invoices fall due, 1-28. */
  feeDueDay: number;
  /** Warn on the dashboard when the last backup is older than this. */
  backupReminderDays: number;
  lastBackupAt: number | null;
  autoBackupEnabled: boolean;
  setupComplete: boolean;
}
