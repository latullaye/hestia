// Dates and hours in the household's time zone. No dependency: runs in Deno (Edge Functions) and in Node (tests).
export const DEFAULT_TZ = "America/Toronto";
export const DAY_MS = 864e5;

export type Parts = { day: string; time: string; dow: number }; // dow: ISO weekday, 1 = Monday … 7 = Sunday

export function validTz(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TZ;
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return tz; } catch { return DEFAULT_TZ; }
}

// The wall clock of an instant in a time zone
// Building an Intl formatter is slow (far slower than using one), and the screens ask for the same instants again on
// every render (each event, for each day shown): formatters are made once per zone, and answers are remembered.
const formatters = new Map<string, Intl.DateTimeFormat>();
const answers = new Map<string, Parts>();
export function partsIn(t: number | Date, tz: string): Parts {
  const ms = typeof t === "number" ? t : t.getTime(), key = `${tz}|${ms}`;
  const known = answers.get(key);
  if (known) return known;
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
    });
    formatters.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday) + 1;
  const parts = { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, dow };
  if (answers.size > 20_000) answers.clear(); // a long-running kiosk must not grow without end
  answers.set(key, parts);
  return parts;
}

// The instant of a wall clock ("2026-11-14", "17:30") in a time zone
export function instant(day: string, time: string, tz: string): Date {
  const guess = Date.parse(`${day}T${time.length === 5 ? time + ":00" : time}Z`);
  const shift = (t: number) => {
    const p = partsIn(t, tz);
    return Date.parse(`${p.day}T${p.time}:00Z`) - t;
  };
  let t = guess - shift(guess);
  t = guess - shift(t); // second pass for the hours around a clock change
  return new Date(t);
}

export const addDays = (day: string, n: number) => new Date(Date.parse(day + "T12:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / DAY_MS);
export const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T12:00:00Z"));

// "sam. 14 nov."
const dayFormats = new Map<string, Intl.DateTimeFormat>();
export const fmtDay = (day: string, opts: Intl.DateTimeFormatOptions = {}) => {
  const key = JSON.stringify(opts);
  let f = dayFormats.get(key);
  if (!f) dayFormats.set(key, f = new Intl.DateTimeFormat("fr-CA", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", ...opts }));
  return f.format(new Date(day + "T12:00:00Z"));
};
// "17 h 30", "9 h"
export function fmtTime(t: number | Date | string, tz: string) {
  const [h, m] = (typeof t === "string" && /^\d\d:\d\d/.test(t) ? t : partsIn(new Date(t), tz).time).split(":");
  return `${Number(h)} h${m === "00" ? "" : " " + m}`;
}
// "aujourd'hui", "demain", "hier", else "sam. 14 nov."
export function relDay(today: string, day: string) {
  const d = daysBetween(today, day);
  return d === 0 ? "aujourd'hui" : d === 1 ? "demain" : d === -1 ? "hier" : fmtDay(day);
}

// "2026-11-14 17:30", "2026-11-14T17:30", "2026-11-14" or "17:30" (today) -> day and time ("" when there is no time)
export function parseWhen(s: string, today: string): { day: string; time: string } | null {
  const v = String(s || "").trim();
  let m = v.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s]+(\d{1,2})[:hH](\d{2}))?/);
  if (m && isDay(m[1])) return { day: m[1], time: m[2] ? `${m[2].padStart(2, "0")}:${m[3]}` : "" };
  m = v.match(/^(\d{1,2})[:hH](\d{2})$/);
  if (m) return { day: today, time: `${m[1].padStart(2, "0")}:${m[2]}` };
  return null;
}

// Accent- and case-insensitive key, the same as private.norm() in the database
export const norm = (s: unknown) => String(s ?? "").replace(/œ/gi, "oe").replace(/æ/gi, "ae").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
