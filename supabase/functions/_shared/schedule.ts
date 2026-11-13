// The rhythm of a chore (chores.schedule). The database decides which days count (private.chore_matches in
// supabase/migrations/…_chores.sql); this file is the same rule for the screens (preview of the next dates) and the words
// used to describe it. Keep both in step. No dependency: used by the Edge Functions and by the web app.
import { addDays } from "./time.ts";

export type Schedule =
  | { type: "daily"; every?: number; grace_days?: number }
  | { type: "weekly"; weekdays: number[]; every?: number; grace_days?: number } // ISO: 1 = Monday … 7 = Sunday
  | { type: "monthly"; days?: number[]; nth?: number; weekday?: number; every?: number; grace_days?: number } // days: -1 = last day
  | { type: "yearly"; months?: number[]; month?: number; day?: number; grace_days?: number }; // months: some time in the month

export const WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
export const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export const TIMES_OF_DAY: Record<string, string> = { morning: "le matin", afternoon: "l'après-midi", evening: "le soir", anytime: "" };

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} et ${xs[xs.length - 1]}`);
const ymd = (day: string) => day.split("-").map(Number) as [number, number, number];
const isoDow = (day: string) => ((new Date(day + "T12:00:00Z").getUTCDay() + 6) % 7) + 1;
const lastDom = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const monday = (day: string) => addDays(day, 1 - isoDow(day));
const mod = (a: number, b: number) => ((a % b) + b) % b;
const daysApart = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);

// "tous les soirs", "le mercredi", "le samedi (sinon le lendemain)", "en mai", "le 1er samedi du mois"…
export function describeSchedule(s: Schedule, timeOfDay = "anytime"): string {
  const when = TIMES_OF_DAY[timeOfDay] || "";
  const every = Math.max(1, ("every" in s && s.every) || 1);
  const grace = s.grace_days ? (s.grace_days === 1 ? " (sinon le lendemain)" : ` (ou dans les ${s.grace_days} jours suivants)`) : "";
  let text: string;
  switch (s.type) {
    case "daily":
      text = every === 1
        ? (timeOfDay === "morning" ? "tous les matins" : timeOfDay === "evening" ? "tous les soirs" : timeOfDay === "afternoon" ? "tous les après-midi" : "tous les jours")
        : `tous les ${every} jours${when ? " " + when : ""}`;
      return text + grace;
    case "weekly": {
      const days = [...(s.weekdays || [])].sort((a, b) => a - b).map((d) => WEEKDAYS[d - 1]).filter(Boolean);
      // "le mercredi soir", "le lundi matin"
      text = `le ${list(days)}${when ? " " + when.replace(/^le /, "").replace(/^l'/, "") : ""}`;
      if (every > 1) text += every === 2 ? ", une semaine sur deux" : `, toutes les ${every} semaines`;
      return text + grace;
    }
    case "monthly": {
      const per = every === 1 ? "du mois" : `, tous les ${every} mois`;
      if (s.nth != null && s.weekday != null) {
        const nth = s.nth === -1 ? "dernier" : s.nth === 1 ? "1er" : `${s.nth}e`;
        return `le ${nth} ${WEEKDAYS[s.weekday - 1]} ${per}`.replace(" ,", ",") + grace;
      }
      const days = (s.days || []).map((d) => (d === -1 ? "dernier jour" : d === 1 ? "1er" : String(d)));
      return `le ${list(days)} ${per}`.replace(" ,", ",") + grace;
    }
    case "yearly":
      if (s.day != null && s.month != null) return `le ${s.day === 1 ? "1er" : s.day} ${MONTHS[s.month - 1]}, chaque année` + grace;
      return `en ${list((s.months || []).map((m) => MONTHS[m - 1]))}, chaque année`;
  }
}

// Is this day one of the rule's days? (anchor: the rule's start date, for "every N")
export function matches(s: Schedule, anchor: string, day: string): boolean {
  const [y, m, d] = ymd(day), [ay, am] = ymd(anchor);
  const every = Math.max(1, ("every" in s && s.every) || 1);
  switch (s.type) {
    case "daily":
      return mod(daysApart(anchor, day), every) === 0;
    case "weekly":
      return (s.weekdays || []).includes(isoDow(day)) && mod(daysApart(monday(anchor), monday(day)) / 7, every) === 0;
    case "monthly": {
      if (mod((y - ay) * 12 + m - am, every) !== 0) return false;
      const last = lastDom(y, m);
      if (s.nth != null && s.weekday != null) {
        return isoDow(day) === s.weekday && ((s.nth > 0 && Math.floor((d - 1) / 7) + 1 === s.nth) || (s.nth === -1 && d + 7 > last));
      }
      return (s.days || []).includes(d) || (d === last && (s.days || []).includes(-1));
    }
    case "yearly":
      if (s.day != null) return m === s.month && d === s.day;
      return d === 1 && (s.months || []).includes(m);
  }
}

// Last day an occurrence of that day stays open
export function openUntil(s: Schedule, day: string): string {
  if (s.type === "yearly" && s.day == null) { const [y, m] = ymd(day); return `${day.slice(0, 8)}${String(lastDom(y, m)).padStart(2, "0")}`; }
  return addDays(day, s.grace_days || 0);
}

// The next n days of the rule, from a day on
export function nextDays(s: Schedule, anchor: string, from: string, n = 5, horizon = 800): string[] {
  const out: string[] = [];
  for (let i = 0, day = from; i < horizon && out.length < n; i++, day = addDays(day, 1)) if (matches(s, anchor, day)) out.push(day);
  return out;
}

// Says what is wrong with a rule, or null
export function scheduleError(s: Schedule | null | undefined): string | null {
  if (!s || typeof s !== "object") return "fréquence manquante";
  const int = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
  if ("every" in s && s.every != null && !int(s.every, 1, 52)) return "« tous les » doit être entre 1 et 52";
  if (s.grace_days != null && !int(s.grace_days, 0, 31)) return "le report doit être entre 0 et 31 jours";
  switch (s.type) {
    case "daily": return null;
    case "weekly": return s.weekdays?.length && s.weekdays.every((d) => int(d, 1, 7)) ? null : "choisis au moins un jour de la semaine (1 = lundi … 7 = dimanche)";
    case "monthly":
      if (s.nth != null || s.weekday != null) return (int(s.nth, 1, 4) || s.nth === -1) && int(s.weekday, 1, 7) ? null : "« nième » doit être 1 à 4 ou -1 (dernier), avec un jour de semaine";
      return s.days?.length && s.days.every((d) => int(d, 1, 31) || d === -1) ? null : "choisis au moins un jour du mois (1 à 31, -1 = dernier)";
    case "yearly":
      if (s.day != null || s.month != null) return int(s.month, 1, 12) && int(s.day, 1, 31) ? null : "mois (1 à 12) et jour (1 à 31) attendus";
      return s.months?.length && s.months.every((m) => int(m, 1, 12)) ? null : "choisis au moins un mois (1 à 12)";
    default: return "type de fréquence inconnu (daily, weekly, monthly, yearly)";
  }
}
