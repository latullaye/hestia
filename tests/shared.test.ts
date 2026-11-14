// Pure logic shared by the server and the app: dates, chore rhythms, Google Calendar title conventions.
import { describe, expect, it } from "vitest";
import { decodeBirthday, decodeTitle, encodeDescription, encodeTitle, sameName, stripFooter, type Person } from "../supabase/functions/_shared/calendar-codec.ts";
import { ICON_KEYS, iconKey } from "../supabase/functions/_shared/icons.ts";
import { describeSchedule, matches, nextDays, openUntil, scheduleError } from "../supabase/functions/_shared/schedule.ts";
import { addDays, daysBetween, fmtTime, instant, norm, parseWhen, partsIn } from "../supabase/functions/_shared/time.ts";

const people: Person[] = [
  { id: "a", name: "Alex", role: "adult", aliases: ["Lex"] }, { id: "s", name: "Sam", role: "adult" },
  { id: "b", name: "Léo", role: "child", needs_caregiver: true }, { id: "k", name: "Kiosque", role: "device" },
];

describe("time", () => {
  it("converts wall clock and instants, across clock changes", () => {
    expect(instant("2026-11-14", "17:30", "America/Toronto").toISOString()).toBe("2026-11-14T22:30:00.000Z");
    expect(instant("2026-07-01", "09:00", "America/Toronto").toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(instant("2026-11-01", "00:00", "America/Toronto").toISOString()).toBe("2026-11-01T04:00:00.000Z"); // the day clocks go back
    expect(partsIn(Date.parse("2026-11-14T03:10:00Z"), "America/Toronto")).toEqual({ day: "2026-11-13", time: "22:10", dow: 5 });
  });
  it("does day arithmetic and formatting", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(daysBetween("2026-11-14", "2026-12-25")).toBe(41);
    expect(fmtTime("09:00", "UTC")).toBe("9 h");
    expect(fmtTime("17:05", "UTC")).toBe("17 h 05");
    expect(parseWhen("2026-11-14 7:05", "2026-01-01")).toEqual({ day: "2026-11-14", time: "07:05" });
    expect(parseWhen("2026-11-14", "2026-01-01")).toEqual({ day: "2026-11-14", time: "" });
    expect(parseWhen("18h30", "2026-01-01")).toEqual({ day: "2026-01-01", time: "18:30" });
    expect(norm("  Œufs brouillés ")).toBe("oeufs brouilles");
  });
});

describe("chore rhythms", () => {
  it("describes them in French", () => {
    expect(describeSchedule({ type: "daily" }, "evening")).toBe("tous les soirs");
    expect(describeSchedule({ type: "weekly", weekdays: [3] }, "evening")).toBe("le mercredi soir");
    expect(describeSchedule({ type: "weekly", weekdays: [1] }, "morning")).toBe("le lundi matin");
    expect(describeSchedule({ type: "weekly", weekdays: [6], grace_days: 1 })).toBe("le samedi (sinon le lendemain)");
    expect(describeSchedule({ type: "weekly", weekdays: [2, 5], every: 2 })).toBe("le mardi et vendredi, une semaine sur deux");
    expect(describeSchedule({ type: "monthly", nth: 1, weekday: 6 })).toBe("le 1er samedi du mois");
    expect(describeSchedule({ type: "monthly", days: [1, 15] })).toBe("le 1er et 15 du mois");
    expect(describeSchedule({ type: "yearly", months: [5] })).toBe("en mai, chaque année");
    expect(describeSchedule({ type: "yearly", month: 11, day: 1 })).toBe("le 1er novembre, chaque année");
  });
  it("matches the same days as the database rule", () => {
    expect(matches({ type: "weekly", weekdays: [3] }, "2026-01-01", "2026-11-18")).toBe(true);
    expect(matches({ type: "weekly", weekdays: [1], every: 2 }, "2026-11-02", "2026-11-09")).toBe(false);
    expect(matches({ type: "weekly", weekdays: [1], every: 2 }, "2026-11-02", "2026-11-16")).toBe(true);
    expect(matches({ type: "monthly", nth: -1, weekday: 6 }, "2026-01-01", "2026-11-28")).toBe(true);
    expect(matches({ type: "monthly", days: [-1] }, "2026-01-01", "2026-02-28")).toBe(true);
    expect(matches({ type: "daily", every: 2 }, "2026-11-10", "2026-11-08")).toBe(true);
    expect(matches({ type: "yearly", months: [5] }, "2026-01-01", "2027-05-01")).toBe(true);
    expect(openUntil({ type: "yearly", months: [5] }, "2027-05-01")).toBe("2027-05-31");
    expect(openUntil({ type: "weekly", weekdays: [6], grace_days: 1 }, "2026-11-14")).toBe("2026-11-15");
    expect(nextDays({ type: "weekly", weekdays: [6] }, "2026-01-01", "2026-11-14", 2)).toEqual(["2026-11-14", "2026-11-21"]);
  });
  it("refuses incomplete rules", () => {
    expect(scheduleError({ type: "weekly", weekdays: [] })).toMatch(/jour de la semaine/);
    expect(scheduleError({ type: "yearly", months: [] })).toMatch(/mois/);
    expect(scheduleError({ type: "daily" })).toBeNull();
  });
});

