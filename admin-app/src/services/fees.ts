import { getDb } from "@/db";
import { FeeRecord, FeeRecordWithInmate, FeeStatus, Payment, PaymentMethod } from "@/types";
import { newId } from "@/utils/id";
import { daysUntil, toIsoDate, toPeriod } from "@/utils/format";
import { branchClause } from "./branches";

export type FeeInput = Omit<FeeRecord, "id" | "createdAt" | "updatedAt" | "total" | "amountPaid">;

/**
 * Status is derived from `total` vs `amountPaid` in SQL rather than stored, so
 * it can never fall out of step with the payments actually recorded.
 *
 * The 0.01 tolerance absorbs floating-point drift from split payments (three
 * payments of 2000.00 against 6000.00 can land a hair under).
 */
const STATUS_SQL = `
  CASE
    WHEN f.amountPaid >= f.total - 0.01 THEN 'paid'
    WHEN f.amountPaid > 0.009 THEN 'partial'
    ELSE 'unpaid'
  END
`;

const SELECT_WITH_STUDENT = `
  SELECT f.*,
         s.fullName      AS studentName,
         s.admissionNo   AS admissionNo,
         s.phone         AS studentPhone,
         s.photoFile     AS photoFile,
         s.admissionType AS admissionType,
         CASE WHEN r.id IS NULL THEN NULL
              WHEN r.block = '' THEN r.roomNumber
              ELSE r.block || '-' || r.roomNumber END AS roomLabel,
         ${STATUS_SQL} AS status,
         (f.total - f.amountPaid) AS balance
  FROM fee_records f
  JOIN students s ON s.id = f.studentId
  LEFT JOIN rooms r ON r.id = s.roomId
`;

/** `"due"` combines unpaid + partial -- everything still owed, across any status split. */
export type FeeFilter = "all" | "due" | FeeStatus;

export async function listFees(
  filter: FeeFilter = "all",
  period: string | null = null,
  search = ""
): Promise<FeeRecordWithInmate[]> {
  const db = await getDb();

  const clauses: string[] = [];
  const params: (string | number)[] = [];

  // A bill has no branch of its own; it belongs to whichever branch the inmate
  // being billed belongs to.
  const branch = branchClause("s.branchId");
  if (branch.sql) {
    clauses.push(branch.sql);
    params.push(...branch.params);
  }

  if (period) {
    clauses.push("f.period = ?");
    params.push(period);
  }
  const term = search.trim().toLowerCase();
  if (term) {
    clauses.push("(LOWER(s.fullName) LIKE ? OR LOWER(s.admissionNo) LIKE ?)");
    params.push(`%${term}%`, `%${term}%`);
  }
  if (filter === "due") {
    clauses.push(`${STATUS_SQL} IN ('unpaid', 'partial')`);
  } else if (filter !== "all") {
    clauses.push(`${STATUS_SQL} = ?`);
    params.push(filter);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db.getAllAsync<FeeRecordWithInmate>(
    `${SELECT_WITH_STUDENT} ${where} ORDER BY f.period DESC, s.fullName COLLATE NOCASE;`,
    params
  );
}

export async function getFee(id: string): Promise<FeeRecordWithInmate | null> {
  const db = await getDb();
  return db.getFirstAsync<FeeRecordWithInmate>(`${SELECT_WITH_STUDENT} WHERE f.id = ?;`, id);
}

export async function listFeesForStudent(studentId: string): Promise<FeeRecordWithInmate[]> {
  const db = await getDb();
  return db.getAllAsync<FeeRecordWithInmate>(
    `${SELECT_WITH_STUDENT} WHERE f.studentId = ? ORDER BY f.period DESC;`,
    studentId
  );
}

function sumTotal(input: Pick<FeeInput, "rent" | "electricity" | "water" | "other" | "discount">): number {
  return Math.max(input.rent + input.electricity + input.water + input.other - input.discount, 0);
}

/** Thrown when an invoice already exists for that student and month. */
export class DuplicateInvoiceError extends Error {}

export async function createFee(input: FeeInput): Promise<string> {
  const db = await getDb();
  const id = newId();
  const now = Date.now();

  const clash = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM fee_records WHERE studentId = ? AND period = ?;",
    input.studentId,
    input.period
  );
  if (clash) {
    throw new DuplicateInvoiceError("An invoice for this student and month already exists.");
  }

  await db.runAsync(
    `INSERT INTO fee_records (id, studentId, period, rent, electricity, water, other, discount,
       total, amountPaid, dueDate, note, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?);`,
    id, input.studentId, input.period, input.rent, input.electricity, input.water,
    input.other, input.discount, sumTotal(input), input.dueDate, input.note, now, now
  );
  return id;
}

