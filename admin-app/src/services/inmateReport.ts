/**
 * An inmate's record as a PDF.
 *
 *  - "standard": who they are, how to reach them, where they stay and what
 *    they owe. For the manager and the admin.
 *  - "master": everything -- the above plus both sides of the Aadhaar card,
 *    every bill with its breakdown, and every payment. For the admin only.
 *
 * The page is written as HTML and turned into a PDF by the phone's own
 * printer (expo-print) or, in a browser, by the stand-in in src/web/shims.
 */
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import type { Payment } from "@/types";
import { getInmate, InmateWithRoom } from "./inmates";
import { listFeesForStudent, listPayments } from "./fees";
import { formatInmateId, getBranch } from "./branches";
import { readPhotoBase64 } from "./photos";
import { loadSettings } from "./settings";
import { formatDate, formatDateTime, formatMoney, formatPeriod } from "@/utils/format";

export type ReportKind = "standard" | "master";

const METHOD: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card", bank: "Bank transfer", cheque: "Cheque" };
const STATUS: Record<string, string> = { paid: "Paid", partial: "Part paid", unpaid: "Unpaid" };

const esc = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const or = (value: string | null | undefined) => (value && value.trim() ? esc(value) : "&mdash;");

const rows = (pairs: [string, string][]) =>
  `<table class="kv">${pairs.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join("")}</table>`;

const image = (base64: string | null, cls: string, missing: string) =>
  base64
    ? `<img class="${cls}" src="data:image/jpeg;base64,${base64}" />`
    : `<div class="${cls} missing">${esc(missing)}</div>`;

const CSS = `
  @page { size: A4; margin: 14mm }
  * { box-sizing: border-box }
  body { margin: 0; padding: 24px; font-family: Helvetica, Arial, sans-serif; font-size: 12px; color: #0F172A; line-height: 1.45 }
  .head { background: #0F1B45; color: #fff; padding: 16px 18px; border-radius: 10px }
  .head .hostel { font-size: 18px; font-weight: bold }
  .head .kind { font-size: 11px; color: #F0C97A; letter-spacing: 1px; margin-top: 2px }
  .head .made { font-size: 10px; color: #C9D2EA; margin-top: 6px }
  .who { margin-top: 16px; overflow: hidden }
  .who .photo { float: left; width: 96px; height: 96px; border-radius: 10px; object-fit: cover; border: 1px solid #E5E9F1 }
  .who .photo.missing { background: #F3F5FA; color: #97A1B4; font-size: 10px; text-align: center; padding-top: 40px }
  .who .text { margin-left: 112px }
  .who .name { font-size: 20px; font-weight: bold }
  .who .id { color: #5A6478; margin-top: 2px }
  .tag { display: inline-block; font-size: 10px; font-weight: bold; padding: 2px 8px; border-radius: 4px; margin: 6px 6px 0 0 }
  .tag.ok { background: #E3F7EF; color: #0E9F6E }
  .tag.off { background: #EEF1F6; color: #5A6478 }
  .tag.room { background: #EAF0FF; color: #2F55E8 }
  h2 { font-size: 12px; letter-spacing: .6px; color: #2F55E8; border-bottom: 1px solid #E5E9F1; padding-bottom: 4px; margin: 20px 0 8px }
  table { width: 100%; border-collapse: collapse }
  .kv th { width: 34%; text-align: left; font-weight: normal; color: #5A6478; padding: 4px 0; vertical-align: top }
  .kv td { padding: 4px 0; font-weight: bold }
  .list th { text-align: left; font-size: 10px; color: #5A6478; background: #F3F5FA; padding: 6px }
  .list td { padding: 6px; border-bottom: 1px solid #E5E9F1; vertical-align: top }
  .num { text-align: right; white-space: nowrap }
  .totals { margin-top: 8px; background: #F8FAFD; border: 1px solid #E5E9F1; border-radius: 8px; padding: 8px 12px }
  .totals td { padding: 3px 0 }
  .due { color: #DC2626 }
  .docs { overflow: hidden }
  .doc { width: 100%; margin-bottom: 12px; page-break-inside: avoid }
  .doc .cap { font-size: 10px; color: #5A6478; margin-bottom: 4px }
  .doc img { display: block; max-width: 100%; max-height: 330px; border: 1px solid #E5E9F1; border-radius: 8px }
  .doc .missing { width: 100%; border: 1px solid #E5E9F1; border-radius: 8px; background: #F8FAFD; height: 70px; color: #97A1B4; text-align: center; padding-top: 26px }
  .note { color: #5A6478; white-space: pre-wrap }
  .foot { margin-top: 22px; font-size: 9px; color: #97A1B4; text-align: center }
`;

