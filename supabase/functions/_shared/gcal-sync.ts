// Keeps public.events and the Google "Family" calendar in step. Called by the gcal-sync function.
//   push: events changed in Hestia (gcal_dirty) are created, updated or removed in Google;
//   pull: the Google events of the window are read; new ones come in, changed ones are updated, missing ones are removed.
// Hestia wins on a row it has changed and not yet pushed; otherwise Google's version of the title, time and place is taken.
// What only Hestia knows (who is concerned, who accompanies, the approval) is never overwritten by a pull.
// Birthdays ("Anniversaire … 🎈", all-day) are recognised and shown through public.birthdays instead of as events.
import { type Person, decodeBirthday, decodeTitle, encodeDescription, encodeTitle, sameName, stripFooter } from "./calendar-codec.ts";
import { type Db, type Row, loadMembers, uuids } from "./db.ts";
import type { GEvent, GEventInput, Google } from "./gcal.ts";
import { addDays, instant, partsIn } from "./time.ts";

export type SyncReport = { pushed: number; removed: number; added: number; updated: number; deleted: number; birthdays: number; errors: string[] };
const PAST_DAYS = 45, FUTURE_DAYS = 400;

// A Hestia event as Google wants it
export function toGoogle(e: Row, people: Person[], tz: string): GEventInput {
  const timed = !e.all_day;
  return {
    summary: encodeTitle(e as { title: string; status: string; participant_ids: string[] }, people),
    description: encodeDescription(e as { description: string | null; status: string; caregiver_ids: string[]; approver_ids: string[] }, people),
    location: e.location || "",
    start: timed ? { dateTime: new Date(e.starts_at).toISOString(), timeZone: tz } : { date: e.start_date },
    end: timed ? { dateTime: new Date(e.ends_at || Date.parse(e.starts_at) + 3600e3).toISOString(), timeZone: tz } : { date: addDays(e.end_date || e.start_date, 1) },
    extendedProperties: { private: { hestia_id: e.id, hestia_status: e.status } },
  };
}

// The time columns of a Google event
function times(g: GEvent, tz: string) {
  if (g.start?.date) {
    const end = g.end?.date && g.end.date > g.start.date ? addDays(g.end.date, -1) : g.start.date;
    return { all_day: true, starts_at: instant(g.start.date, "00:00", tz).toISOString(), ends_at: instant(addDays(end, 1), "00:00", tz).toISOString(),
      start_date: g.start.date, end_date: end };
  }
  const start = new Date(g.start?.dateTime || 0), end = g.end?.dateTime ? new Date(g.end.dateTime) : null;
  return { all_day: false, starts_at: start.toISOString(), ends_at: end ? end.toISOString() : null, start_date: null, end_date: null };
}

export async function pushDirty(db: Db, google: Google, tz: string, onlyId?: string | null): Promise<Pick<SyncReport, "pushed" | "removed" | "errors">> {
  const people = await loadMembers(db);
  const rows = await db.all(
    `select id, title, description, location, all_day, starts_at, ends_at, start_date, end_date, kind, status, participant_ids, caregiver_ids,
       approver_ids, deleted_at, gcal_event_id
     from public.events where gcal_dirty and not gcal_recurring and ($1::uuid is null or id = $1::uuid) order by updated_at limit 200`, [onlyId ?? null]);
  const report = { pushed: 0, removed: 0, errors: [] as string[] };
  for (const e of rows) {
    try {
      const gone = e.deleted_at || e.status === "declined" || e.status === "cancelled" || e.kind === "birthday";
      if (gone) {
        if (e.gcal_event_id) { await google.remove(e.gcal_event_id); report.removed++; }
        await db.exec(`update public.events set gcal_dirty = false, gcal_event_id = null, gcal_etag = null, gcal_synced_at = now(), updated_via = 'gcal' where id = $1::uuid`, [e.id]);
        continue;
      }
      const body = toGoogle(e, people, tz);
      const saved = (e.gcal_event_id && await google.patch(e.gcal_event_id, body)) || await google.insert(body);
      await db.exec(`update public.events set gcal_dirty = false, gcal_event_id = $2, gcal_etag = $3, gcal_synced_at = now(), updated_via = 'gcal' where id = $1::uuid`,
        [e.id, saved.id, saved.etag ?? null]);
      report.pushed++;
    } catch (err) {
      report.errors.push(`push ${e.id}: ${(err as Error).message}`.slice(0, 300));
    }
  }
  return report;
}

