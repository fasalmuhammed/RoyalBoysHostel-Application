import { FeeRecord, FeeRecordWithInmate, FeeStatus, Inmate, Payment, PaymentMethod } from "@/types";
import { newId } from "@/utils/id";
import { daysUntil, formatMoney, formatPeriod, toIsoDate, toPeriod } from "@/utils/format";
import { fresh, logActivity, patch, put, remove, runThrottled, withLock } from "@/store/cloud";
import {
  BillDoc,
  BillEntry,
  FeeYearDoc,
  allBills,
  allInmates,
  billById,
  billForPayment,
  billsForStudent,
  compareRaw,
  compareText,
  contains,
  feeDocId,
  inmateById,
  roomById,
  roomLabelOf,
  sumPayments,
} from "@/store/views";
import { inActiveBranch } from "./branches";
import { loadSettings } from "./settings";

export type FeeInput = Omit<FeeRecord, "id" | "createdAt" | "updatedAt" | "total" | "amountPaid">;

/**
 * Status is derived from `total` vs the payments recorded, never stored, so
 * it can never fall out of step with the money actually collected.
 *
 * The 0.01 tolerance absorbs floating-point drift from split payments (three
 * payments of 2000.00 against 6000.00 can land a hair under).
 */
function statusOf(bill: Pick<FeeRecord, "total" | "amountPaid">): FeeStatus {
  if (bill.amountPaid >= bill.total - 0.01) return "paid";
  if (bill.amountPaid > 0.009) return "partial";
  return "unpaid";
}

/** A bill joined with the inmate it belongs to. Bills whose inmate is gone are hidden. */
function withStudent(bill: BillEntry, inmate: Inmate): FeeRecordWithInmate {
  const { docId: _docId, payments: _payments, ...record } = bill;
  return {
    ...record,
    studentName: inmate.fullName,
    admissionNo: inmate.admissionNo,
    studentPhone: inmate.phone,
    photoFile: inmate.photoFile,
    admissionType: inmate.admissionType,
    roomLabel: roomLabelOf(roomById(inmate.roomId)),
    status: statusOf(bill),
    balance: bill.total - bill.amountPaid,
  };
}

/** Every bill with its inmate, optionally narrowed. */
function joined(include: (bill: BillEntry, inmate: Inmate) => boolean): FeeRecordWithInmate[] {
  const out: FeeRecordWithInmate[] = [];
  for (const bill of allBills()) {
    const inmate = inmateById(bill.studentId);
    if (inmate && include(bill, inmate)) out.push(withStudent(bill, inmate));
  }
  return out;
}

/** `ORDER BY period DESC, fullName COLLATE NOCASE`. */
const byPeriodThenName = (a: FeeRecordWithInmate, b: FeeRecordWithInmate) =>
  compareRaw(b.period, a.period) || compareText(a.studentName, b.studentName);

/** `"due"` combines unpaid + partial -- everything still owed, across any status split. */
export type FeeFilter = "all" | "due" | FeeStatus;

export async function listFees(
  filter: FeeFilter = "all",
  period: string | null = null,
  search = ""
): Promise<FeeRecordWithInmate[]> {
  const term = search.trim().toLowerCase();
  return joined((bill, inmate) => {
    // A bill has no branch of its own; it belongs to whichever branch the
    // inmate being billed belongs to.
    if (!inActiveBranch(inmate.branchId)) return false;
    if (period && bill.period !== period) return false;
    if (term && !contains(inmate.fullName, term) && !contains(inmate.admissionNo, term)) return false;
    const status = statusOf(bill);
    if (filter === "due") return status === "unpaid" || status === "partial";
    return filter === "all" || status === filter;
  }).sort(byPeriodThenName);
}

export async function getFee(id: string): Promise<FeeRecordWithInmate | null> {
  const bill = billById(id);
  const inmate = bill ? inmateById(bill.studentId) : null;
  return bill && inmate ? withStudent(bill, inmate) : null;
}

export async function listFeesForStudent(studentId: string): Promise<FeeRecordWithInmate[]> {
  const inmate = inmateById(studentId);
  if (!inmate) return [];
  return billsForStudent(studentId)
    .map((bill) => withStudent(bill, inmate))
    .sort((a, b) => compareRaw(b.period, a.period));
}