describe("Google Calendar conventions", () => {
  it("reads who an event is about from its title", () => {
    expect(decodeTitle("Sam : Pilates postnatal", people)).toMatchObject({ title: "Pilates postnatal", participantIds: ["s"], pending: false });
    expect(decodeTitle("Alex & Sam : souper", people)).toMatchObject({ title: "souper", participantIds: ["a", "s"] });
    expect(decodeTitle("Suivi 4 mois (Léo)", people, "Clinique")).toMatchObject({ title: "Suivi 4 mois", participantIds: ["b"], kind: "medical" });
    expect(decodeTitle("Chiropractor Léo", people)).toMatchObject({ title: "Chiropractor Léo", participantIds: ["b"], kind: "medical" });
    expect(decodeTitle("Lex : dentiste", people)).toMatchObject({ participantIds: ["a"], kind: "medical" });
    expect(decodeTitle("Rappel : payer le loyer", people)).toMatchObject({ title: "Rappel : payer le loyer", participantIds: [] });
    expect(decodeTitle("⏳ Alex : 5 à 7", people)).toMatchObject({ title: "5 à 7", pending: true, participantIds: ["a"] });
  });
  it("writes titles and descriptions that read back the same", () => {
    const ev = { title: "5 à 7", status: "pending", participant_ids: ["a"], caregiver_ids: [], approver_ids: ["s"], description: "Au bar" };
    expect(encodeTitle(ev, people)).toBe("⏳ Alex : 5 à 7");
    expect(decodeTitle(encodeTitle(ev, people), people)).toMatchObject({ title: "5 à 7", pending: true, participantIds: ["a"] });
    expect(encodeTitle({ title: "Bébés nageurs", status: "confirmed", participant_ids: ["b"] }, people)).toBe("Bébés nageurs (Léo)");
    expect(encodeTitle({ title: "Souper", status: "confirmed", participant_ids: [] }, people)).toBe("Souper");
    expect(encodeTitle({ title: "Sortie Alex", status: "confirmed", participant_ids: ["a"] }, people)).toBe("Sortie Alex");
    const d = encodeDescription(ev, people);
    expect(d).toContain("En attente d'approbation (Sam)");
    expect(stripFooter(d)).toBe("Au bar");
    expect(encodeDescription({ ...ev, status: "confirmed", approver_ids: [], description: null, caregiver_ids: ["s"] }, people)).toContain("Accompagné par : Sam");
  });
  it("recognises birthdays", () => {
    expect(decodeBirthday("Anniversaire d'Inès 🎈")).toEqual({ name: "Inès", kind: "birthday" });
    expect(decodeBirthday("Anniversaire Noah Tremblay 🎈")).toEqual({ name: "Noah Tremblay", kind: "birthday" });
    expect(decodeBirthday("Anniversaire de mariage 🤍")).toEqual({ name: "Mariage", kind: "anniversary" });
    expect(decodeBirthday("Verres d'anniv")).toBeNull();
    expect(sameName("Noah", "Noah (Tremblay)")).toBe(true);
    expect(sameName("Noah Tremblay", "Noah Gagnon")).toBe(false);
  });
});

describe("icons", () => {
  it("understands names and the emoji of the first data, nothing else", () => {
    expect(iconKey("cat")).toBe("cat");
    expect(iconKey("🛒")).toBe("shopping-cart");
    expect(iconKey("🗑️")).toBe("trash"); // with its variation selector
    expect(iconKey("🦄")).toBeNull();
    expect(iconKey(null)).toBeNull();
    expect(new Set(ICON_KEYS).size).toBe(ICON_KEYS.length);
  });
});
