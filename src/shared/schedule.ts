// Timezone-aware scheduling helpers. All times are stored as UTC milliseconds;
// users enter them as wall-clock times in the board's configured timezone.

import type { Schedule } from "./types";

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "short",
    });
    formatters.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

export function zonedParts(utcMs: number, tz: string): ZonedParts & { second: number } {
  const parts: Record<string, string> = {};
  for (const p of formatter(tz).formatToParts(new Date(utcMs))) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday],
  };
}

function offsetAt(utcMs: number, tz: string): number {
  const p = zonedParts(utcMs, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Converts a wall-clock time in `tz` to UTC ms. Nonexistent (DST-gap) times roll forward. */
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const o1 = offsetAt(guess, tz);
  const utc = guess - o1;
  const o2 = offsetAt(utc, tz);
  if (o1 === o2) return utc;
  const alt = guess - o2;
  // If neither candidate maps back to the requested wall time we're in a DST gap: roll forward.
  return offsetAt(alt, tz) === o2 ? alt : Math.max(utc, alt);
}

export function parseDate(date: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? { year: +m[1], month: +m[2], day: +m[3] } : null;
}

export function parseTime(time: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const hour = +m[1];
  const minute = +m[2];
  return hour < 24 && minute < 60 ? { hour, minute } : null;
}

export function localToUtc(date: string, time: string, tz: string): number | null {
  const d = parseDate(date);
  const t = parseTime(time);
  return d && t ? zonedToUtc(d.year, d.month, d.day, t.hour, t.minute, tz) : null;
}

export function utcToLocalDate(utcMs: number, tz: string): string {
  const p = zonedParts(utcMs, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function utcToLocalTime(utcMs: number, tz: string): string {
  const p = zonedParts(utcMs, tz);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** Minutes since local midnight. */
export function localMinutes(utcMs: number, tz: string): number {
  const p = zonedParts(utcMs, tz);
  return p.hour * 60 + p.minute;
}

/** True if `utcMs` falls in the quiet window [start, end), which may wrap past midnight. */
export function inQuietHours(utcMs: number, tz: string, start?: string | null, end?: string | null): boolean {
  const s = start ? parseTime(start) : null;
  const e = end ? parseTime(end) : null;
  if (!s || !e) return false;
  const now = localMinutes(utcMs, tz);
  const a = s.hour * 60 + s.minute;
  const b = e.hour * 60 + e.minute;
  if (a === b) return false;
  return a < b ? now >= a && now < b : now >= a || now < b;
}

/** The first time strictly after `afterMs` at which the schedule fires, or null if never again. */
export function nextRun(schedule: Schedule, afterMs: number, tz: string): number | null {
  if (schedule.type === "once") return schedule.at > afterMs ? schedule.at : null;

  const days = schedule.days.length ? schedule.days : [0, 1, 2, 3, 4, 5, 6];
  const times = schedule.times
    .map(parseTime)
    .filter((t): t is { hour: number; minute: number } => t !== null)
    .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
  if (times.length === 0) return null;

  const start = zonedParts(afterMs, tz);
  const until = schedule.until ? localToUtc(schedule.until, "23:59", tz) : null;
  // Walk forward day by day (in local calendar terms) for up to two weeks.
  for (let i = 0; i < 15; i++) {
    const noon = Date.UTC(start.year, start.month - 1, start.day + i, 12);
    const d = new Date(noon);
    const weekday = d.getUTCDay();
    if (!days.includes(weekday)) continue;
    for (const t of times) {
      const at = zonedToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), t.hour, t.minute, tz);
      if (at > afterMs) return until !== null && at > until ? null : at;
    }
  }
  return null;
}

/** All run times in (fromMs, toMs], capped at `limit`. */
export function runsBetween(schedule: Schedule, fromMs: number, toMs: number, tz: string, limit = 200): number[] {
  const out: number[] = [];
  let t = fromMs;
  while (out.length < limit) {
    const n = nextRun(schedule, t, tz);
    if (n === null || n > toMs) break;
    out.push(n);
    t = n;
  }
  return out;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatTime12(time: string): string {
  const t = parseTime(time);
  if (!t) return time;
  const h = t.hour % 12 || 12;
  return `${h}:${String(t.minute).padStart(2, "0")} ${t.hour < 12 ? "AM" : "PM"}`;
}

export function describeSchedule(schedule: Schedule): string {
  if (schedule.type === "once") return "One time";
  const days = [...schedule.days].sort();
  let dayText = "Every day";
  if (days.length > 0 && days.length < 7) {
    const key = days.join("");
    dayText = key === "12345" ? "Weekdays" : key === "06" ? "Weekends" : days.map((d) => DAY_NAMES[d]).join(", ");
  }
  const times = [...schedule.times].sort();
  const timeText = times.length > 3 ? `${times.length} times a day` : times.map(formatTime12).join(", ");
  return `${dayText} at ${timeText}`;
}
