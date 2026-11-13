// Notifications (Web Push) and reminders.
//   GET  ?vapid                                   the public key the app subscribes with (made on first call)
//   POST { task: "push", notification_id }        from the database, for each new row of public.notifications
//   POST { task: "reminders" }                    from pg_cron every 15 minutes: morning summary, evening reminder,
//                                                 "in one hour" before an event (times in settings.reminders)
//   POST { task: "action", token, action }        from a notification's buttons: approve | decline, without opening the app
//   POST { task: "test" }                         from the app (signed in): a test notification on one's own devices
import { type Db, type Member, householdTz, loadMembers, uuids } from "../_shared/db.ts";
import { isInternal, json, memberFromToken, preflight, rememberFunctionsUrl } from "../_shared/http.ts";
import { type PushPayload, sendPush, vapid } from "../_shared/push.ts";
import { db, env } from "../_shared/runtime.ts";
import { addDays, fmtTime, instant, partsIn } from "../_shared/time.ts";

const subject = () => env("HESTIA_SITE_URL") || env("SUPABASE_URL") || "https://supabase.com";
const minutes = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
// true the first time a key is seen: a reminder goes out once, even if the schedule fires twice
const once = async (d: Db, key: string) => (await d.exec(`insert into private.sent (key) values ($1) on conflict do nothing returning key`, [key])).length > 0;
const notify = (d: Db, memberId: string, kind: string, title: string, body: string, url: string, data: unknown = {}) =>
  d.exec(`insert into public.notifications (member_id, kind, title, body, url, data) values ($1::uuid, $2, $3, $4, $5, $6::text::jsonb)`,
    [memberId, kind, title, body, url, JSON.stringify(data)]);

async function push(notificationId: string) {
  // Taken once: a second call for the same row sends nothing
  const [n] = await db.exec(`update public.notifications set pushed_at = now() where id = $1::uuid and pushed_at is null
    returning id, member_id, kind, title, body, url, action_token`, [notificationId]);
  if (!n) return { sent: 0 };
  const payload: PushPayload = { title: n.title, body: n.body || "", url: n.url || "#/", tag: n.id, kind: n.kind };
  if (n.kind === "approval_request") {
    payload.token = n.action_token;
    payload.actions = [{ action: "approve", title: "Approuver" }, { action: "decline", title: "Refuser" }];
  }
  return await sendPush(db, [n.member_id], payload, subject());
}