interface ReportData {
  kind: ReportKind;
  inmate: InmateWithRoom;
  inmateId: string;
  hostel: string;
  symbol: string;
  madeBy: string;
  fees: Awaited<ReturnType<typeof listFeesForStudent>>;
  payments: Payment[];
  photo: string | null;
  idFront: string | null;
  idBack: string | null;
}

export function inmateReportHtml(data: ReportData): string {
  const { kind, inmate, fees, payments, symbol } = data;
  // The browser's PDF writer has no rupee sign in its built-in font; "Rs" prints everywhere.
  const shown = Platform.OS === "web" && symbol === "₹" ? "Rs " : symbol;
  const money = (amount: number) => esc(formatMoney(amount, shown));
  const billed = fees.reduce((sum, fee) => sum + fee.total, 0);
  const paid = fees.reduce((sum, fee) => sum + fee.amountPaid, 0);
  const outstanding = fees.reduce((sum, fee) => sum + Math.max(fee.balance, 0), 0);
  const stay = inmate.admissionType === "stay";
  const periodOf = new Map(fees.map((fee) => [fee.id, fee.period]));

  const personal = rows([
    ["Mobile", or(inmate.phone)],
    ["Email", or(inmate.email)],
    [inmate.institutionType === "company" ? "Company" : inmate.institutionType === "college" ? "College" : "College / company", or(inmate.institution)],
    ...(inmate.institutionType === "company"
      ? []
      : ([["Course", or([inmate.course, inmate.year].filter(Boolean).join(" · "))]] as [string, string][])),
    ["Blood group", or(inmate.bloodGroup)],
    ["Address", or(inmate.address)],
  ]);
  const family = rows([
    ["Guardian", or(inmate.guardianName)],
    ["Guardian mobile", or(inmate.guardianPhone)],
    ["Emergency contact", or(inmate.emergencyPhone)],
  ]);
  const hostel = rows([
    ["Hostel", esc(data.hostel)],
    ["Room", inmate.roomLabel ? `Room ${esc(inmate.roomLabel)}` : "Not allotted"],
    ["Admission", stay ? `Short stay${inmate.stayDays ? ` (${inmate.stayDays} days)` : ""}` : "Monthly"],
    [stay ? "Charge for the stay" : "Monthly rent", money(inmate.monthlyRent)],
    ["Joined on", esc(formatDate(inmate.joinedOn))],
    ...(inmate.leftOn ? ([["Left on", esc(formatDate(inmate.leftOn))]] as [string, string][]) : []),
  ]);
  const money3 = `<div class="totals"><table>
    <tr><td>Total billed</td><td class="num"><b>${money(billed)}</b></td></tr>
    <tr><td>Total paid</td><td class="num"><b>${money(paid)}</b></td></tr>
    <tr><td>Outstanding</td><td class="num ${outstanding > 0.01 ? "due" : ""}"><b>${money(outstanding)}</b></td></tr>
  </table></div>`;

  let master = "";
  if (kind === "master") {
    const billRows = fees
      .map(
        (fee) => `<tr>
          <td><b>${esc(formatPeriod(fee.period))}</b>${fee.note ? `<br><span class="note">${esc(fee.note)}</span>` : ""}${
            fee.promisedDate ? `<br><span class="note">Balance promised by ${esc(formatDate(fee.promisedDate))}</span>` : ""
          }</td>
          <td class="num">${money(fee.rent)}</td>
          <td class="num">${money(fee.electricity + fee.water + fee.other)}</td>
          <td class="num">${fee.discount ? `-${money(fee.discount)}` : "&mdash;"}</td>
          <td class="num"><b>${money(fee.total)}</b></td>
          <td class="num">${money(fee.amountPaid)}</td>
          <td class="num ${fee.balance > 0.01 ? "due" : ""}">${money(Math.max(fee.balance, 0))}</td>
          <td>${esc(formatDate(fee.dueDate))}</td>
          <td>${esc(STATUS[fee.status] ?? fee.status)}</td>
        </tr>`
      )
      .join("");
    const paymentRows = payments
      .map(
        (payment) => `<tr>
          <td>${esc(formatDate(payment.paidOn))}</td>
          <td>${esc(formatPeriod(periodOf.get(payment.feeRecordId) ?? ""))}</td>
          <td>${esc(METHOD[payment.method] ?? payment.method)}</td>
          <td>${or(payment.reference)}${payment.note ? `<br><span class="note">${esc(payment.note)}</span>` : ""}</td>
          <td class="num"><b>${money(payment.amount)}</b></td>
        </tr>`
      )
      .join("");

    master = `
      <h2>BILLS (${fees.length})</h2>
      ${
        fees.length
          ? `<table class="list"><tr><th>Month</th><th class="num">Rent</th><th class="num">Other charges</th><th class="num">Discount</th><th class="num">Total</th><th class="num">Paid</th><th class="num">Balance</th><th>Due</th><th>Status</th></tr>${billRows}</table>`
          : `<div class="note">No bills have been raised.</div>`
      }
      <h2>PAYMENTS (${payments.length})</h2>
      ${
        payments.length
          ? `<table class="list"><tr><th>Date</th><th>For</th><th>Method</th><th>Reference</th><th class="num">Amount</th></tr>${paymentRows}</table>`
          : `<div class="note">No payments have been recorded.</div>`
      }
      ${money3}
      <h2>RECORD</h2>
      ${rows([
        ["Added to the register", esc(formatDateTime(inmate.createdAt))],
        ["Rules and regulations", inmate.termsAcceptedAt ? `Accepted ${esc(formatDateTime(inmate.termsAcceptedAt))}` : "Not recorded"],
        ["Last changed", esc(formatDateTime(inmate.updatedAt))],
        ["Notes", inmate.notes ? `<span class="note">${esc(inmate.notes)}</span>` : "&mdash;"],
      ])}
      <h2>AADHAAR CARD</h2>
      <div class="docs">
        <div class="doc"><div class="cap">Front</div>${image(data.idFront, "", "Front side not added")}</div>
        <div class="doc"><div class="cap">Back</div>${image(data.idBack, "", "Back side not added")}</div>
      </div>`;
  }

  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
    <div class="head">
      <div class="hostel">${esc(data.hostel)}</div>
      <div class="kind">${kind === "master" ? "INMATE MASTER REPORT" : "INMATE REPORT"}</div>
      <div class="made">Prepared ${esc(formatDateTime(Date.now()))}${data.madeBy ? ` by ${esc(data.madeBy)}` : ""}</div>
    </div>
    <div class="who">
      ${image(data.photo, "photo", "No photo")}
      <div class="text">
        <div class="name">${esc(inmate.fullName)}</div>
        <div class="id">Inmate ID ${esc(data.inmateId)}</div>
        <span class="tag ${inmate.status === "active" ? "ok" : "off"}">${inmate.status === "active" ? "ACTIVE" : "LEFT"}</span>
        ${inmate.roomLabel ? `<span class="tag room">ROOM ${esc(inmate.roomLabel)}</span>` : ""}
      </div>
    </div>
    <h2>PERSONAL DETAILS</h2>${personal}
    <h2>FAMILY AND EMERGENCY</h2>${family}
    <h2>HOSTEL</h2>${hostel}
    ${kind === "standard" ? `<h2>FEES</h2>${money3}` : master}
    <div class="foot">${kind === "master" ? "Confidential. Contains identity documents. " : ""}${esc(data.hostel)}</div>
  </body></html>`;
}

/** Builds the report and hands it over as a PDF (download in a browser, share sheet on a phone). */
export async function shareInmateReport(studentId: string, kind: ReportKind, madeBy = ""): Promise<void> {
  const inmate = await getInmate(studentId);
  if (!inmate) throw new Error("This inmate could not be found.");
  const [fees, branch, settings] = await Promise.all([
    listFeesForStudent(studentId),
    getBranch(inmate.branchId),
    loadSettings(),
  ]);
  const master = kind === "master";
  const [photo, idFront, idBack, paymentLists] = await Promise.all([
    inmate.photoFile ? readPhotoBase64(inmate.photoFile) : null,
    master && inmate.idProofFile ? readPhotoBase64(inmate.idProofFile) : null,
    master && inmate.idProofBackFile ? readPhotoBase64(inmate.idProofBackFile) : null,
    master ? Promise.all(fees.map((fee) => listPayments(fee.id))) : Promise.resolve([] as Payment[][]),
  ]);
  const ordered = [...fees].sort((a, b) => a.period.localeCompare(b.period));
  const payments = paymentLists.flat().sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.createdAt - b.createdAt);

  const html = inmateReportHtml({
    kind,
    inmate,
    inmateId: formatInmateId(branch?.code, inmate.admissionNo),
    hostel: branch?.name ?? settings.hostelName,
    symbol: settings.currencySymbol,
    madeBy,
    fees: ordered,
    payments,
    photo,
    idFront,
    idBack,
  });

  const { uri } = await Print.printToFileAsync({ html });
  const title = `${inmate.fullName} - ${master ? "master report" : "report"}`;
  if (Platform.OS === "web") {
    // Browser only: gives the download a readable file name.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@/web/shims/sharing").registerDownloadName(uri, `${title}.pdf`);
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error("This device cannot save or share files.");
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: title, UTI: "com.adobe.pdf" });
}
