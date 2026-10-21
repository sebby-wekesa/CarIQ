/**
 * Kenyan phone numbers.
 *
 * Mobile numbers are nine digits after the country code and start with 7
 * (classic Safaricom/Airtel/Telkom ranges) or 1 (newer 010x/011x ranges).
 * We store and send everything in E.164: +2547XXXXXXXX / +2541XXXXXXXX.
 */

const KE_MOBILE = /^[17]\d{8}$/;

/**
 * Turns anything a Kenyan might type into E.164, or returns null.
 *
 * Accepts: 0712345678, 712345678, 254712345678, +254 712 345 678,
 * (0712) 345-678, 0110 123 456.
 */
export function normalizeKenyanPhone(input: string): string | null {
  if (typeof input !== "string") return null;
  const digits = input.replace(/[\s\-().]/g, "");
  if (!/^\+?\d+$/.test(digits)) return null;

  let national: string;
  if (digits.startsWith("+254")) national = digits.slice(4);
  else if (digits.startsWith("254")) national = digits.slice(3);
  else if (digits.startsWith("0")) national = digits.slice(1);
  else national = digits;

  return KE_MOBILE.test(national) ? `+254${national}` : null;
}

export function isKenyanPhone(input: string): boolean {
  return normalizeKenyanPhone(input) !== null;
}

/** +254712345678 → "+254 712 345 678" for display. */
export function formatKenyanPhone(e164: string): string {
  const normalized = normalizeKenyanPhone(e164);
  if (!normalized) return e164;
  const n = normalized.slice(4);
  return `+254 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
}

/** +254712345678 → "+254 7•• ••• 678" so listings never leak full numbers. */
export function maskKenyanPhone(e164: string): string {
  const normalized = normalizeKenyanPhone(e164);
  if (!normalized) return "••••";
  const n = normalized.slice(4);
  return `+254 ${n[0]}•• ••• ${n.slice(6)}`;
}
