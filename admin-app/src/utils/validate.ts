/** Field validation shared by the student and room forms. */

export type Errors<T> = Partial<Record<keyof T, string>>;

/** Strips everything but digits — WhatsApp links need a bare number. */
export function digitsOnly(value: string): string {
  return value.replace(/\D+/g, "");
}

/**
 * Normalises a phone number to international digits for `wa.me`.
 * Returns null when there aren't enough digits to be a real number.
 *
 * A number already carrying the country code is left alone; a bare national
 * number gets `countryCode` prepended.
 */
export function toWhatsAppNumber(phone: string, countryCode: string): string | null {
  const digits = digitsOnly(phone);
  if (digits.length < 6) return null;

  const cc = digitsOnly(countryCode);
  if (!cc) return digits;

  // Local formats often carry a trunk prefix (e.g. 0XXXXXXXXXX) — drop it.
  const national = digits.length > 10 && digits.startsWith("0") ? digits.slice(1) : digits;

  if (national.startsWith(cc) && national.length > cc.length + 5) return national;
  return `${cc}${national}`;
}

export function isValidEmail(value: string): boolean {
  if (!value.trim()) return true; // optional field
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function isValidPhone(value: string): boolean {
  const digits = digitsOnly(value);
  return digits.length >= 6 && digits.length <= 15;
}

/** Parses a money input, tolerating blanks, commas and stray spaces. */
export function parseAmount(value: string): number {
  const cleaned = value.replace(/[^0-9.\-]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function isPositiveInt(value: string): boolean {
  const n = Number(value);
  return Number.isInteger(n) && n > 0;
}