export async function updateFee(id: string, input: FeeInput): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE fee_records SET period = ?, rent = ?, electricity = ?, water = ?, other = ?,
       discount = ?, total = ?, dueDate = ?, note = ?, updatedAt = ?
     WHERE id = ?;`,
    input.period, input.rent, input.electricity, input.water, input.other,
    input.discount, sumTotal(input), input.dueDate, input.note, Date.now(), id
  );
}

export async function deleteFee(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM fee_records WHERE id = ?;", id);
}

export interface GenerateResult {
  created: number;
  skipped: number;
}

/**
 * Raises one invoice per active, room-assigned student for `period`, pricing
 * each at their room's rent.
 *
 * Students who already have an invoice for that month are skipped, which makes
 * the whole operation safe to re-run -- the common case is running it again
 * after a few more students have been admitted mid-month.
 */
export async function generateInvoices(period: string): Promise<GenerateResult> {
  const db = await getDb();

  // Each student carries their own rent and join date, so a batch run produces
  // per-student amounts and deadlines rather than one blanket figure. Their
  // room's rent is only a fallback for records created before rent moved onto
  // the student.
  const branch = branchClause("s.branchId");
  const branchAnd = branch.sql ? `AND ${branch.sql}` : "";

  const candidates = await db.getAllAsync<{
    id: string;
    monthlyRent: number;
    joinedOn: string;
    roomRent: number | null;
  }>(
    `SELECT s.id AS id, s.monthlyRent AS monthlyRent, s.joinedOn AS joinedOn,
            r.rent AS roomRent
     FROM students s
     LEFT JOIN rooms r ON r.id = s.roomId
     WHERE s.status = 'active'
       AND s.admissionType != 'stay'
       AND s.id NOT IN (SELECT studentId FROM fee_records WHERE period = ?)
       ${branchAnd};`,
    [period, ...branch.params]
  );

  // Fixed-days stays are billed once at admission (see InmateFormScreen), never
  // swept into this recurring monthly batch -- so they don't count toward the
  // "active inmates this batch could bill" total either.
  const activeBranch = branchClause("branchId");
  const total = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM students WHERE status = 'active' AND admissionType != 'stay'
     ${activeBranch.sql ? `AND ${activeBranch.sql}` : ""};`,
    activeBranch.params
  );

  if (candidates.length > 0) {
    const now = Date.now();
    await db.withExclusiveTransactionAsync(async (txn) => {
      for (const row of candidates) {
        const rent = row.monthlyRent > 0 ? row.monthlyRent : (row.roomRent ?? 0);
        const dueDate = dueDateFor(period, anchorDayFor(row.joinedOn));
        await txn.runAsync(
          `INSERT INTO fee_records (id, studentId, period, rent, electricity, water, other,
             discount, total, amountPaid, dueDate, note, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, 0, 0, 0, 0, ?, 0, ?, '', ?, ?);`,
          newId(), row.id, period, rent, rent, dueDate, now, now
        );
      }
    });
  }

  return {
    created: candidates.length,
    skipped: (total?.n ?? 0) - candidates.length,
  };
}

export class OverpaymentError extends Error {}

/**
 * Records a payment and advances the invoice's paid total in one transaction.
 *
 * Overpayment is rejected rather than clamped: a wrong amount is far more
 * likely to be a typo than a genuine tip, and silently absorbing it would hide
 * the mistake from the receipt.
 */
