// The Google Calendar mirror, with a fake Google, against the throwaway database (npm run test:tools).
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeDb, type Db } from "../supabase/functions/_shared/db.ts";
import type { GEvent, GEventInput, Google } from "../supabase/functions/_shared/gcal.ts";
import { pull, pushDirty } from "../supabase/functions/_shared/gcal-sync.ts";
import { addDays, partsIn } from "../supabase/functions/_shared/time.ts";

const sql = postgres({ host: process.env.HESTIA_TEST_PG_HOST, port: Number(process.env.HESTIA_TEST_PG_PORT), database: "hestia", username: "postgres", prepare: false, onnotice: () => {} });
const tz = "America/Toronto", today = partsIn(Date.now(), tz).day;
let db: Db;

// A calendar in memory
class FakeGoogle implements Google {
  events = new Map<string, GEvent>();
  n = 0;
  put(ev: Partial<GEvent> & { id: string }) { this.events.set(ev.id, { status: "confirmed", ...ev, etag: `"${++this.n}"` }); }
  list = async () => [...this.events.values()];
  insert = async (ev: GEventInput) => { const id = `g${++this.n}`; this.put({ ...ev, id }); return this.events.get(id)!; };
  patch = async (id: string, ev: GEventInput) => { if (!this.events.has(id)) return null; this.put({ ...this.events.get(id), ...ev, id }); return this.events.get(id)!; };
  remove = async (id: string) => { this.events.delete(id); };
}
const g = new FakeGoogle();
const day = (n: number) => addDays(today, n);
const byGcal = (id: string) => db.one(`select * from public.events where gcal_event_id = $1`, [id]);
const member = async (name: string) => (await db.one(`select id from public.members where name = $1`, [name]))!.id as string;

beforeAll(async () => {
  db = makeDb(sql);
  // Start from a clean calendar on the Hestia side: nothing waiting to be pushed
  await db.exec(`update public.events set gcal_dirty = false, updated_via = 'gcal'`);
});
afterAll(() => sql.end());

describe("pull", () => {
  it("reads events with the household's title conventions", async () => {
    g.put({ id: "a1", summary: "Sam : Pilates", start: { dateTime: `${day(2)}T16:00:00Z` }, end: { dateTime: `${day(2)}T17:00:00Z` }, recurringEventId: "series1" });
    g.put({ id: "a2", summary: "Suivi 4 mois (Bébé)", location: "Clinique du Parc", start: { dateTime: `${day(3)}T14:00:00Z` }, end: { dateTime: `${day(3)}T15:00:00Z` } });
    g.put({ id: "a3", summary: "Souper chez les voisins", start: { date: day(4) }, end: { date: day(5) } });
    g.put({ id: "b1", summary: "Anniversaire de Léa 🎈", start: { date: day(6) }, end: { date: day(7) }, recurringEventId: "bseries" });
    const r = await pull(db, g, tz);
    expect(r).toMatchObject({ added: 3, birthdays: 1, errors: [] });
    const a1 = await byGcal("a1"), a2 = await byGcal("a2"), a3 = await byGcal("a3");
    expect(a1).toMatchObject({ title: "Pilates", participant_ids: [await member("Sam")], gcal_recurring: true, source: "gcal", gcal_dirty: false });
    expect(a2).toMatchObject({ title: "Suivi 4 mois", participant_ids: [await member("Bébé")], kind: "medical", caregiver_ids: [] });
    expect(a3).toMatchObject({ title: "Souper chez les voisins", all_day: true, start_date: day(4), end_date: day(4), participant_ids: [] });
    const b = await db.one(`select name, month, day, kind from public.birthdays where gcal_recurring_id = 'bseries'`);
    expect(b).toMatchObject({ name: "Léa", kind: "birthday", day: Number(day(6).slice(8)) });
    expect(await byGcal("b1")).toMatchObject({ kind: "birthday" });
  });
  it("is idempotent, follows changes, keeps what only Hestia knows", async () => {
    expect(await pull(db, g, tz)).toMatchObject({ added: 0, updated: 0, deleted: 0, birthdays: 0 });
    const a2 = await byGcal("a2");
    await db.exec(`update public.events set caregiver_ids = $2::text::uuid[], gcal_dirty = false, updated_via = 'gcal' where id = $1::uuid`, [a2!.id, `{${await member("Alex")}}`]);
    g.put({ ...g.events.get("a2")!, id: "a2", start: { dateTime: `${day(3)}T15:30:00Z` }, end: { dateTime: `${day(3)}T16:30:00Z` } });
    expect(await pull(db, g, tz)).toMatchObject({ updated: 1 });
    const moved = await byGcal("a2");
    expect(new Date(moved!.starts_at).toISOString()).toBe(`${day(3)}T15:30:00.000Z`);
    expect(moved!.caregiver_ids).toEqual([await member("Alex")]);
  });
  it("removes what left Google, and matches a birthday already known by name", async () => {
    g.events.delete("a3");
    expect(await pull(db, g, tz)).toMatchObject({ deleted: 1 });
    expect((await byGcal("a3"))!.deleted_at).not.toBeNull();
    const in9 = day(9);
    await db.exec(`insert into public.birthdays (name, month, day, year, updated_via) values ('Noah (Gagnon)', $1, $2, 2020, 'system')`, [Number(in9.slice(5, 7)), Number(in9.slice(8))]);
    g.put({ id: "b2", summary: "Anniversaire Noah", start: { date: in9 }, end: { date: addDays(in9, 1) }, recurringEventId: "noah" });
    expect(await pull(db, g, tz)).toMatchObject({ birthdays: 0 });
    expect(await db.one(`select count(*)::int as n, max(gcal_recurring_id) as s from public.birthdays where name like 'Noah%'`)).toMatchObject({ n: 1, s: "noah" });
  });
});

