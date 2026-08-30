import { Directory, File, Paths } from "expo-file-system";

import { getDb } from "@/db";
import { loadSettings } from "./settings";
import { branchClause, branchOrSharedClause, getActiveBranchId } from "./branches";

/**
 * CSV report export.
 *
 * This is deliberately *not* the backup mechanism. CSV is a flat, lossy format:
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

function writeCsv(fileName: string, contents: string): string {
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
  const db = await getDb();
  const settings = await loadSettings();

  const studentBranch = branchClause("s.branchId");
  const studentWhere = studentBranch.sql ? `WHERE ${studentBranch.sql}` : "";

  if (kind === "inmates") {
    const rows = await db.getAllAsync<Record<string, string | number | null>>(
      `SELECT s.admissionNo, s.fullName, s.phone, s.guardianName, s.guardianPhone, s.email,
              s.course, s.year, s.status, s.joinedOn, s.leftOn, s.address, s.idProof,
              b.shortName AS branch, b.code AS branchCode,
              CASE WHEN r.id IS NULL THEN '' WHEN r.block = '' THEN r.roomNumber
                   ELSE r.block || '-' || r.roomNumber END AS room
       FROM students s
       LEFT JOIN rooms r ON r.id = s.roomId
       LEFT JOIN branches b ON b.id = s.branchId
       ${studentWhere}
       ORDER BY s.fullName COLLATE NOCASE;`,
      studentBranch.params
    );
    const csv = toCsv(rows, [
      // Numbering restarts per branch, so the letter is what keeps an id
      // unambiguous in a sheet covering both hostels.
      { header: "ID", value: (r) => (r.branchCode ? `${r.branchCode}-${r.admissionNo}` : r.admissionNo) },
      { header: "Branch", value: (r) => r.branch },
      { header: "Name", value: (r) => r.fullName },
      { header: "Room", value: (r) => r.room },
      { header: "Phone", value: (r) => r.phone },
      { header: "Guardian", value: (r) => r.guardianName },
      { header: "Guardian Phone", value: (r) => r.guardianPhone },
      { header: "Email", value: (r) => r.email },
      { header: "Course", value: (r) => r.course },
      { header: "Year", value: (r) => r.year },
      { header: "Status", value: (r) => r.status },
      { header: "Joined On", value: (r) => r.joinedOn },
      { header: "Left On", value: (r) => r.leftOn },
      { header: "Address", value: (r) => r.address },
      { header: "ID Proof", value: (r) => r.idProof },
    ]);
    const fileName = `Inmates_${stamp()}.csv`;
    return { uri: writeCsv(fileName, csv), fileName, rowCount: rows.length };
  }

  if (kind === "rooms") {
    const roomBranch = branchClause("r.branchId");
    const rows = await db.getAllAsync<Record<string, string | number | null>>(
      `SELECT r.block, r.roomNumber, r.floor, r.capacity, r.rent, r.deposit, r.amenities,
              COALESCE(o.n, 0) AS occupied,
              MAX(r.capacity - COALESCE(o.n, 0), 0) AS vacant
       FROM rooms r
       LEFT JOIN (SELECT roomId, COUNT(*) AS n FROM students
                  WHERE status = 'active' AND roomId IS NOT NULL GROUP BY roomId) o
              ON o.roomId = r.id
       ${roomBranch.sql ? `WHERE ${roomBranch.sql}` : ""}
       ORDER BY r.block, CAST(r.roomNumber AS INTEGER);`,
      roomBranch.params
    );
    const csv = toCsv(rows, [
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
    const fileName = `Rooms_${stamp()}.csv`;
    return { uri: writeCsv(fileName, csv), fileName, rowCount: rows.length };
  }

  if (kind === "fees") {
    const clauses: string[] = [];
    const feeParams: (string | number)[] = [];
    if (period) {
      clauses.push("f.period = ?");
      feeParams.push(period);
    }
    if (studentBranch.sql) {
      clauses.push(studentBranch.sql);
      feeParams.push(...studentBranch.params);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = await db.getAllAsync<Record<string, string | number | null>>(
      `SELECT f.period, s.admissionNo, s.fullName, f.rent, f.electricity, f.water, f.other,
              f.discount, f.total, f.amountPaid, (f.total - f.amountPaid) AS balance, f.dueDate,
              CASE WHEN f.amountPaid >= f.total - 0.01 THEN 'paid'
                   WHEN f.amountPaid > 0.009 THEN 'partial' ELSE 'unpaid' END AS status,
              CASE WHEN r.id IS NULL THEN '' WHEN r.block = '' THEN r.roomNumber
                   ELSE r.block || '-' || r.roomNumber END AS room
       FROM fee_records f
       JOIN students s ON s.id = f.studentId
       LEFT JOIN rooms r ON r.id = s.roomId
       ${where}
       ORDER BY f.period DESC, s.fullName COLLATE NOCASE;`,
      feeParams
    );
    const csv = toCsv(rows, [
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
    ]);
    const fileName = period ? `Fees_${period}.csv` : `Fees_All_${stamp()}.csv`;
    return { uri: writeCsv(fileName, csv), fileName, rowCount: rows.length };
  }

  const rows = await db.getAllAsync<Record<string, string | number | null>>(
    `SELECT p.paidOn, s.admissionNo, s.fullName, f.period, p.amount, p.method, p.reference, p.note
     FROM payments p
     JOIN fee_records f ON f.id = p.feeRecordId
     JOIN students s ON s.id = p.studentId
     ${studentWhere}
     ORDER BY p.paidOn DESC, p.createdAt DESC;`,
    studentBranch.params
  );
  const csv = toCsv(rows, [
    { header: "Date", value: (r) => r.paidOn },
    { header: "Admission No", value: (r) => r.admissionNo },
    { header: "Name", value: (r) => r.fullName },
    { header: "For Month", value: (r) => r.period },
    { header: `Amount (${settings.currencySymbol})`, value: (r) => r.amount },
    { header: "Method", value: (r) => r.method },
    { header: "Reference", value: (r) => r.reference },
    { header: "Note", value: (r) => r.note },
  ]);
  const fileName = `Payments_${stamp()}.csv`;
  return { uri: writeCsv(fileName, csv), fileName, rowCount: rows.length };
}
