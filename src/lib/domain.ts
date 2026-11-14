// What the screens show, computed from the local tables. Pure functions.
import { addDays, daysBetween, fmtDay, instant, partsIn } from "@shared/time.ts";
import type { Birthday, CalEvent, Countdown, Dish, Meal, Member, Occurrence } from "./types";

export { addDays, daysBetween, fmtDay, partsIn, instant };

export const visibleEvent = (e: CalEvent) => e.kind !== "birthday" && e.status !== "cancelled";
// The local day(s) an event covers
export function eventDays(e: CalEvent, tz: string): { first: string; last: string } {
  if (e.all_day) return { first: e.start_date || partsIn(Date.parse(e.starts_at), tz).day, last: e.end_date || e.start_date || partsIn(Date.parse(e.starts_at), tz).day };
  const first = partsIn(Date.parse(e.starts_at), tz).day;
  const last = e.ends_at ? partsIn(Date.parse(e.ends_at) - 60_000, tz).day : first;
  return { first, last: last < first ? first : last };
}
export function eventsOn(events: CalEvent[], day: string, tz: string, withDeclined = false): CalEvent[] {
  return events.filter((e) => visibleEvent(e) && (withDeclined || e.status !== "declined"))
    .filter((e) => { const d = eventDays(e, tz); return d.first <= day && day <= d.last; })
    .sort((a, b) => Number(b.all_day) - Number(a.all_day) || a.starts_at.localeCompare(b.starts_at));
}
export const timeRange = (e: CalEvent, tz: string) => {
  if (e.all_day) return "Journée";
  const f = (iso: string) => { const [h, m] = partsIn(Date.parse(iso), tz).time.split(":"); return `${Number(h)} h${m === "00" ? "" : " " + m}`; };
  return `${f(e.starts_at)}${e.ends_at ? ` – ${f(e.ends_at)}` : ""}`;
};
export const startTime = (e: CalEvent, tz: string) => (e.all_day ? "" : timeRange({ ...e, ends_at: null }, tz));
// Children (or anyone who cannot go alone) concerned by an event nobody accompanies
export const uncared = (e: CalEvent, members: Member[]) =>
  e.caregiver_ids.length ? [] : members.filter((m) => m.needs_caregiver && e.participant_ids.includes(m.id));

// ---------- Meals ----------
export const mealName = (m: Meal, dishes: Map<string, Dish>) => m.label || (m.dish_id && dishes.get(m.dish_id)?.name) || "";
export const SLOT_LABEL: Record<string, string> = { breakfast: "Déjeuner", lunch: "Lunch", dinner: "Souper" };
export const KIND_LABEL: Record<string, string> = { home: "Maison", leftovers: "Restes", restaurant: "Resto", takeout: "À emporter", other: "Autre" };
export const KIND_ICON: Record<string, string | null> = { home: null, leftovers: "recycle", restaurant: "utensils", takeout: "shopping-bag", other: null };
export const mealsOn = (meals: Meal[], day: string, slot?: string) =>
  meals.filter((m) => m.date === day && (!slot || m.slot === slot)).sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
// Dishes cooked at home in the last days, most recent first (what lunches are often made of)
export function recentDishes(meals: Meal[], dishes: Map<string, Dish>, today: string, days = 10) {
  const seen = new Map<string, { name: string; dish_id: string | null; date: string }>();
  for (const m of [...meals].sort((a, b) => b.date.localeCompare(a.date))) {
    if (m.slot !== "dinner" || m.kind !== "home" || m.date > today || daysBetween(m.date, today) > days) continue;
    const name = mealName(m, dishes);
    if (name && !seen.has(name)) seen.set(name, { name, dish_id: m.dish_id, date: m.date });
  }
  return [...seen.values()];
}

// ---------- Chores ----------
// What is to do on a day: due that day or still open from before; plus what was done that day
export function occurrencesOn(occurrences: Occurrence[], day: string, tz: string, today: string): Occurrence[] {
  const order = { morning: 0, afternoon: 1, anytime: 2, evening: 3 } as Record<string, number>;
  return occurrences.filter((o) => {
    if (o.status === "skipped") return false;
    if (o.status === "done") return !!o.done_at && partsIn(Date.parse(o.done_at), tz).day === day;
    if (day < today) return false;
    if (day === today) return o.due_date <= day && (!o.due_until || o.due_until >= day);
    return o.due_date === day; // a future day shows what starts that day
  }).sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || order[a.time_of_day] - order[b.time_of_day] || a.title.localeCompare(b.title));
}
export const isLate = (o: Occurrence, today: string) => o.status === "todo" && o.due_date < today;

// ---------- Birthdays ----------
export type Upcoming = Birthday & { next: string; in: number; age: number | null };
export function upcomingBirthdays(birthdays: Birthday[], today: string): Upcoming[] {
  const y = Number(today.slice(0, 4));
  const dateIn = (year: number, m: number, d: number) => {
    const last = new Date(Date.UTC(year, m, 0)).getUTCDate(); // 29 February in a short year: the 28th
    return `${year}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
  };
  return birthdays.map((b) => {
    let next = dateIn(y, b.month, b.day);
    if (next < today) next = dateIn(y + 1, b.month, b.day);
    return { ...b, next, in: daysBetween(today, next), age: b.year ? Number(next.slice(0, 4)) - b.year : null };
  }).sort((a, b) => a.in - b.in || a.name.localeCompare(b.name));
}
export const birthdaysOn = (birthdays: Birthday[], day: string) => {
  const [, m, d] = day.split("-").map(Number);
  return birthdays.filter((b) => b.month === m && b.day === d);
};
export const BIRTHDAY_ICON: Record<string, string> = { birthday: "cake", anniversary: "heart", memorial: "flame" };

// ---------- Countdowns ----------
export function countdownsFrom(countdowns: Countdown[], today: string) {
  return countdowns.map((c) => {
    let d = c.target_date;
    if (c.yearly && d < today) { d = `${today.slice(0, 4)}${d.slice(4)}`; if (d < today) d = `${Number(today.slice(0, 4)) + 1}${d.slice(4)}`; }
    return { ...c, date: d, in: daysBetween(today, d) };
  }).filter((c) => c.in >= 0).sort((a, b) => a.in - b.in);
}

// ---------- Words ----------
export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const dayTitle = (day: string, today: string) => {
  const d = daysBetween(today, day);
  return d === 0 ? "Aujourd'hui" : d === 1 ? "Demain" : d === -1 ? "Hier" : cap(fmtDay(day, { weekday: "long", month: "long" }));
};
export const inDays = (n: number) => (n === 0 ? "aujourd'hui" : n === 1 ? "demain" : `dans ${n} jours`);
export const plural = (n: number, one: string, many = one + "s") => `${n} ${n > 1 ? many : one}`;