export async function pull(db: Db, google: Google, tz: string, now = Date.now()): Promise<Omit<SyncReport, "pushed" | "removed">> {
  const report = { added: 0, updated: 0, deleted: 0, birthdays: 0, errors: [] as string[] };
  const people = await loadMembers(db);
  const today = partsIn(now, tz).day;
  const timeMin = instant(addDays(today, -PAST_DAYS), "00:00", tz).toISOString(), timeMax = instant(addDays(today, FUTURE_DAYS), "00:00", tz).toISOString();
  const items = (await google.list(timeMin, timeMax)).filter((g) => g.status !== "cancelled" && (g.start?.date || g.start?.dateTime));

  const known = new Map<string, Row>();
  for (const r of await db.all(`select id, gcal_event_id, gcal_etag, gcal_dirty, deleted_at, participant_ids, kind from public.events where gcal_event_id is not null`)) known.set(r.gcal_event_id, r);
  const birthdays = await db.all(`select id, name, month, day, gcal_recurring_id from public.birthdays where deleted_at is null`);
  const seen = new Set<string>();

  for (const g of items) {
    try {
      seen.add(g.id);
      const row = known.get(g.id);
      const t = times(g, tz);
      if (row) {
        if (row.gcal_dirty || row.deleted_at || row.gcal_etag === g.etag) continue; // ours to push, removed here, or unchanged
        if (row.kind === "birthday") {
          await db.exec(`update public.events set starts_at = $2::timestamptz, ends_at = $3::timestamptz, start_date = $4::date, end_date = $5::date, gcal_etag = $6,
            gcal_synced_at = now(), updated_by = null, updated_via = 'gcal' where id = $1::uuid`, [row.id, t.starts_at, t.ends_at, t.start_date, t.end_date, g.etag ?? null]);
          continue;
        }
        const d = decodeTitle(g.summary || "", people, g.location || "");
        await db.exec(
          `update public.events set title = $2, description = $3, location = $4, all_day = $5, starts_at = $6::timestamptz, ends_at = $7::timestamptz,
             start_date = $8::date, end_date = $9::date, gcal_etag = $10, gcal_synced_at = now(),
             participant_ids = case when cardinality(participant_ids) = 0 then $11::text::uuid[] else participant_ids end,
             updated_by = null, updated_via = 'gcal'
           where id = $1::uuid`,
          [row.id, d.title, stripFooter(g.description) || null, g.location || null, t.all_day, t.starts_at, t.ends_at, t.start_date, t.end_date, g.etag ?? null, uuids(d.participantIds)]);
        report.updated++;
        continue;
      }
      // Made by Hestia but its Google id was never written down (a crash between the two): tie them
      const hestiaId = g.extendedProperties?.private?.hestia_id;
      if (hestiaId) {
        const linked = await db.exec(`update public.events set gcal_event_id = $2, gcal_etag = $3, gcal_synced_at = now(), updated_via = 'gcal'
          where id = $1::uuid and gcal_event_id is null returning id`, [hestiaId, g.id, g.etag ?? null]);
        if (linked.length) continue;
      }
      // A birthday: its own table, the event stays hidden
      const b = t.all_day ? decodeBirthday(g.summary || "") : null;
      if (b) {
        const [, m, d] = t.start_date!.split("-").map(Number);
        const series = g.recurringEventId || g.id;
        let hit = birthdays.find((x) => x.gcal_recurring_id === series) || birthdays.find((x) => x.month === m && x.day === d && sameName(x.name, b.name));
        if (!hit) {
          const [created] = await db.exec(`insert into public.birthdays (name, month, day, kind, gcal_recurring_id, updated_via) values ($1, $2, $3, $4, $5, 'gcal') returning id`,
            [b.name, m, d, b.kind, series]);
          hit = { id: created.id, name: b.name, month: m, day: d, gcal_recurring_id: series };
          birthdays.push(hit);
          report.birthdays++;
        } else if (!hit.gcal_recurring_id) {
          await db.exec(`update public.birthdays set gcal_recurring_id = $2, updated_via = 'gcal' where id = $1::uuid`, [hit.id, series]);
          hit.gcal_recurring_id = series;
        }
        await db.exec(
          `insert into public.events (title, all_day, starts_at, ends_at, start_date, end_date, kind, source, gcal_event_id, gcal_etag, gcal_recurring, gcal_synced_at, birthday_id, updated_via)
           values ($1, true, $2::timestamptz, $3::timestamptz, $4::date, $5::date, 'birthday', 'gcal', $6, $7, $8, now(), $9::uuid, 'gcal')
           on conflict (gcal_event_id) do nothing`,
          [g.summary || b.name, t.starts_at, t.ends_at, t.start_date, t.end_date, g.id, g.etag ?? null, !!g.recurringEventId, hit.id]);
        continue;
      }
      const d = decodeTitle(g.summary || "", people, g.location || "");
      await db.exec(
        `insert into public.events (title, description, location, all_day, starts_at, ends_at, start_date, end_date, kind, participant_ids, status, source,
           gcal_event_id, gcal_etag, gcal_recurring, gcal_synced_at, updated_via)
         values ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7::date, $8::date, $9, $10::text::uuid[], 'confirmed', 'gcal', $11, $12, $13, now(), 'gcal')
         on conflict (gcal_event_id) do nothing`,
        [d.title, stripFooter(g.description) || null, g.location || null, t.all_day, t.starts_at, t.ends_at, t.start_date, t.end_date, d.kind, uuids(d.participantIds),
          g.id, g.etag ?? null, !!g.recurringEventId]);
      report.added++;
    } catch (err) {
      report.errors.push(`pull ${g.id}: ${(err as Error).message}`.slice(0, 300));
    }
  }

  // Gone from Google: removed here too. Skipped when Google answers with nothing at all while we know many events
  // (a calendar emptied by mistake or a wrong calendar id must not wipe Hestia).
  const inWindow = await db.all(
    `select id, gcal_event_id from public.events where gcal_event_id is not null and deleted_at is null and not gcal_dirty
       and starts_at >= $1::timestamptz + interval '1 day' and starts_at < $2::timestamptz - interval '1 day'`, [timeMin, timeMax]);
  const missing = inWindow.filter((r) => !seen.has(r.gcal_event_id));
  if (missing.length && !(items.length === 0 && inWindow.length > 20)) {
    await db.exec(`update public.events set deleted_at = now(), updated_by = null, updated_via = 'gcal' where id = any ($1::text::uuid[])`, [uuids(missing.map((r) => r.id))]);
    report.deleted = missing.length;
  } else if (missing.length) {
    report.errors.push(`Google returned no event while ${inWindow.length} are known: nothing removed.`);
  }
  return report;
}