export async function recordPayment(
  feeRecordId: string,
  amount: number,
  method: PaymentMethod,
  paidOn: string,
  reference: string,
  note: string
): Promise<void> {
  if (amount <= 0) throw new OverpaymentError("Enter an amount greater than zero.");

  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    const fee = await txn.getFirstAsync<{ total: number; amountPaid: number; studentId: string }>(
      "SELECT total, amountPaid, studentId FROM fee_records WHERE id = ?;",
      feeRecordId
    );
    if (!fee) throw new OverpaymentError("That invoice no longer exists.");

    const balance = fee.total - fee.amountPaid;
    if (amount > balance + 0.01) {
      throw new OverpaymentError(
        `That is more than the outstanding balance. At most ${balance.toFixed(2)} can be collected.`
      );
    }

    await txn.runAsync(
      `INSERT INTO payments (id, feeRecordId, studentId, amount, method, paidOn, reference, note, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      newId(), feeRecordId, fee.studentId, amount, method, paidOn, reference, note, Date.now()
    );
    await txn.runAsync(
      "UPDATE fee_records SET amountPaid = amountPaid + ?, updatedAt = ? WHERE id = ?;",
      amount, Date.now(), feeRecordId
    );
  });
}

export async function listPayments(feeRecordId: string): Promise<Payment[]> {
  const db = await getDb();
  // `id` breaks the tie: two instalments recorded in the same millisecond would
  // otherwise come back in an arbitrary order, so the newest-first list could
  // reshuffle between renders.
  return db.getAllAsync<Payment>(
    "SELECT * FROM payments WHERE feeRecordId = ? ORDER BY createdAt DESC, id DESC;",
    feeRecordId
  );
}

/** Reverses a payment, restoring the invoice balance. */
export async function deletePayment(paymentId: string): Promise<void> {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    const payment = await txn.getFirstAsync<{ amount: number; feeRecordId: string }>(
      "SELECT amount, feeRecordId FROM payments WHERE id = ?;",
      paymentId
    );
    if (!payment) return;
    await txn.runAsync("DELETE FROM payments WHERE id = ?;", paymentId);
    await txn.runAsync(
      "UPDATE fee_records SET amountPaid = MAX(amountPaid - ?, 0), updatedAt = ? WHERE id = ?;",
      payment.amount, Date.now(), payment.feeRecordId
    );
  });
}

export interface FeeTotals {
  billed: number;
  collected: number;
  outstanding: number;
  paidCount: number;
  unpaidCount: number;
  partialCount: number;
}

export async function feeTotals(period: string | null = null): Promise<FeeTotals> {
  const db = await getDb();

  const clauses: string[] = [];
  const params: (string | number)[] = [];
  if (period) {
    clauses.push("f.period = ?");
    params.push(period);
  }
  const branch = branchClause("s.branchId");
  if (branch.sql) {
    clauses.push(branch.sql);
    params.push(...branch.params);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const row = await db.getFirstAsync<FeeTotals>(
    `SELECT COALESCE(SUM(f.total), 0) AS billed,
            COALESCE(SUM(f.amountPaid), 0) AS collected,
            COALESCE(SUM(f.total - f.amountPaid), 0) AS outstanding,
            COALESCE(SUM(${STATUS_SQL} = 'paid'), 0) AS paidCount,
            COALESCE(SUM(${STATUS_SQL} = 'unpaid'), 0) AS unpaidCount,
            COALESCE(SUM(${STATUS_SQL} = 'partial'), 0) AS partialCount
     FROM fee_records f
     JOIN students s ON s.id = f.studentId
     ${where};`,
    params
  );

  return (
    row ?? { billed: 0, collected: 0, outstanding: 0, paidCount: 0, unpaidCount: 0, partialCount: 0 }
  );
}

/**
 * Unsettled invoices whose due date falls on or before `throughDate`, newest
 * dues first. This is the source list for the fee-reminder message queue.
 */
export async function listDueForReminder(throughDate: string): Promise<FeeRecordWithInmate[]> {
  const db = await getDb();
  const reminderBranch = branchClause("s.branchId");
  return db.getAllAsync<FeeRecordWithInmate>(
    `${SELECT_WITH_STUDENT}
     WHERE f.amountPaid < f.total - 0.01
       AND f.dueDate <> ''
       AND f.dueDate <= ?
       AND s.status = 'active'
       ${reminderBranch.sql ? `AND ${reminderBranch.sql}` : ""}
     ORDER BY f.dueDate ASC, s.fullName COLLATE NOCASE;`,
    [throughDate, ...reminderBranch.params]
  );
}

/**
 * Every unsettled bill, overdue or not yet due, ordered by deadline.
 *
 * `listDueForReminder` deliberately stops at today because it drives the
 * reminder queue. Collection rounds need to look forward as well: an admin
 * doing the morning pass wants to know who is due tomorrow, not only who has
 * already slipped.
 */
export async function listAllDues(): Promise<FeeRecordWithInmate[]> {
  const db = await getDb();
  const branch = branchClause("s.branchId");
  return db.getAllAsync<FeeRecordWithInmate>(
    `${SELECT_WITH_STUDENT}
     WHERE f.amountPaid < f.total - 0.01
       AND s.status = 'active'
       ${branch.sql ? `AND ${branch.sql}` : ""}
     ORDER BY (f.dueDate = '') ASC, f.dueDate ASC, s.fullName COLLATE NOCASE;`,
    branch.params
  );
}

/** Buckets a collection round is actually organised around. */
export type DueBucket = "overdue" | "today" | "tomorrow" | "week" | "later";

export interface DueGroup {
  key: DueBucket;
  title: string;
  /** Plain-language subtitle, so the grouping needs no legend. */
  subtitle: string;
  fees: FeeRecordWithInmate[];
  total: number;
}

const BUCKET_META: Record<DueBucket, { title: string; subtitle: string }> = {
  overdue: { title: "Overdue", subtitle: "Past the due date and still unpaid" },
  today: { title: "Due today", subtitle: "Collect or remind them today" },
  tomorrow: { title: "Due tomorrow", subtitle: "Worth a heads-up now" },
  week: { title: "Due this week", subtitle: "Within the next 7 days" },
  later: { title: "Later", subtitle: "More than a week away" },
};

const BUCKET_ORDER: DueBucket[] = ["overdue", "today", "tomorrow", "week", "later"];

/**
 * Sorts unsettled bills into collection buckets.
 *
 * Split here rather than in the screen so the same grouping backs the dues
 * list, its counts and anything else that needs "who is due when" -- and so
 * it stays testable without a renderer.
 */
export function groupDues(fees: FeeRecordWithInmate[]): DueGroup[] {
  const buckets: Record<DueBucket, FeeRecordWithInmate[]> = {
    overdue: [],
    today: [],
    tomorrow: [],
    week: [],
    later: [],
  };

  for (const fee of fees) {
    // A bill with no deadline cannot be chased on a date; treat it as later
    // rather than silently dropping it from the round.
    const days = fee.dueDate ? daysUntil(fee.dueDate) : Number.POSITIVE_INFINITY;
    if (days < 0) buckets.overdue.push(fee);
    else if (days === 0) buckets.today.push(fee);
    else if (days === 1) buckets.tomorrow.push(fee);
    else if (days <= 7) buckets.week.push(fee);
    else buckets.later.push(fee);
  }

  return BUCKET_ORDER.filter((key) => buckets[key].length > 0).map((key) => ({
    key,
    title: BUCKET_META[key].title,
    subtitle: BUCKET_META[key].subtitle,
    fees: buckets[key],
    total: buckets[key].reduce((sum, fee) => sum + fee.balance, 0),
  }));
}

/** Convenience for the "this month" default across the Fees screens. */
export function currentPeriod(): string {
  return toPeriod();
}

/**
 * Legacy value for the `billingCycleDays` column, which no longer drives any
 * billing logic (see `dueDateFor` below) but still exists on old records and
 * backups. Kept only so writes to that column have something to write.
 */
export const DEFAULT_CYCLE_DAYS = 30;

/** The day-of-month a monthly bill is due, taken from when the student joined. */
export function anchorDayFor(joinedOn: string): number {
  const day = Number(joinedOn.slice(8, 10));
  return Number.isFinite(day) && day > 0 ? day : 1;
}

/**
 * Due date for a billing period: the same day-of-month the student joined on.
 *
 * A join date the admin already recognises makes a better deadline than a
 * separately configured cycle length -- someone who joined on the 1st is
 * always due on the 1st, someone who joined on the 15th is always due on the
 * 15th, with nothing to set up or get out of sync per student. Clamped to the
 * last day of a shorter month (join on the 31st, due on the 28th/30th in
 * February or a 30-day month).
 */
export function dueDateFor(period: string, anchorDay = 1): string {
  const [y, m] = period.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const day =
    Number.isFinite(anchorDay) && anchorDay > 0 ? Math.min(Math.round(anchorDay), daysInMonth) : 1;
  return toIsoDate(new Date(y, m - 1, day));
}

/**
 * Due date for a fixed-days stay: the day the stay began, plus its length.
 *
 * Unlike a recurring monthly bill, a stay bill isn't anchored to a calendar
 * month -- it is owed exactly `stayDays` after move-in, whichever month that
 * lands in.
 */
export function stayDueDateFor(joinedOn: string, stayDays: number): string {
  const [y, m, d] = joinedOn.split("-").map(Number);
  const days = Number.isFinite(stayDays) && stayDays > 0 ? Math.round(stayDays) : 1;
  const start = new Date(y, (m || 1) - 1, d || 1);
  start.setDate(start.getDate() + days);
  return toIsoDate(start);
}
