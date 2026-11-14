// Gifts: what is due soon, and who may see what.
// The server hides a present from the person it is for (private.gift_visible); the app applies the same rule so that
// a row never shows before the server has answered, and in the demo.
import { daysBetween } from "./domain";
import { store } from "./store";
import type { Birthday, Gift, GiftKind, GiftPerson, Occasion } from "./types";

export const OCCASION_LABEL: Record<Occasion, string> = { birthday: "Anniversaire", christmas: "Noël" };
export const AHEAD_DAYS = 60;
// At Christmas: the big present under the tree, and the small ones for the stocking
export const KIND_LABEL: Record<GiftKind, string> = { main: "Gros cadeau", stocking: "Bas de Noël" }; // how far ahead the gifts screen looks

export type Due = { key: string; occasion: Occasion; year: number; date: string; in: number; people: GiftPerson[] };

const pad = (n: number) => String(n).padStart(2, "0");
// The next time a month and day come round, today included (29 February falls on the 28th in other years)
export function nextDate(today: string, month: number, day: number): string {
  const at = (y: number) => {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return `${y}-${pad(month)}-${pad(month === 2 && day === 29 && !leap ? 28 : day)}`;
  };
  const y = Number(today.slice(0, 4));
  return at(y) >= today ? at(y) : at(y + 1);
}

// Birthdays and Christmas within the coming days, for the people we give presents to, soonest first
export function dueSoon(people: GiftPerson[], birthdays: Map<string, Birthday>, today: string, days = AHEAD_DAYS): Due[] {
  const out: Due[] = [];
  for (const p of people) {
    const b = p.for_birthday && p.birthday_id ? birthdays.get(p.birthday_id) : undefined;
    if (!b) continue;
    const date = nextDate(today, b.month, b.day), n = daysBetween(today, date);
    if (n <= days) out.push({ key: `birthday:${p.id}:${date.slice(0, 4)}`, occasion: "birthday", year: Number(date.slice(0, 4)), date, in: n, people: [p] });
  }
  const xmas = nextDate(today, 12, 25), n = daysBetween(today, xmas), forXmas = people.filter((p) => p.for_christmas);
  if (n <= days && forXmas.length) out.push({ key: `christmas:${xmas.slice(0, 4)}`, occasion: "christmas", year: Number(xmas.slice(0, 4)), date: xmas, in: n, people: forXmas });
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.occasion.localeCompare(b.occasion));
}

// A wish: written by the person it is for, about themselves. The others see it, and answer it with a copy they keep hidden.
export const isWish = (g: Gift, p: GiftPerson | undefined) => !!p?.member_id && g.created_by === p.member_id;

export function giftView(gifts: Gift[], people: GiftPerson[], me: string | null) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const visible = gifts.filter((g) => {
    const p = byId.get(g.person_id);
    return p && !p.deleted_at && !(p.member_id && p.member_id === me && g.created_by && g.created_by !== me);
  });
  const taken = new Set(visible.filter((g) => g.wish_id).map((g) => g.wish_id!));
  return {
    visible,
    // What is planned for one occasion
    planned: (person: string, occasion: Occasion, year: number) => visible.filter((g) => g.person_id === person && g.occasion === occasion && g.year === year)
      .sort((a, b) => Number(!!a.bought_at) - Number(!!b.bought_at) || a.title.localeCompare(b.title)),
    // Ideas not tied to a date yet (a wish someone already answered is no longer an open idea for the others)
    ideas: (person: string) => visible.filter((g) => g.person_id === person && !g.occasion && !g.bought_at && !(taken.has(g.id) && g.created_by !== me))
      .sort((a, b) => a.title.localeCompare(b.title)),
    history: (person: string) => visible.filter((g) => g.person_id === person && (g.occasion || g.bought_at))
      .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title)),
    isMine: (p: GiftPerson) => !!me && p.member_id === me,
  };
}

const blank = (person: string, title: string, me: string | null): Partial<Gift> =>
  ({ person_id: person, title, note: null, url: null, occasion: null, year: null, bought_at: null, bought_by: null, wish_id: null, created_by: me });

export function addGift(person: GiftPerson, title: string, me: string | null, occasion: Occasion | null = null, year: number | null = null, kind: GiftKind | null = null) {
  return store.put("gifts", { ...blank(person.id, title.trim(), me), occasion, year, kind });
}

// Keeps an idea for an occasion. Someone else's wish stays as they wrote it: the present is a hidden copy that points to it.
export function planIdea(idea: Gift, person: GiftPerson, me: string | null, occasion: Occasion | null, year: number | null, bought = false, kind: GiftKind | null = idea.kind ?? null) {
  const when = { ...(bought ? { bought_at: new Date().toISOString(), bought_by: me } : {}), kind: occasion === "christmas" ? kind ?? "main" : null };
  if (isWish(idea, person) && person.member_id !== me) {
    return store.put("gifts", { ...blank(person.id, idea.title, me), note: idea.note, url: idea.url, occasion, year, wish_id: idea.id, ...when });
  }
  return store.put("gifts", { ...idea, occasion, year, ...when });
}

export function toggleBought(g: Gift, person: GiftPerson, me: string | null) {
  if (g.bought_at) return store.put("gifts", { ...g, bought_at: null, bought_by: null });
  if (isWish(g, person) && person.member_id !== me) return planIdea(g, person, me, g.occasion, g.year, true);
  return store.put("gifts", { ...g, bought_at: new Date().toISOString(), bought_by: me });
}

export const dueLabel = (d: Due, name?: string) => (d.occasion === "christmas" ? "Noël" : `Anniversaire de ${name ?? d.people[0]?.name}`);
export const yearOptions = (today: string) => { const y = Number(today.slice(0, 4)); return [y, y + 1]; };
export const birthdayIn = (p: GiftPerson, birthdays: Map<string, Birthday>, today: string) => {
  const b = p.birthday_id ? birthdays.get(p.birthday_id) : undefined;
  return b ? nextDate(today, b.month, b.day) : null;
};
