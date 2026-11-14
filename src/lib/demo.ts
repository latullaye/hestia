// A fictional family for "?demo" (and "?demo=kiosk"): try the app or take screenshots without an account.
// Nothing here is real, and nothing is sent anywhere.
import { addDays, instant, partsIn } from "@shared/time.ts";
import type { Tables } from "./types";
import type { Weather } from "./weather";

const TZ = "America/Toronto";
let n = 0;
const id = (prefix: string) => `${prefix}-${String(++n).padStart(4, "0")}`;

export function demoTables(): Partial<{ [T in keyof Tables]: Tables[T][] }> {
  n = 0;
  const today = partsIn(Date.now(), TZ).day, d = (k: number) => addDays(today, k);
  const at = (k: number, time: string) => instant(d(k), time, TZ).toISOString();
  const [alex, sam, leo, kiosk] = ["m-alex", "m-sam", "m-leo", "m-kiosk"];
  const members: Tables["members"][] = [
    { id: alex, auth_user_id: "demo-adult", name: "Alex", role: "adult", needs_caregiver: false, color: "#2f6f73", emoji: null, aliases: [], birth_date: null, sort_order: 1, active: true },
    { id: sam, auth_user_id: null, name: "Sam", role: "adult", needs_caregiver: false, color: "#b9765a", emoji: null, aliases: [], birth_date: null, sort_order: 2, active: true },
    { id: leo, auth_user_id: null, name: "Léo", role: "child", needs_caregiver: true, color: "#b89a4e", emoji: null, aliases: [], birth_date: null, sort_order: 3, active: true },
    { id: kiosk, auth_user_id: "demo-kiosk", name: "Kiosque", role: "device", needs_caregiver: false, color: "#6b7a78", emoji: null, aliases: [], birth_date: null, sort_order: 9, active: true },
  ];
  const ev = (k: number, start: string, end: string, title: string, extra: Partial<Tables["events"]> = {}): Tables["events"] => ({
    id: id("e"), title, description: null, location: null, all_day: false, starts_at: at(k, start), ends_at: at(k, end), start_date: null, end_date: null,
    kind: "event", participant_ids: [], caregiver_ids: [], status: "confirmed", approver_ids: [], created_by: alex, ...extra,
  });
  const events = [
    ev(0, "11:00", "12:00", "Pilates", { participant_ids: [sam] }),
    ev(0, "17:00", "19:00", "5 à 7 avec les collègues", { participant_ids: [alex], status: "pending", approver_ids: [sam], location: "Brasserie du coin" }),
    ev(1, "09:45", "10:45", "Suivi 4 mois", { participant_ids: [leo], caregiver_ids: [sam], kind: "medical", location: "Clinique du Parc" }),
    ev(2, "10:00", "10:45", "Bébés nageurs", { participant_ids: [leo], caregiver_ids: [alex], kind: "activity", location: "Piscine municipale" }),
    ev(2, "19:00", "22:00", "Soirée jeux chez les voisins"),
    ev(3, "14:00", "15:00", "Yoga maman-bébé", { participant_ids: [sam, leo], caregiver_ids: [sam] }),
    ev(4, "09:00", "10:00", "Vaccins", { participant_ids: [leo], kind: "medical", location: "CLSC" }),
    ev(5, "18:00", "23:30", "Party de bureau", { participant_ids: [alex], status: "confirmed", approver_ids: [sam], approval_decided_by: sam, approval_decided_at: at(-1, "20:10"), approval_note: "Vas-y, je garde Léo." }),
    ev(8, "18:30", "21:30", "Souper entre amies", { participant_ids: [sam], created_by: sam, status: "pending", approver_ids: [alex], location: "Chez Camille" }),
    ev(10, "08:00", "17:00", "Tournoi de golf", { participant_ids: [alex], status: "declined", approver_ids: [sam], approval_decided_by: sam, approval_decided_at: at(-3, "12:30"), approval_note: "On reçoit mes parents ce jour-là." }),
    { ...ev(6, "00:00", "00:00", "Visite des grands-parents"), all_day: true, start_date: d(6), end_date: d(7), ends_at: at(8, "00:00") },
  ];
  const dishNames = ["Spaghetti carbonara", "Rouleaux de printemps", "Chili végé", "Poulet au beurre", "Saumon teriyaki", "Risotto aux champignons", "Tacos", "Soupe aux lentilles"];
  const dishes: Tables["dishes"][] = dishNames.map((name, i) => ({
    id: `d-${i}`, name, tags: i % 2 ? ["rapide"] : [], ingredients: i === 0 ? "- 400 g de spaghetti\n- 150 g de guanciale\n- 4 jaunes d'œufs\n- 80 g de pecorino\n- Poivre" : null,
    recipe: i === 0 ? "1. Cuire les pâtes al dente.\n2. Faire dorer le guanciale.\n3. Hors du feu, mélanger jaunes et pecorino avec un peu d'eau de cuisson.\n4. Poivrer généreusement." : null,
    source_url: null, note: null, favorite: i < 3, archived: false,
  }));
  const meal = (k: number, slot: "lunch" | "dinner", dish: number | string, extra: Partial<Tables["meal_plan"]> = {}): Tables["meal_plan"] => ({
    id: id("p"), date: d(k), slot, member_ids: [], dish_id: typeof dish === "number" ? `d-${dish}` : null, label: typeof dish === "string" ? dish : null,
    kind: "home", cook_ids: [], note: null, created_at: new Date().toISOString(), ...extra,
  });
  const meal_plan = [
    meal(-2, "dinner", 3, { cook_ids: [sam] }), meal(-1, "dinner", 2, { cook_ids: [alex] }),
    meal(0, "lunch", 2, { member_ids: [alex], kind: "leftovers" }), meal(0, "lunch", "Salade niçoise", { member_ids: [sam] }),
    meal(0, "dinner", 0, { cook_ids: [alex] }),
    meal(1, "lunch", 0, { kind: "leftovers" }), meal(1, "dinner", 1, { cook_ids: [alex, sam] }),
    meal(2, "dinner", "Chez Lola", { kind: "restaurant" }),
    meal(3, "dinner", 4, { cook_ids: [sam] }), meal(4, "dinner", 6, { cook_ids: [alex] }),
  ];
  const lists: Tables["shopping_lists"][] = [
    { id: "l-1", name: "Épicerie", emoji: "shopping-cart", sort_order: 1, show_on_kiosk: true }, { id: "l-2", name: "Costco", emoji: "store", sort_order: 2, show_on_kiosk: true },
    { id: "l-3", name: "Pharmacie", emoji: "pill", sort_order: 3, show_on_kiosk: true },
  ];
  const sectionNames: [string, string][] = [["Fruits & légumes", "salad"], ["Boulangerie", "croissant"], ["Viandes & poissons", "beef"], ["Produits laitiers & œufs", "milk"], ["Garde-manger", "wheat"], ["Produits congelés", "snowflake"], ["Ménage & hygiène", "spray-can"]];
  const sections: Tables["shopping_sections"][] = lists.slice(0, 2).flatMap((l) => sectionNames.map(([name, emoji], i) => ({ id: `${l.id}-s${i}`, list_id: l.id, name, emoji, sort_order: i + 1 })));
  const item = (list: string, section: number | null, name: string, needed = true, note: string | null = null): Tables["shopping_items"] =>
    ({ id: id("i"), list_id: list, section_id: section == null ? null : `${list}-s${section}`, name, note, needed, purchased_at: needed ? null : at(-6, "10:00"), sort_order: 0 });
  const shopping_items = [
    item("l-1", 0, "Bananes"), item("l-1", 0, "Avocats", true, "x3"), item("l-1", 0, "Coriandre"), item("l-1", 0, "Carottes", false), item("l-1", 0, "Épinards", false),
    item("l-1", 1, "Tortillas"), item("l-1", 2, "Guanciale"), item("l-1", 2, "Tofu", false), item("l-1", 3, "Œufs", true, "x12"), item("l-1", 3, "Pecorino"), item("l-1", 3, "Yogourt", false),
    item("l-1", 4, "Riz arborio"), item("l-1", 4, "Haricots rouges", false), item("l-1", 5, "Edamames"), item("l-1", 6, "Liquide vaisselle", false),
    item("l-2", 6, "Couches", true, "taille 2"), item("l-2", 6, "Essuie-tout"), item("l-2", 4, "Huile d'olive"), item("l-2", 3, "Parmesan", false),
    item("l-3", null, "Vitamine D"),
  ];
  const chore = (title: string, emoji: string, who: string[], schedule: Tables["chores"]["schedule"], time: Tables["chores"]["time_of_day"], extra: Partial<Tables["chores"]> = {}): Tables["chores"] =>
    ({ id: id("c"), title, emoji, description: null, assignee_ids: who, assignment: "fixed", schedule, time_of_day: time, start_date: d(-30), end_date: null, active: true, sort_order: 0, ...extra });
  const chores = [
    chore("Vider la litière", "cat", [alex], { type: "daily" }, "evening"),
    chore("Ranger la cuisine", "utensils", [alex], { type: "daily" }, "evening"),
    chore("Sortir les poubelles et le recyclage", "trash", [alex], { type: "weekly", weekdays: [3] }, "evening"),
    chore("Sortir le compost", "sprout", [alex], { type: "weekly", weekdays: [1] }, "morning"),
    chore("Nettoyer la salle de bain", "bath", [alex], { type: "weekly", weekdays: [6], grace_days: 1 }, "anytime"),
    chore("Lessive", "washing-machine", [alex, sam], { type: "weekly", weekdays: [2, 5] }, "anytime", { assignment: "rotate" }),
    chore("Laver les vitres", "window", [alex], { type: "yearly", months: [5] }, "anytime"),
  ];
  const occ = (c: Tables["chores"], k: number, status: "todo" | "done" = "todo", who = c.assignee_ids): Tables["chore_occurrences"] => ({
    id: id("o"), chore_id: c.id, title: c.title, emoji: c.emoji, due_date: d(k), due_until: d(k + (c.schedule.grace_days || 0)), time_of_day: c.time_of_day,
    assignee_ids: who, status, done_by: status === "done" ? who[0] : null, done_at: status === "done" ? at(k, "08:10") : null, note: null,
  });
  const dow = (k: number) => partsIn(Date.parse(at(k, "12:00")), TZ).dow;
  const chore_occurrences: Tables["chore_occurrences"][] = [];
  for (let k = 0; k < 8; k++) {
    chore_occurrences.push(occ(chores[0], k), occ(chores[1], k));
    if (dow(k) === 3) chore_occurrences.push(occ(chores[2], k));
    if (dow(k) === 1) chore_occurrences.push(occ(chores[3], k, k === 0 ? "done" : "todo"));
    if (dow(k) === 6) chore_occurrences.push(occ(chores[4], k));
    if (dow(k) === 2 || dow(k) === 5) chore_occurrences.push(occ(chores[5], k, "todo", [dow(k) === 2 ? alex : sam]));
  }
  chore_occurrences.push({ id: id("o"), chore_id: null, title: "Appeler le plombier", emoji: null, due_date: d(-1), due_until: null, time_of_day: "anytime", assignee_ids: [alex], status: "todo", done_by: null, done_at: null, note: null, created_by: sam });
  const bd = (k: number, name: string, year: number | null = null, kind: Tables["birthdays"]["kind"] = "birthday", extra: Partial<Tables["birthdays"]> = {}): Tables["birthdays"] => {
    const day = d(k);
    return { id: id("b"), name, month: Number(day.slice(5, 7)), day: Number(day.slice(8)), year, kind, note: null, gift_ideas: null, ...extra };
  };
  const birthdays = [
    bd(1, "Mamie Jo", 1950), bd(4, "Noah", 2021, "birthday", { gift_ideas: "Livre sur les dinosaures" }), bd(9, "Camille"), bd(16, "Oncle Marc", 1968), bd(40, "Léo", Number(today.slice(0, 4)) - 1),
    bd(75, "Mariage", 2019, "anniversary"), bd(120, "Alex", 1990), bd(200, "Sam", 1991), bd(150, "Papi Louis", 1945, "memorial"), bd(260, "Jade"), bd(300, "Inès", 2015),
  ];
  const year = Number(today.slice(0, 4));
  const countdowns: Tables["countdowns"][] = [
    { id: "cd-1", title: "Noël", emoji: "tree-pine", target_date: `${year}-12-25`, yearly: true, show_on_kiosk: true },
    { id: "cd-2", title: "Vacances", emoji: "umbrella", target_date: d(47), yearly: false, show_on_kiosk: true },
  ];
  const settings: Tables["settings"][] = [
    { id: "household", value: { name: "Hestia", timezone: TZ, locale: "fr-CA", weather: { label: "Montréal", latitude: 45.5019, longitude: -73.5674 } } },
    { id: "reminders", value: { morning: "07:30", evening: "20:00", event_minutes_before: 60 } },
  ];
  const notifications: Tables["notifications"][] = [
    { id: "n-1", member_id: alex, kind: "task_assigned", title: "Nouvelle tâche", body: "Sam : Appeler le plombier", url: "#/chores", data: {}, read_at: null, created_at: at(-1, "18:00") },
    { id: "n-2", member_id: alex, kind: "approval_decision", title: "Sam a approuvé", body: "Party de bureau\nVas-y, je garde Léo.", url: "#/inbox", data: {}, read_at: at(-1, "21:00"), created_at: at(-1, "20:10") },
  ];
  const event_comments: Tables["event_comments"][] = [{ id: "ec-1", event_id: events[1].id, author_id: sam, body: "Tu rentres pour le bain ?", created_at: at(0, "08:00") }];
  return { members, settings, events, event_comments, birthdays, countdowns, dishes, meal_plan, shopping_lists: lists, shopping_sections: sections, shopping_items, chores, chore_occurrences, notifications };
}

export function demoWeather(): Weather {
  const today = partsIn(Date.now(), TZ).day;
  const codes = [2, 61, 3, 71, 0, 1, 73, 2], max = [6, 4, 2, -1, -3, 1, 0, 3], min = [1, 0, -2, -6, -9, -5, -4, -2];
  return {
    at: Date.now(), current: { temperature: 4, feels: 1, code: 2, isDay: true },
    days: codes.map((code, i) => ({ date: addDays(today, i), code, max: max[i], min: min[i], rain: [20, 80, 30, 70, 5, 10, 60, 20][i], precipitation: 0, snow: code > 70 ? 3 : 0 })),
  };
}
