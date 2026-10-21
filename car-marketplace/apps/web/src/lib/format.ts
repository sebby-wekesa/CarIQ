/**
 * Dates shown to people are always in Kenyan time, whatever timezone the server runs in.
 * Accepts ISO timestamps and plain dates ("2026-10-19").
 */
const TZ = "Africa/Nairobi";

const day = new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
const dayTime = new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: TZ });
const monthYear = new Intl.DateTimeFormat("en-KE", { month: "long", year: "numeric", timeZone: TZ });

function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  // A bare date means that calendar day in Kenya, not midnight UTC.
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00+03:00`) : new Date(value);
}

export const formatDate = (value: string | Date) => day.format(toDate(value));
export const formatDateTime = (value: string | Date) => dayTime.format(toDate(value));
export const formatMonthYear = (value: string | Date) => monthYear.format(toDate(value));

const time = new Intl.DateTimeFormat("en-KE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
const dayKey = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ });

export const formatTime = (value: string | Date) => time.format(toDate(value));

/** "Today", "Yesterday" or "19 Oct 2026", in Kenyan time. */
export function dayLabel(value: string | Date, now: Date = new Date()): string {
  const key = dayKey.format(toDate(value));
  if (key === dayKey.format(now)) return "Today";
  if (key === dayKey.format(new Date(now.getTime() - 86_400_000))) return "Yesterday";
  return formatDate(value);
}

/** Inbox times: "14:05" today, "Yesterday", else "19 Oct". */
export function shortWhen(value: string | Date, now: Date = new Date()): string {
  const label = dayLabel(value, now);
  if (label === "Today") return formatTime(value);
  if (label === "Yesterday") return label;
  return new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", timeZone: TZ }).format(toDate(value));
}