function sumTotal(input: Pick<FeeInput, "rent" | "electricity" | "water" | "other" | "discount">): number {
  return Math.max(input.rent + input.electricity + input.water + input.other - input.discount, 0);
}

/** Thrown when an invoice already exists for that inmate and month. */
export class DuplicateInvoiceError extends Error {}

function billLabel(studentId: string, period: string): string {
  return `${inmateById(studentId)?.fullName ?? "Inmate"} · ${formatPeriod(period)}`;
}

/**
 * Whose bills a year document holds, from its id (`<studentId>_<yyyy>`).
 * Written with every change, so a document the platform created empty when
 * it was first locked still ends up linked to its inmate.
 */
function ownerOf(docId: string): { studentId: string; year: string } {
  return { studentId: docId.slice(0, -5), year: docId.slice(-4) };
}

/** The server's copy of one inmate-year of bills, read inside its lock. */
async function readYear(docId: string): Promise<FeeYearDoc | null> {
  return fresh<FeeYearDoc>("fees", docId);
}

function findBill(doc: FeeYearDoc | null, billId: string): BillDoc | null {
  return Object.values(doc?.bills ?? {}).find((bill) => bill.id === billId) ?? null;
}

/** Adds a bill to its inmate-year, creating the year's document if needed. */
async function addBill(studentId: string, bill: BillDoc): Promise<void> {
  const docId = feeDocId(studentId, bill.period);
  const doc = await readYear(docId);
  if (doc?.bills?.[bill.period]) {
    throw new DuplicateInvoiceError("An invoice for this student and month already exists.");
  }
  if (doc) await patch("fees", docId, { ...ownerOf(docId), bills: { [bill.period]: bill } });
  else await put("fees", docId, { studentId, year: bill.period.slice(0, 4), bills: { [bill.period]: bill } });
}

/** Rewrites an inmate-year without one bill, or removes it when it was the last. */
async function writeWithout(docId: string, doc: FeeYearDoc, period: string): Promise<void> {
  const bills = { ...(doc.bills ?? {}) };
  delete bills[period];
  if (Object.keys(bills).length === 0) await remove("fees", docId);
  else await put("fees", docId, { ...doc, ...ownerOf(docId), bills });
}

export async function createFee(input: FeeInput): Promise<string> {
  const id = newId();
  const now = Date.now();
  const bill: BillDoc = {
    id,
    period: input.period,
    rent: input.rent,
    electricity: input.electricity,
    water: input.water,
    other: input.other,
    discount: input.discount,
    total: sumTotal(input),
    dueDate: input.dueDate,
    note: input.note,
    createdAt: now,
    updatedAt: now,
    payments: {},
  };
  await withLock("fees", feeDocId(input.studentId, input.period), () => addBill(input.studentId, bill));
  logActivity({
    action: "created",
    entity: "bill",
    entityId: id,
    label: billLabel(input.studentId, input.period),
    branchId: inmateById(input.studentId)?.branchId ?? null,
  });
  return id;
}

export async function updateFee(id: string, input: FeeInput): Promise<void> {
  const current = billById(id);
  if (!current) return;
  const changes = {
    rent: input.rent,
    electricity: input.electricity,
    water: input.water,
    other: input.other,
    discount: input.discount,
    total: sumTotal(input),
    dueDate: input.dueDate,
    note: input.note,
    updatedAt: Date.now(),
  };
  const sourceId = current.docId;

  if (input.period === current.period) {
    await withLock("fees", sourceId, async () => {
      const doc = await readYear(sourceId);
      const bill = findBill(doc, id);
      if (!doc || !bill) return;
      await patch("fees", sourceId, { ...ownerOf(sourceId), bills: { [bill.period]: changes } });
    });
  } else {
    // Moving a bill to another month: one bill per inmate per month still holds.
    const targetId = feeDocId(current.studentId, input.period);
    await withLock("fees", sourceId, async () => {
      const doc = await readYear(sourceId);
      const bill = findBill(doc, id);
      if (!doc || !bill) return;
      const moved: BillDoc = { ...bill, ...changes, period: input.period };
      if (targetId === sourceId) {
        if (doc.bills?.[input.period]) {
          throw new DuplicateInvoiceError("An invoice for this student and month already exists.");
        }
        const bills = { ...(doc.bills ?? {}) };
        delete bills[bill.period];
        bills[input.period] = moved;
        await put("fees", sourceId, { ...doc, ...ownerOf(sourceId), bills });
      } else {
        await withLock("fees", targetId, () => addBill(current.studentId, moved));
        await writeWithout(sourceId, doc, bill.period);
      }
    });
  }

  logActivity({
    action: "updated",
    entity: "bill",
    entityId: id,
    label: billLabel(current.studentId, input.period),
    branchId: inmateById(current.studentId)?.branchId ?? null,
  });
}

