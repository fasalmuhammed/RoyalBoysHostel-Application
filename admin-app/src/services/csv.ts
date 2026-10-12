import { Directory, File, Paths } from "expo-file-system";

import { loadSettings } from "./settings";
import { toXlsx } from "./xlsx";
import { inActiveBranch } from "./branches";
import {
  allBills,
  allInmates,
  allRooms,
  branchById,
  compareRaw,
  compareRooms,
  compareText,
  inmateById,
  occupancyByRoom,
  roomById,
  roomLabelOf,
} from "@/store/views";

/**
 * Report export, as Excel workbooks (see ./xlsx).
 *
 * This is deliberately *not* a backup. A spreadsheet is a flat, lossy format:
 * it cannot carry photos, and spreading six related tables across separate
 * sheets loses the links between them. Use it for what a spreadsheet is good
 * at -- printing a register, totalling a month's collection, handing a list to
 * the management -- and use `.hostelbak` for anything you intend to restore.
 */

/** Excel only auto-detects UTF-8 when the file opens with a byte-order mark. */
const BOM = "﻿";

/**
 * Quotes a value for CSV and neutralises formula injection.
 *
 * A student's note beginning `=` or `@` would otherwise be executed as a
 * formula when the file is opened in Excel, so a leading apostrophe is added.
 */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export interface Column<T> {
  header: string;
  value: (row: T) => unknown;
}

export function toCsv<T>(rows: T[], columns: Column<T>[]): string {
  const lines = [columns.map((c) => escapeCell(c.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCell(c.value(row))).join(","));
  }
  return BOM + lines.join("\r\n") + "\r\n";
}

