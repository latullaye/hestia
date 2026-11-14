// The inbox: what waits for my answer, what I asked for, the decisions already taken, and the notifications I received.
// The approvals are read from the events themselves, so a decision stays here even after its notification is gone.
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { EventSheet } from "../components/EventSheet";
import { Empty, SyncPill } from "../components/ui";
import { cap, eventDays, fmtDay, plural, startTime } from "../lib/domain";
import { useHousehold, useMembers, useTable } from "../lib/hooks";
import { useSession } from "../lib/session";
import { store } from "../lib/store";
import type { CalEvent, Member, Notification } from "../lib/types";

const DECISIONS_SHOWN = 30, NOTIFICATIONS_SHOWN = 60;

// What the inbox holds for one person. Also used for the badges (tab bar, bell, "Plus").
export function inboxOf(events: CalEvent[], notifications: Notification[], me: Member | null) {
  const mine = me ? events.filter((e) => !e.deleted_at && e.kind !== "birthday") : [];
  const id = me?.id ?? "";
  const toAnswer = mine.filter((e) => e.status === "pending" && e.approver_ids.includes(id)).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const asked = mine.filter((e) => e.status === "pending" && e.created_by === id && !e.approver_ids.includes(id)).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const decided = mine.filter((e) => e.status !== "pending" && e.approval_decided_by && e.approval_decided_at
    && (e.created_by === id || e.approver_ids.includes(id) || e.approval_decided_by === id))
    .sort((a, b) => b.approval_decided_at!.localeCompare(a.approval_decided_at!));
  const received = notifications.filter((n) => n.member_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const unread = received.filter((n) => !n.read_at);
  return { toAnswer, asked, decided, received, unread, badge: toAnswer.length + unread.length };
}

export function Inbox() {
  const { tz } = useHousehold(), members = useMembers(), { me } = useSession();
  const events = useTable("events"), notifications = useTable("notifications");
  const [eventId, setEventId] = useState<string | null>(null);
  const { toAnswer, asked, decided, received, unread } = inboxOf(events, notifications, me);
  const when = (e: CalEvent) => `${cap(fmtDay(eventDays(e, tz).first, { weekday: "short", month: "short" }))}${e.all_day ? "" : ` · ${startTime(e, tz)}`}`;
  const stamp = (iso: string) => new Date(iso).toLocaleString("fr-CA", { timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const read = (list: Notification[]) => list.forEach((n) => store.put("notifications", { ...n, read_at: new Date().toISOString() }));
  const row = (e: CalEvent, detail: string, tag?: { cls: string; text: string }) => (
    <button key={e.id} className="tap" onClick={() => setEventId(e.id)}>
      <span className="grow col" style={{ gap: 2 }}>
        <b>{e.title}</b>
        <span className="small muted">{when(e)}</span>
        <span className="small">{detail}</span>
      </span>
      {tag && <span className={`tag ${tag.cls}`}>{tag.text}</span>}
      <ChevronRight size={18} className="muted" />
    </button>
  );

  return (
    <div className="page">
      <div className="top"><h1 className="grow">Boîte de réception</h1><SyncPill /></div>

      <div className="section-title"><h2>À toi de répondre</h2></div>
      <div className={`card flush list ${toAnswer.length ? "warn" : ""}`}>
        {toAnswer.map((e) => row(e, `${members.name(e.created_by)} demande ton accord`, { cls: "warn", text: "À décider" }))}
        {!toAnswer.length && <div className="muted">Aucune demande en attente de ta réponse.</div>}
      </div>

      {asked.length > 0 && <>
        <div className="section-title"><h2>Tes demandes en attente</h2></div>
        <div className="card flush list">
          {asked.map((e) => row(e, `En attente de ${members.names(e.approver_ids, "l'autre parent")}`, { cls: "warn", text: "En attente" }))}
        </div>
      </>}

      <div className="section-title"><h2>Décisions</h2></div>
      <div className="card flush list">
        {decided.slice(0, DECISIONS_SHOWN).map((e) => {
          const declined = e.status === "declined";
          const who = e.approval_decided_by === me?.id ? "Tu as" : `${members.name(e.approval_decided_by)} a`;
          const asker = e.created_by && e.created_by !== me?.id && e.created_by !== e.approval_decided_by ? ` la demande de ${members.name(e.created_by)}` : "";
          return row(e, `${who} ${declined ? "refusé" : "approuvé"}${asker} le ${stamp(e.approval_decided_at!)}${e.approval_note ? ` : « ${e.approval_note} »` : ""}`,
            declined ? { cls: "danger", text: "Refusé" } : { cls: "accent", text: "Approuvé" });
        })}
        {!decided.length && <div className="muted">Aucune décision pour le moment.</div>}
      </div>

      <div className="section-title">
        <h2 className="grow">Notifications{unread.length > 0 && <span className="small muted"> · {plural(unread.length, "nouvelle")}</span>}</h2>
        {unread.length > 0 && <button className="btn small" onClick={() => read(unread)}>Tout marquer lu</button>}
      </div>
      {received.length > 0 ? (
        <div className="card flush list">
          {received.slice(0, NOTIFICATIONS_SHOWN).map((n) => (
            <a key={n.id} href={n.url && n.url !== "#/inbox" ? n.url : undefined} onClick={() => { if (!n.read_at) read([n]); }} style={{ textDecoration: "none", color: "inherit" }}>
              <span className="grow col" style={{ gap: 2 }}>
                <span className="row" style={{ gap: 6 }}>{!n.read_at && <span className="unread-dot" aria-label="Non lue" />}<b>{n.title}</b></span>
                {n.body && <span className="small" style={{ whiteSpace: "pre-wrap" }}>{n.body}</span>}
                <span className="tiny muted">{stamp(n.created_at)}</span>
              </span>
              {n.url && n.url !== "#/inbox" && <ChevronRight size={18} className="muted" />}
            </a>
          ))}
        </div>
      ) : <Empty>Aucune notification reçue.</Empty>}
      <p className="tiny muted">Les notifications sont gardées 90 jours. Les décisions restent avec leur événement.</p>

      {eventId && <EventSheet id={eventId} onClose={() => setEventId(null)} />}
    </div>
  );
}
