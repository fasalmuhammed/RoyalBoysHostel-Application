import { getDb } from "@/db";
import { FeeRecord, FeeRecordWithStudent, FeeStatus, Payment, PaymentMethod } from "@/types";
import { newId } from "@/utils/id";
import { toIsoDate, toPeriod } from "@/utils/format";

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
         s.fullName    AS studentName,
         s.admissionNo AS admissionNo,
         s.phone       AS studentPhone,
         s.photoFile   AS photoFile,
         CASE WHEN r.id IS NULL THEN NULL
              WHEN r.block = '' THEN r.roomNumber
              ELSE r.block || '-' || r.roomNumber END AS roomLabel,
         ${STATUS_SQL} AS status,
         (f.total - f.amountPaid) AS balance
  FROM fee_records f
  JOIN students s ON s.id = f.studentId
  LEFT JOIN rooms r ON r.id = s.roomId
`;

export type FeeFilter = "all" | FeeStatus;

export async function listFees(
  filter: FeeFilter = "all",
  period: string | null = null,
  search = ""
): Promise<FeeRecordWithStudent[]> {
  const db = await getDb();

  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (period) {
    clauses.push("f.period = ?");
    params.push(period);
  }
  const term = search.trim().toLowerCase();
  if (term) {
    clauses.push("(LOWER(s.fullName) LIKE ? OR LOWER(s.admissionNo) LIKE ?)");
    params.push(`%${term}%`, `%${term}%`);
  }
  if (filter !== "all") {
    clauses.push(`${STATUS_SQL} = ?`);
    params.push(filter);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db.getAllAsync<FeeRecordWithStudent>(
    `${SELECT_WITH_STUDENT} ${where} ORDER BY f.period DESC, s.fullName COLLATE NOCASE;`,
    params
  );
}

export async function getFee(id: string): Promise<FeeRecordWithStudent | null> {
  const db = await getDb();
  return db.getFirstAsync<FeeRecordWithStudent>(`${SELECT_WITH_STUDENT} WHERE f.id = ?;`, id);
}

export async function listFeesForStudent(studentId: string): Promise<FeeRecordWithStudent[]> {
  const db = await getDb();
  return db.getAllAsync<FeeRecordWithStudent>(
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
export async function generateInvoices(
  period: string,
  dueDate: string,
  fallbackRent: number
): Promise<GenerateResult> {
  const db = await getDb();

  const candidates = await db.getAllAsync<{ id: string; rent: number | null }>(
    `SELECT s.id AS id, r.rent AS rent
     FROM students s
     LEFT JOIN rooms r ON r.id = s.roomId
     WHERE s.status = 'active'
       AND s.id NOT IN (SELECT studentId FROM fee_records WHERE period = ?);`,
    period
  );

  const total = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM students WHERE status = 'active';"
  );

  if (candidates.length > 0) {
    const now = Date.now();
    await db.withExclusiveTransactionAsync(async (txn) => {
      for (const row of candidates) {
        const rent = row.rent ?? fallbackRent;
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
  const where = period ? "WHERE f.period = ?" : "";
  const params = period ? [period] : [];

  const row = await db.getFirstAsync<FeeTotals>(
    `SELECT COALESCE(SUM(f.total), 0) AS billed,
            COALESCE(SUM(f.amountPaid), 0) AS collected,
            COALESCE(SUM(f.total - f.amountPaid), 0) AS outstanding,
            COALESCE(SUM(${STATUS_SQL} = 'paid'), 0) AS paidCount,
            COALESCE(SUM(${STATUS_SQL} = 'unpaid'), 0) AS unpaidCount,
            COALESCE(SUM(${STATUS_SQL} = 'partial'), 0) AS partialCount
     FROM fee_records f ${where};`,
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
export async function listDueForReminder(throughDate: string): Promise<FeeRecordWithStudent[]> {
  const db = await getDb();
  return db.getAllAsync<FeeRecordWithStudent>(
    `${SELECT_WITH_STUDENT}
     WHERE f.amountPaid < f.total - 0.01
       AND f.dueDate <> ''
       AND f.dueDate <= ?
       AND s.status = 'active'
     ORDER BY f.dueDate ASC, s.fullName COLLATE NOCASE;`,
    throughDate
  );
}

/** Convenience for the "this month" default across the Fees screens. */
export function currentPeriod(): string {
  return toPeriod();
}

/** Due date for a period, honouring the configured day-of-month. */
export function dueDateFor(period: string, dueDay: number): string {
  const [y, m] = period.split("-").map(Number);
  const day = Math.min(Math.max(dueDay, 1), 28);
  return toIsoDate(new Date(y, m - 1, day));
}
