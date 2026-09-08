/**
 * Schedule date helpers — everything in Phoenix time.
 *
 * The planner thinks in "day keys" (YYYY-MM-DD in America/Phoenix). Arithmetic
 * on keys is done on UTC-midnight "civil" Dates so the browser's own timezone
 * never leaks in. Phoenix has no daylight saving, so `${key}T00:00:00-07:00`
 * is always the exact start of that day.
 */

export type DateKey = string; // "YYYY-MM-DD" in America/Phoenix
export const PHOENIX_TZ = "America/Phoenix";
export const PHOENIX_OFFSET = "-07:00";

const pad = (n: number) => String(n).padStart(2, "0");

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: PHOENIX_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** Phoenix wall-clock parts of an instant */
export function phoenixParts(d: Date): { y: number; m: number; d: number; hh: number; mm: number; ss: number } {
  const p: Record<string, string> = {};
  for (const part of partsFormatter.formatToParts(d)) p[part.type] = part.value;
  return {
    y: Number(p.year),
    m: Number(p.month),
    d: Number(p.day),
    hh: Number(p.hour) % 24, // some engines emit "24" at midnight
    mm: Number(p.minute),
    ss: Number(p.second),
  };
}

/** Instant → Phoenix calendar day key */
export function phoenixDateKey(d: Date): DateKey {
  const { y, m, d: dd } = phoenixParts(d);
  return `${y}-${pad(m)}-${pad(dd)}`;
}

/** Key → UTC-midnight civil Date (for arithmetic only, never shown as a time) */
export function keyToCivil(key: DateKey): Date {
  return new Date(`${key}T00:00:00Z`);
}

/** Civil Date → key */
export function civilToKey(d: Date): DateKey {
  return d.toISOString().slice(0, 10);
}

export function isDateKey(s: string | null | undefined): s is DateKey {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = keyToCivil(s);
  return !isNaN(d.getTime()) && civilToKey(d) === s;
}

export function todayKey(): DateKey {
  return phoenixDateKey(new Date());
}

export function addDays(key: DateKey, n: number): DateKey {
  const c = keyToCivil(key);
  c.setUTCDate(c.getUTCDate() + n);
  return civilToKey(c);
}

/** First day of the month n months away */
export function addMonths(key: DateKey, n: number): DateKey {
  const c = keyToCivil(key);
  return civilToKey(new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + n, 1)));
}

/** Monday on or before the key */
export function startOfWeekMonday(key: DateKey): DateKey {
  const offset = (keyToCivil(key).getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(key, -offset);
}

/** The 7 keys of the week starting on `monday` */
export function weekKeys(monday: DateKey): DateKey[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** 42 keys covering the month grid (Monday on/before the 1st, six rows) */
export function monthGridKeys(key: DateKey): DateKey[] {
  const first = `${key.slice(0, 7)}-01`;
  const start = startOfWeekMonday(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function isWeekend(key: DateKey): boolean {
  const day = keyToCivil(key).getUTCDay();
  return day === 0 || day === 6;
}

export function sameMonth(a: DateKey, b: DateKey): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** Phoenix instants bounding a run of days: start inclusive, end exclusive */
export function keyRangeToInstants(firstKey: DateKey, lastKey: DateKey): { start: Date; end: Date } {
  return {
    start: new Date(`${firstKey}T00:00:00${PHOENIX_OFFSET}`),
    end: new Date(`${addDays(lastKey, 1)}T00:00:00${PHOENIX_OFFSET}`),
  };
}

/** "8:30 AM" in Phoenix */
export function formatPhoenixTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: PHOENIX_TZ });
}

/** Display parts for a day key */
export function dayParts(key: DateKey): { weekday: string; dayNum: number; monthShort: string } {
  const c = keyToCivil(key);
  return {
    weekday: c.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    dayNum: c.getUTCDate(),
    monthShort: c.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
  };
}

/** "Sep 7 – 13, 2026" · "Sep 28 – Oct 4, 2026" · "Dec 29, 2025 – Jan 4, 2026" */
export function weekLabel(monday: DateKey): string {
  const a = keyToCivil(monday);
  const b = keyToCivil(addDays(monday, 6));
  const mon = (d: Date) => d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const ya = a.getUTCFullYear();
  const yb = b.getUTCFullYear();
  if (ya !== yb) return `${mon(a)} ${a.getUTCDate()}, ${ya} – ${mon(b)} ${b.getUTCDate()}, ${yb}`;
  if (a.getUTCMonth() !== b.getUTCMonth()) return `${mon(a)} ${a.getUTCDate()} – ${mon(b)} ${b.getUTCDate()}, ${yb}`;
  return `${mon(a)} ${a.getUTCDate()} – ${b.getUTCDate()}, ${yb}`;
}

/** "September 2026" */
export function monthLabel(key: DateKey): string {
  return keyToCivil(key).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