async function reminders() {
  const tz = await householdTz(db), now = Date.now(), local = partsIn(now, tz), today = local.day;
  const cfg = (await db.one(`select value from public.settings where id = 'reminders'`))?.value || {};
  const members = (await loadMembers(db)).filter((m) => m.role === "adult");
  const mine = (m: Member, ids: string[]) => !ids.length || ids.includes(m.id);
  const at = (hm: string | undefined, fallback: string) => { const d = minutes(local.time) - minutes(/^\d\d:\d\d$/.test(hm || "") ? hm! : fallback); return d >= 0 && d < 15; };
  const report = { digest: 0, evening: 0, events: 0 };

  const chores = await db.all(`select id, title, assignee_ids, time_of_day from public.chore_occurrences
    where deleted_at is null and status = 'todo' and due_date <= $1::date and (due_until is null or due_until >= $1::date)`, [today]);

  if (at(cfg.morning, "07:30")) {
    const events = await db.all(`select id, title, all_day, starts_at, participant_ids, caregiver_ids, approver_ids, status from public.events
      where deleted_at is null and status in ('confirmed', 'pending') and kind <> 'birthday' and starts_at >= $1::timestamptz and starts_at < $2::timestamptz order by starts_at`,
      [instant(today, "00:00", tz).toISOString(), instant(addDays(today, 1), "00:00", tz).toISOString()]);
    const [, mm, dd] = today.split("-").map(Number);
    const bdays = await db.all(`select name from public.birthdays where deleted_at is null and kind <> 'memorial' and month = $1 and day = $2`, [mm, dd]);
    const pending = await db.all(`select id, title, approver_ids from public.events where deleted_at is null and status = 'pending' and starts_at >= now()`);
    for (const m of members) {
      const lines: string[] = [];
      const ev = events.filter((e) => mine(m, [...e.participant_ids, ...e.caregiver_ids]));
      if (ev.length) lines.push(`📅 ${ev.map((e) => `${e.all_day ? "" : fmtTime(Date.parse(e.starts_at), tz) + " "}${e.title}`).join(", ")}`);
      const ch = chores.filter((c) => mine(m, c.assignee_ids));
      if (ch.length) lines.push(`🧹 ${ch.map((c) => c.title).join(", ")}`);
      if (bdays.length) lines.push(`🎂 ${bdays.map((b) => b.name).join(", ")}`);
      const waiting = pending.filter((e) => e.approver_ids.includes(m.id));
      if (waiting.length) lines.push(`⏳ À approuver : ${waiting.map((e) => e.title).join(", ")}`);
      if (lines.length && await once(db, `digest:${today}:${m.id}`)) { await notify(db, m.id, "digest", "Aujourd'hui", lines.join("\n"), "#/"); report.digest++; }
    }
  }
  if (at(cfg.evening, "20:00")) {
    for (const m of members) {
      const ch = chores.filter((c) => c.assignee_ids.includes(m.id));
      if (ch.length && await once(db, `evening:${today}:${m.id}`)) { await notify(db, m.id, "reminder", "Encore à faire", ch.map((c) => c.title).join(", "), "#/chores"); report.evening++; }
    }
  }
  const before = Number(cfg.event_minutes_before ?? 60);
  if (before > 0) {
    const soon = await db.all(`select id, title, location, starts_at, participant_ids, caregiver_ids from public.events
      where deleted_at is null and status = 'confirmed' and not all_day and kind <> 'birthday'
        and starts_at > now() and starts_at <= now() + make_interval(mins => $1::int)`, [before]);
    for (const e of soon) {
      for (const m of members.filter((x) => mine(x, [...e.participant_ids, ...e.caregiver_ids]))) {
        if (await once(db, `event:${e.id}:${e.starts_at}:${m.id}`)) {
          await notify(db, m.id, "reminder", `${fmtTime(Date.parse(e.starts_at), tz)} · ${e.title}`, e.location ? e.location.split("\n")[0] : "Bientôt", `#/event/${e.id}`, { event_id: e.id });
          report.events++;
        }
      }
    }
  }
  return report;
}

// "Approuver" / "Refuser" pressed on the notification itself
async function action(token: string, what: string) {
  if (!/^[0-9a-f]{64}$/.test(token) || !["approve", "decline"].includes(what)) return json({ ok: false, message: "Demande invalide." }, 400);
  const n = await db.one(`select id, member_id, data from public.notifications where action_token = $1 and kind = 'approval_request'`, [token]);
  if (!n) return json({ ok: false, message: "Cette demande n'existe plus." }, 404);
  const done = await db.exec(
    `update public.events set status = $2, approval_decided_by = $3::uuid, approval_decided_at = now(), updated_by = $3::uuid, updated_via = 'app'
     where id = $1::uuid and status = 'pending' and deleted_at is null and (cardinality(approver_ids) = 0 or $3::uuid = any (approver_ids)) returning title`,
    [n.data.event_id, what === "approve" ? "confirmed" : "declined", n.member_id]);
  await db.exec(`update public.notifications set read_at = coalesce(read_at, now()) where id = $1::uuid`, [n.id]);
  if (!done.length) return json({ ok: false, message: "C'était déjà décidé." });
  return json({ ok: true, message: `${what === "approve" ? "Approuvé" : "Refusé"} : ${done[0].title}` });
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  await rememberFunctionsUrl(db, env);
  if (req.method === "GET") return json({ key: (await vapid(db)).publicKey });
  const body = await req.json().catch(() => ({}));
  if (body.task === "action") return await action(String(body.token || ""), String(body.action || ""));
  if (body.task === "test") {
    const who = await memberFromToken(req, db, env);
    if (!who) return json({ error: "auth" }, 401);
    return json(await sendPush(db, [who.member.id], { title: "Hestia", body: "Les notifications fonctionnent ✅", url: "#/settings", tag: "test" }, subject()));
  }
  if (!(await isInternal(req, db))) return json({ error: "auth" }, 401);
  if (body.task === "push" && typeof body.notification_id === "string") return json(await push(body.notification_id));
  if (body.task === "reminders") return json(await reminders());
  return json({ error: "task" }, 400);
});
export { uuids };