export async function deleteFee(id: string): Promise<void> {
  const current = billById(id);
  if (!current) return;
  await withLock("fees", current.docId, async () => {
    const doc = await readYear(current.docId);
    const bill = findBill(doc, id);
    if (!doc || !bill) return;
    await writeWithout(current.docId, doc, bill.period);
  });
  logActivity({
    action: "deleted",
    entity: "bill",
    entityId: id,
    label: billLabel(current.studentId, current.period),
    branchId: inmateById(current.studentId)?.branchId ?? null,
  });
}

export interface GenerateResult {
  created: number;
  skipped: number;
}

/**
 * Raises one invoice per active monthly inmate for `period`, pricing each at
 * their own rent (their room's rent only as a fallback for older records).
 *
 * Inmates who already have an invoice for that month are skipped, which makes
 * the whole operation safe to re-run -- the common case is running it again
 * after a few more inmates have been admitted mid-month -- and safe to run
 * from two devices at once.
 */
export async function generateInvoices(period: string): Promise<GenerateResult> {
  // Fixed-days stays are billed once at admission (see InmateFormScreen), never
  // swept into this recurring monthly batch -- so they don't count toward the
  // "active inmates this batch could bill" total either.
  const eligible = allInmates().filter(
    (inmate) => inmate.status === "active" && inmate.admissionType !== "stay" && inActiveBranch(inmate.branchId)
  );
  const billed = new Set(allBills().filter((bill) => bill.period === period).map((bill) => bill.studentId));
  const candidates = eligible.filter((inmate) => !billed.has(inmate.id));

  let created = 0;
  const now = Date.now();
  await runThrottled(candidates, async (inmate) => {
    const rent = inmate.monthlyRent > 0 ? inmate.monthlyRent : (roomById(inmate.roomId)?.rent ?? 0);
    const bill: BillDoc = {
      id: newId(),
      period,
      rent,
      electricity: 0,
      water: 0,
      other: 0,
      discount: 0,
      total: rent,
      dueDate: dueDateFor(period, anchorDayFor(inmate.joinedOn)),
      note: "",
      createdAt: now,
      updatedAt: now,
      payments: {},
    };
    try {
      await withLock("fees", feeDocId(inmate.id, period), () => addBill(inmate.id, bill));
      created += 1;
    } catch (error) {
      // Raised from another device in the meantime: already billed, not a failure.
      if (!(error instanceof DuplicateInvoiceError)) throw error;
    }
  });

  if (created > 0) {
    logActivity({
      action: "created",
      entity: "bill",
      entityId: period,
      label: `${created} bill${created === 1 ? "" : "s"} raised for ${formatPeriod(period)}`,
      branchId: eligible[0]?.branchId ?? null,
    });
  }

  return { created, skipped: eligible.length - created };
}

export class OverpaymentError extends Error {}