function reportsDirectory(): Directory {
  const dir = new Directory(Paths.cache, "reports");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function writeBook(fileName: string, contents: Uint8Array): string {
  const file = new File(reportsDirectory(), fileName);
  if (file.exists) file.delete();
  file.create({ overwrite: true, intermediates: true });
  file.write(contents);
  return file.uri;
}

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type ReportKind = "inmates" | "rooms" | "fees" | "payments";

export interface ReportResult {
  uri: string;
  fileName: string;
  rowCount: number;
}

export async function exportReport(kind: ReportKind, period: string | null = null): Promise<ReportResult> {
  const settings = await loadSettings();

  if (kind === "inmates") {
    const rows = allInmates()
      .filter((inmate) => inActiveBranch(inmate.branchId))
      .sort((a, b) => compareText(a.fullName, b.fullName))
      .map((inmate) => {
        const branch = branchById(inmate.branchId);
        return {
          ...inmate,
          branch: branch ? branch.shortName : null,
          branchCode: branch ? branch.code : null,
          room: roomLabelOf(roomById(inmate.roomId)) ?? "",
        };
      });
    const book = toXlsx("Inmates", rows, [
      // Numbering restarts per branch, so the letter is what keeps an id
      // unambiguous in a sheet covering both hostels.
      { header: "ID", value: (r) => (r.branchCode ? `${r.branchCode}-${r.admissionNo}` : r.admissionNo) },
      { header: "Hostel", value: (r) => r.branch },
      { header: "Name", value: (r) => r.fullName },
      { header: "Room", value: (r) => r.room },
      { header: "Phone", value: (r) => r.phone },
      { header: "Guardian", value: (r) => r.guardianName },
      { header: "Guardian Phone", value: (r) => r.guardianPhone },
      { header: "Emergency Contact", value: (r) => r.emergencyPhone ?? "" },
      { header: "Email", value: (r) => r.email },
      { header: "College / Company", value: (r) => r.institution ?? "" },
      { header: "Course", value: (r) => r.course },
      { header: "Year", value: (r) => r.year },
      { header: "Status", value: (r) => r.status },
      { header: "Joined On", value: (r) => r.joinedOn },
      { header: "Left On", value: (r) => r.leftOn },
      { header: "Blood Group", value: (r) => r.bloodGroup ?? "" },
      { header: "Monthly Rent", value: (r) => r.monthlyRent },
      { header: "Address", value: (r) => r.address },
      { header: "Rules Accepted", value: (r) => (r.termsAcceptedAt ? "Yes" : "") },
      { header: "ID Proof", value: (r) => r.idProof },
    ]);
    const fileName = `Inmates_${stamp()}.xlsx`;
    return { uri: writeBook(fileName, book), fileName, rowCount: rows.length };
  }

  if (kind === "rooms") {
    const rows = allRooms()
      .filter((room) => inActiveBranch(room.branchId))
      .sort(compareRooms)
      .map((room) => {
        const occupied = occupancyByRoom().get(room.id) ?? 0;
        return { ...room, occupied, vacant: Math.max(room.capacity - occupied, 0) };
      });
    const book = toXlsx("Rooms", rows, [
      { header: "Block", value: (r) => r.block },
      { header: "Room", value: (r) => r.roomNumber },
      { header: "Floor", value: (r) => r.floor },
      { header: "Capacity", value: (r) => r.capacity },
      { header: "Occupied", value: (r) => r.occupied },
      { header: "Vacant", value: (r) => r.vacant },
      { header: "Rent", value: (r) => r.rent },
      { header: "Deposit", value: (r) => r.deposit },
      { header: "Amenities", value: (r) => r.amenities },
    ]);
    const fileName = `Rooms_${stamp()}.xlsx`;
    return { uri: writeBook(fileName, book), fileName, rowCount: rows.length };
  }

  // Bills and payments belong to the branch of the inmate they are for.
  const billRows = allBills()
    .map((bill) => ({ bill, inmate: inmateById(bill.studentId) }))
    .filter(
      (row): row is { bill: (typeof row)["bill"]; inmate: NonNullable<(typeof row)["inmate"]> } =>
        row.inmate !== null && inActiveBranch(row.inmate.branchId)
    );

  if (kind === "fees") {
    const rows = billRows
      .filter(({ bill }) => !period || bill.period === period)
      .sort((a, b) => compareRaw(b.bill.period, a.bill.period) || compareText(a.inmate.fullName, b.inmate.fullName))
      .map(({ bill, inmate }) => ({
        ...bill,
        admissionNo: inmate.admissionNo,
        fullName: inmate.fullName,
        balance: bill.total - bill.amountPaid,
        status: bill.amountPaid >= bill.total - 0.01 ? "paid" : bill.amountPaid > 0.009 ? "partial" : "unpaid",
        room: roomLabelOf(roomById(inmate.roomId)) ?? "",
      }));
    const book = toXlsx("Fees", rows, [
      { header: "Month", value: (r) => r.period },
      { header: "Admission No", value: (r) => r.admissionNo },
      { header: "Name", value: (r) => r.fullName },
      { header: "Room", value: (r) => r.room },
      { header: "Rent", value: (r) => r.rent },
      { header: "Electricity", value: (r) => r.electricity },
      { header: "Water", value: (r) => r.water },
      { header: "Other", value: (r) => r.other },
      { header: "Discount", value: (r) => r.discount },
      { header: "Total", value: (r) => r.total },
      { header: "Paid", value: (r) => r.amountPaid },
      { header: "Balance", value: (r) => r.balance },
      { header: "Status", value: (r) => r.status },
      { header: "Due Date", value: (r) => r.dueDate },
      { header: "Balance Promised By", value: (r) => r.promisedDate ?? "" },
    ]);
    const fileName = period ? `Fees_${period}.xlsx` : `Fees_All_${stamp()}.xlsx`;
    return { uri: writeBook(fileName, book), fileName, rowCount: rows.length };
  }

  const rows = billRows
    .flatMap(({ bill, inmate }) =>
      bill.payments.map((payment) => ({
        ...payment,
        admissionNo: inmate.admissionNo,
        fullName: inmate.fullName,
        period: bill.period,
      }))
    )
    .sort((a, b) => compareRaw(b.paidOn, a.paidOn) || b.createdAt - a.createdAt);
  const book = toXlsx("Payments", rows, [
    { header: "Date", value: (r) => r.paidOn },
    { header: "Admission No", value: (r) => r.admissionNo },
    { header: "Name", value: (r) => r.fullName },
    { header: "For Month", value: (r) => r.period },
    { header: `Amount (${settings.currencySymbol})`, value: (r) => r.amount },
    { header: "Method", value: (r) => r.method },
    { header: "Reference", value: (r) => r.reference },
    { header: "Note", value: (r) => r.note },
  ]);
  const fileName = `Payments_${stamp()}.xlsx`;
  return { uri: writeBook(fileName, book), fileName, rowCount: rows.length };
}