describe("push", () => {
  it("creates, marks pending, confirms, then removes", async () => {
    const alex = await member("Alex"), sam = await member("Sam");
    const [{ id }] = await db.exec(
      `insert into public.events (title, starts_at, ends_at, participant_ids, status, approver_ids, created_by, updated_by, updated_via)
       values ('5 à 7', $1::timestamptz, $2::timestamptz, $3::text::uuid[], 'pending', $4::text::uuid[], $5::uuid, $5::uuid, 'app') returning id`,
      [`${day(7)}T22:00:00Z`, `${day(8)}T00:00:00Z`, `{${alex}}`, `{${sam}}`, alex]);
    expect(await pushDirty(db, g, tz)).toMatchObject({ pushed: 1, errors: [] });
    const row = await db.one(`select gcal_event_id, gcal_dirty from public.events where id = $1::uuid`, [id]);
    expect(row!.gcal_dirty).toBe(false);
    let ev = g.events.get(row!.gcal_event_id)!;
    expect(ev.summary).toBe("⏳ Alex : 5 à 7");
    expect(ev.description).toContain("En attente d'approbation (Sam)");
    expect(ev.extendedProperties!.private!.hestia_id).toBe(id);
    // A pull right after changes nothing (same etag) and does not duplicate
    expect(await pull(db, g, tz)).toMatchObject({ added: 0, updated: 0 });

    await db.exec(`update public.events set status = 'confirmed', updated_by = $2::uuid, updated_via = 'app' where id = $1::uuid`, [id, sam]);
    expect(await pushDirty(db, g, tz, id)).toMatchObject({ pushed: 1 });
    ev = g.events.get(row!.gcal_event_id)!;
    expect(ev.summary).toBe("Alex : 5 à 7");
    expect(ev.description).toContain("✅ Confirmé");

    await db.exec(`update public.events set status = 'cancelled', updated_by = $2::uuid, updated_via = 'app' where id = $1::uuid`, [id, alex]);
    expect(await pushDirty(db, g, tz)).toMatchObject({ removed: 1 });
    expect(g.events.has(row!.gcal_event_id)).toBe(false);
  });
  it("never pushes an occurrence of a recurring Google event", async () => {
    const a1 = await byGcal("a1");
    await db.exec(`update public.events set participant_ids = '{}', updated_via = 'app' where id = $1::uuid`, [a1!.id]);
    expect((await byGcal("a1"))!.gcal_dirty).toBe(false);
  });
});
