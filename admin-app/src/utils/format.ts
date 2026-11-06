/** Formatting helpers. All dates are handled as local-time ISO `yyyy-MM-dd`. */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** `yyyy-MM-dd` for a Date in *local* time (never UTC-shifted). */
export function toIsoDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "2026-08-14" -> "14-08-2026", the Indian order. Passes through anything else. */
export function toDisplayDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(iso ?? "");
  return m ? `${m[3].padStart(2, "0")}-${m[2].padStart(2, "0")}-${m[1]}` : (iso ?? "");
}

/** Billing period key `yyyy-MM`. */
export function toPeriod(date: Date = new Date()): string {
  return toIsoDate(date).slice(0, 7);
}

/** "2026-08" -> "August 2026". */
export function formatPeriod(period: string): string {
  const [y, m] = period.split("-");
  const index = Number(m) - 1;
  if (!y || Number.isNaN(index) || !MONTHS[index]) return period;
  return `${MONTHS[index]} ${y}`;
}

/** "2026-08-14" -> "14 Aug 2026". Passes through anything unparseable. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const index = Number(m) - 1;
  if (!y || !d || Number.isNaN(index) || !MONTHS[index]) return iso;
  return `${Number(d)} ${MONTHS[index].slice(0, 3)} ${y}`;
}

export function formatDateTime(epochMs: number | null | undefined): string {
  if (!epochMs) return "—";
  const d = new Date(epochMs);
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${formatDate(toIsoDate(d))}, ${time}`;
}

/** "3 days ago" / "in 5 days" against today, at day granularity. */
export function relativeDays(iso: string): string {
  const days = daysUntil(iso);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
}

/** Whole days from today to `iso`; negative when `iso` is in the past. */
export function daysUntil(iso: string): number {
  const target = startOfDay(parseIsoDate(iso));
  const today = startOfDay(new Date());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Parses `yyyy-MM-dd` as a *local* date (`new Date("...")` would use UTC). */
export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

/** Adds months to a `yyyy-MM` period key. */
export function shiftPeriod(period: string, months: number): string {
  const [y, m] = period.split("-").map(Number);
  const date = new Date(y, m - 1 + months, 1);
  return toPeriod(date);
}

/** Groups digits Indian-style (1,23,456) — matches the rupee amounts in the UI. */
export function formatMoney(amount: number, symbol = "₹"): string {
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  const negative = rounded < 0;
  const [whole, decimals] = Math.abs(rounded).toFixed(2).split(".");

  let grouped: string;
  if (whole.length <= 3) {
    grouped = whole;
  } else {
    const last3 = whole.slice(-3);
    const rest = whole.slice(0, -3);
    grouped = `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}`;
  }

  const body = decimals === "00" ? grouped : `${grouped}.${decimals}`;
  return `${negative ? "-" : ""}${symbol}${body}`;
}

/** First letters of the first and last word, for the avatar fallback. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