/**
 * Records a payment against a bill.
 *
 * Runs under the bill's lock against the server's current copy, so two people
 * collecting from the same inmate at once cannot together take more than is
 * owed. Overpayment is rejected rather than clamped: a wrong amount is far
 * more likely to be a typo than a genuine tip.
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

  const current = billById(feeRecordId);
  if (!current) throw new OverpaymentError("That invoice no longer exists.");

  await withLock("fees", current.docId, async () => {
    const doc = await readYear(current.docId);
    const bill = findBill(doc, feeRecordId);
    if (!bill) throw new OverpaymentError("That invoice no longer exists.");

    const balance = bill.total - sumPayments(bill.payments);
    if (amount > balance + 0.01) {
      throw new OverpaymentError(
        `That is more than the outstanding balance. At most ${balance.toFixed(2)} can be collected.`
      );
    }

    const paymentId = newId();
    const now = Date.now();
    await patch("fees", current.docId, {
      ...ownerOf(current.docId),
      bills: {
        [bill.period]: {
          updatedAt: now,
          payments: {
            [paymentId]: { id: paymentId, amount, method, paidOn, reference, note, createdAt: now },
          },
        },
      },
    });
  });

  logActivity({
    action: "payment",
    entity: "payment",
    entityId: feeRecordId,
    label: `${formatMoney(amount, (await loadSettings()).currencySymbol)} from ${billLabel(current.studentId, current.period)}`,
    branchId: inmateById(current.studentId)?.branchId ?? null,
  });
}

export async function listPayments(feeRecordId: string): Promise<Payment[]> {
  // `id` breaks the tie: two instalments recorded in the same millisecond would
  // otherwise come back in an arbitrary order, so the newest-first list could
  // reshuffle between renders.
  return [...(billById(feeRecordId)?.payments ?? [])].sort(
    (a, b) => b.createdAt - a.createdAt || compareRaw(b.id, a.id)
  );
}

/** Reverses a payment, restoring the invoice balance. */
export async function deletePayment(paymentId: string): Promise<void> {
  const current = billForPayment(paymentId);
  if (!current) return;
  const amount = current.payments.find((payment) => payment.id === paymentId)?.amount ?? 0;

  await withLock("fees", current.docId, async () => {
    const doc = await readYear(current.docId);
    const bill = findBill(doc, current.id);
    if (!doc || !bill || !bill.payments?.[paymentId]) return;
    const payments = { ...bill.payments };
    delete payments[paymentId];
    await put("fees", current.docId, {
      ...doc,
      ...ownerOf(current.docId),
      bills: { ...doc.bills, [bill.period]: { ...bill, payments, updatedAt: Date.now() } },
    });
  });

  logActivity({
    action: "reversed",
    entity: "payment",
    entityId: current.id,
    label: `${formatMoney(amount, (await loadSettings()).currencySymbol)} from ${billLabel(current.studentId, current.period)}`,
    branchId: inmateById(current.studentId)?.branchId ?? null,
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
  const totals: FeeTotals = { billed: 0, collected: 0, outstanding: 0, paidCount: 0, unpaidCount: 0, partialCount: 0 };
  for (const bill of joined((b, inmate) => (!period || b.period === period) && inActiveBranch(inmate.branchId))) {
    totals.billed += bill.total;
    totals.collected += bill.amountPaid;
    totals.outstanding += bill.total - bill.amountPaid;
    if (bill.status === "paid") totals.paidCount += 1;
    else if (bill.status === "unpaid") totals.unpaidCount += 1;
    else totals.partialCount += 1;
  }
  return totals;
}

/** `ORDER BY dueDate ASC, fullName COLLATE NOCASE`. */
const byDueThenName = (a: FeeRecordWithInmate, b: FeeRecordWithInmate) =>
  compareRaw(a.dueDate, b.dueDate) || compareText(a.studentName, b.studentName);

/**
 * Unsettled invoices whose due date falls on or before `throughDate`, oldest
 * dues first. This is the source list for the fee-reminder message queue.
 */
export async function listDueForReminder(throughDate: string): Promise<FeeRecordWithInmate[]> {
  return joined(
    (bill, inmate) =>
      bill.amountPaid < bill.total - 0.01 &&
      bill.dueDate !== "" &&
      bill.dueDate <= throughDate &&
      inmate.status === "active" &&
      inActiveBranch(inmate.branchId)
  ).sort(byDueThenName);
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
  return joined(
    (bill, inmate) =>
      bill.amountPaid < bill.total - 0.01 && inmate.status === "active" && inActiveBranch(inmate.branchId)
  ).sort((a, b) => Number(a.dueDate === "") - Number(b.dueDate === "") || byDueThenName(a, b));
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
 * Legacy value for the `billingCycleDays` field, which no longer drives any
 * billing logic (see `dueDateFor` below) but still exists on old records and
 * backups. Kept only so writes to that field have something to write.
 */
export const DEFAULT_CYCLE_DAYS = 30;

/** The day-of-month a monthly bill is due, taken from when the inmate joined. */
export function anchorDayFor(joinedOn: string): number {
  const day = Number(joinedOn.slice(8, 10));
  return Number.isFinite(day) && day > 0 ? day : 1;
}

/**
 * Due date for a billing period: the same day-of-month the inmate joined on.
 *
 * A join date the admin already recognises makes a better deadline than a
 * separately configured cycle length -- someone who joined on the 1st is
 * always due on the 1st, someone who joined on the 15th is always due on the
 * 15th, with nothing to set up or get out of sync per inmate. Clamped to the
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
