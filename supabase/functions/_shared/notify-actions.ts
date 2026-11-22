// Notification buttons: which ones a notification shows, and what pressing one does (functions/notify, task "action").
// Shared so that the tests can run them against the test database.
import type { Db } from "./db.ts";
import { householdTz } from "./db.ts";
import type { PushPayload } from "./push.ts";
import { addDays, fmtTime, partsIn } from "./time.ts";

// The buttons a notification shows (Android and computers; iPhone shows none and opens the app). Two at most: that is
// all Android displays. An action named in `links` opens that address; the others come back here (task "action").
export type Shown = { kind: string; url: string | null; data: Record<string, any>; action_token: string };
export async function buttons(db: Db, n: Shown): Promise<Pick<PushPayload, "actions" | "links" | "token">> {
  const token = n.action_token;
  if (n.kind === "approval_request") return { token, actions: [{ action: "approve", title: "Approuver" }, { action: "decline", title: "Refuser" }] };
  if (n.kind === "task_assigned" && n.data.occurrence_id) return { token, actions: [{ action: "done", title: "Fait" }, { action: "tomorrow", title: "Demain" }] };
  if (n.kind === "reminder" && n.data.occurrence_ids?.length) return { token, actions: [{ action: "done", title: "Tout est fait" }, { action: "tomorrow", title: "Demain" }] };
  if (n.kind === "arrival") return { token, actions: [{ action: "open", title: "Voir le trajet" }, { action: "seen", title: "OK, vu" }], links: { open: n.url || "#/" } };
  if (n.kind === "reminder" && n.data.event_id) {
    const e = await db.one(`select location from public.events where id = $1::uuid`, [n.data.event_id]);
    const place = (e?.location || "").trim();
    return {
      token,
      actions: [...(place ? [{ action: "directions", title: "Itinéraire" }] : []), { action: "snooze", title: "Dans 10 min" }],
      ...(place ? { links: { directions: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place)}` } } : {}),
    };
  }
  return {};
}

export type Answer = { status: number; ok: boolean; message?: string; quiet?: boolean };

// A button pressed on the notification itself. The person acting is the one the notification was for.
//   approve | decline   an approval request
//   done                the chores the notification names are done ("Fait", "Tout est fait")
//   tomorrow            ... still to do tomorrow: a one-off task moves to tomorrow, a recurring one stays open a day more
//   seen                read, nothing else ("OK, vu" on someone coming home)
//   snooze              the same notification comes back in 10 minutes
export const ACTIONS = ["approve", "decline", "done", "tomorrow", "seen", "snooze"];
export async function act(db: Db, token: string, what: string): Promise<Answer> {
  if (!/^[0-9a-f]{64}$/.test(token) || !ACTIONS.includes(what)) return { status: 400, ok: false, message: "Demande invalide." };
  const n = await db.one(`select id, member_id, kind, data from public.notifications where action_token = $1`, [token]);
  if (!n) return { status: 404, ok: false, message: "Cette notification n'existe plus." };
  const who = n.member_id, read = () => db.exec(`update public.notifications set read_at = coalesce(read_at, now()) where id = $1::uuid`, [n.id]);

  if (what === "approve" || what === "decline") {
    if (n.kind !== "approval_request") return { status: 400, ok: false, message: "Demande invalide." };
    const done = await db.exec(
      `update public.events set status = $2, approval_decided_by = $3::uuid, approval_decided_at = now(), updated_by = $3::uuid, updated_via = 'app'
       where id = $1::uuid and status = 'pending' and deleted_at is null and (cardinality(approver_ids) = 0 or $3::uuid = any (approver_ids)) returning title`,
      [n.data.event_id, what === "approve" ? "confirmed" : "declined", who]);
    await read();
    if (!done.length) return { status: 200, ok: false, message: "C'était déjà décidé." };
    return { status: 200, ok: true, message: `${what === "approve" ? "Approuvé" : "Refusé"} : ${done[0].title}` };
  }
  if (what === "seen") { await read(); return { status: 200, ok: true, quiet: true }; }
  if (what === "snooze") {
    await db.exec(`update public.notifications set pushed_at = null, read_at = null, send_after = now() + interval '10 minutes' where id = $1::uuid`, [n.id]);
    return { status: 200, ok: true, message: `Je te le rappelle à ${fmtTime(Date.now() + 10 * 60_000, await householdTz(db))}.` };
  }
  // done | tomorrow: the chores named by the notification, only those still to do
  const ids: string[] = n.data.occurrence_ids ?? (n.data.occurrence_id ? [n.data.occurrence_id] : []);
  if (!ids.length) return { status: 400, ok: false, message: "Demande invalide." };
  const list = `{${ids.filter((id) => /^[0-9a-f-]{36}$/.test(id)).join(",")}}`;
  const rows = what === "done"
    ? await db.exec(`update public.chore_occurrences set status = 'done', done_by = $2::uuid, updated_by = $2::uuid, updated_via = 'app'
        where id = any ($1::text::uuid[]) and status = 'todo' and deleted_at is null returning title`, [list, who])
    : await db.exec(`update public.chore_occurrences set
          due_date = case when chore_id is null then greatest(due_date, $3::date) else due_date end,
          due_until = case when chore_id is null then due_until else greatest(coalesce(due_until, $3::date), $3::date) end,
          updated_by = $2::uuid, updated_via = 'app'
        where id = any ($1::text::uuid[]) and status = 'todo' and deleted_at is null returning title`,
        [list, who, addDays(partsIn(Date.now(), await householdTz(db)).day, 1)]);
  await read();
  if (!rows.length) return { status: 200, ok: false, message: "C'était déjà fait." };
  const names = rows.map((r) => r.title).join(", ");
  return { status: 200, ok: true, message: what === "done" ? `Fait : ${names}` : `Pour demain : ${names}` };
}

