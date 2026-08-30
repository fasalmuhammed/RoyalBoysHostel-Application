import { FeeRecordWithInmate, Payment } from "@/types";
import { formatDate, formatMoney, formatPeriod, toIsoDate } from "./format";

/**
 * Builds the printable receipt.
 *
 * Rendered to PDF by `expo-print`, entirely on-device — no template server and
 * nothing uploaded. Every interpolated value is HTML-escaped, since a student's
 * name or a payment note can legitimately contain `&`, `<` or quotes.
 */

function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface ReceiptInput {
  hostelName: string;
  currencySymbol: string;
  fee: FeeRecordWithInmate;
  payments: Payment[];
}

export function receiptHtml({ hostelName, currencySymbol, fee, payments }: ReceiptInput): string {
  const money = (amount: number) => escapeHtml(formatMoney(amount, currencySymbol));

  const lineItems: [string, number][] = [
    ["Room rent", fee.rent],
    ["Electricity", fee.electricity],
    ["Water", fee.water],
    ["Other charges", fee.other],
  ];

  const rows = lineItems
    .filter(([, amount]) => amount > 0)
    .map(
      ([label, amount]) =>
        `<tr><td>${escapeHtml(label)}</td><td class="right">${money(amount)}</td></tr>`
    )
    .join("");

  const discountRow =
    fee.discount > 0
      ? `<tr><td>Discount</td><td class="right">- ${money(fee.discount)}</td></tr>`
      : "";

  const paymentRows = payments
    .map(
      (payment) =>
        `<tr>
           <td>${escapeHtml(formatDate(payment.paidOn))}</td>
           <td>${escapeHtml(payment.method.toUpperCase())}</td>
           <td>${escapeHtml(payment.reference || "—")}</td>
           <td class="right">${money(payment.amount)}</td>
         </tr>`
    )
    .join("");

  const statusLabel =
    fee.status === "paid" ? "PAID IN FULL" : fee.status === "partial" ? "PARTIALLY PAID" : "UNPAID";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", Roboto, sans-serif; color: #10203A; padding: 28px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 3px solid #062962; padding-bottom: 14px; }
  .hostel { font-size: 21px; font-weight: 800; margin: 0; }
  .sub { color: #5D6B85; font-size: 12px; margin-top: 3px; }
  .title { font-size: 12px; letter-spacing: 1.5px; color: #123F86; font-weight: 700; }
  .status { display: inline-block; margin-top: 6px; padding: 4px 10px; border-radius: 999px;
            font-size: 11px; font-weight: 700;
            background: ${fee.status === "paid" ? "#E8F7EE" : fee.status === "partial" ? "#FBF2E0" : "#FDECEC"};
            color: ${fee.status === "paid" ? "#16A34A" : fee.status === "partial" ? "#B45309" : "#DC2626"}; }
  .grid { display: flex; gap: 32px; margin: 22px 0; }
  .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: #93A0B5; }
  .value { font-size: 14px; font-weight: 600; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px;
       color: #93A0B5; border-bottom: 1px solid #E4E8F0; padding: 7px 0; }
  td { padding: 7px 0; border-bottom: 1px solid #EEF1F6; }
  .right { text-align: right; }
  .total td { font-weight: 800; font-size: 15px; border-bottom: none; padding-top: 12px; }
  .balance { margin-top: 18px; background: #F5F6F9; border-radius: 10px; padding: 14px 16px;
             display: flex; justify-content: space-between; align-items: center; }
  .balance .amt { font-size: 20px; font-weight: 800;
                  color: ${fee.balance > 0 ? "#DC2626" : "#16A34A"}; }
  h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #5D6B85;
       margin: 26px 0 0; }
  .foot { margin-top: 32px; font-size: 10px; color: #93A0B5; text-align: center;
          border-top: 1px solid #E4E8F0; padding-top: 12px; }
</style>
</head>
<body>
  <div class="head">
    <div>
      <p class="hostel">${escapeHtml(hostelName)}</p>
      <p class="sub">Fee receipt for ${escapeHtml(formatPeriod(fee.period))}</p>
    </div>
    <div style="text-align:right">
      <div class="title">RECEIPT</div>
      <div class="status">${escapeHtml(statusLabel)}</div>
    </div>
  </div>

  <div class="grid">
    <div>
      <div class="label">Inmate</div>
      <div class="value">${escapeHtml(fee.studentName)}</div>
    </div>
    <div>
      <div class="label">Admission no</div>
      <div class="value">${escapeHtml(fee.admissionNo || "—")}</div>
    </div>
    <div>
      <div class="label">Room</div>
      <div class="value">${escapeHtml(fee.roomLabel || "—")}</div>
    </div>
    <div>
      <div class="label">Due date</div>
      <div class="value">${escapeHtml(formatDate(fee.dueDate))}</div>
    </div>
  </div>

  <h3>Charges</h3>
  <table>
    <thead><tr><th>Description</th><th class="right">Amount</th></tr></thead>
    <tbody>
      ${rows}
      ${discountRow}
      <tr class="total"><td>Total</td><td class="right">${money(fee.total)}</td></tr>
    </tbody>
  </table>

  ${
    payments.length > 0
      ? `<h3>Payments received</h3>
         <table>
           <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th class="right">Amount</th></tr></thead>
           <tbody>${paymentRows}</tbody>
         </table>`
      : ""
  }

  <div class="balance">
    <div>
      <div class="label">${fee.balance > 0 ? "Balance due" : "Balance"}</div>
      <div class="sub">Paid ${money(fee.amountPaid)} of ${money(fee.total)}</div>
    </div>
    <div class="amt">${money(Math.max(fee.balance, 0))}</div>
  </div>

  <div class="foot">
    Generated on ${escapeHtml(formatDate(toIsoDate()))} · This is a computer-generated receipt.
  </div>
</body>
</html>`;
}
