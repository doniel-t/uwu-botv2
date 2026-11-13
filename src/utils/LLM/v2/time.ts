/** Date helpers: everything user-facing is shown in BOT_TIMEZONE (default Europe/Berlin). */
export const TIMEZONE = process.env.BOT_TIMEZONE || "Europe/Berlin";

const DAY = 24 * 60 * 60 * 1000;

/** "2026-08-04" in the bot's timezone. */
export function fmtDate(ms: number): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

/** "2026-08-04 14:02" in the bot's timezone. */
export function fmtDateTime(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
  return `${fmtDate(ms)} ${parts}`;
}

/** "today", "yesterday", "5 days ago", "3 weeks ago", "4 months ago", "2 years ago". */
export function ago(ms: number, now = Date.now()): string {
  const days = Math.floor((now - ms) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  const years = Math.round(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

/** Offset of TIMEZONE from UTC at a given instant, in ms. */
function tzOffset(ms: number): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Midnight at the start of a calendar day in TIMEZONE. */
function zonedMidnight(y: number, m: number, d: number): number {
  const guess = Date.UTC(y, m - 1, d);
  return guess - tzOffset(guess - tzOffset(guess));
}

/**
 * Parse a tool/user date: "2026-08-04", "2026-08-04 14:30", ISO strings,
 * "today", "yesterday", "7d" (days ago). Date-only values mean the start of
 * that day, or the end of it when `endOfDay` is set.
 */
export function parseDateInput(input: string | undefined | null, endOfDay = false, now = Date.now()): number | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  if (s === "now") return now;
  const today = fmtDate(now).split("-").map(Number);
  const dayStart = (y: number, m: number, d: number) => zonedMidnight(y, m, d) + (endOfDay ? DAY - 1 : 0);
  if (s === "today") return dayStart(today[0], today[1], today[2]);
  if (s === "yesterday") {
    const y = fmtDate(now - DAY).split("-").map(Number);
    return dayStart(y[0], y[1], y[2]);
  }
  const rel = s.match(/^(\d{1,4})\s*d(ays?)?(\s*ago)?$/);
  if (rel) return now - Number(rel[1]) * DAY;
  const dateOnly = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [y, m, d] = [Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3])];
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return dayStart(y, m, d);
  }
  const dateTime = s.match(/^(\d{4})-(\d{2})-(\d{2})[ t](\d{2}):(\d{2})$/);
  if (dateTime) {
    const [y, m, d, hh, mm] = dateTime.slice(1).map(Number);
    return zonedMidnight(y, m, d) + (hh * 60 + mm) * 60 * 1000;
  }
  const iso = Date.parse(input);
  return Number.isNaN(iso) ? null : iso;
}
