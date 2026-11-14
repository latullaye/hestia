// An event: see it, decide on its approval, comment, edit or create.
import { CalendarClock, Check, MapPin, MessageCircle, Pencil, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { addDays, cap, eventDays, fmtDay, instant, partsIn, timeRange, uncared } from "../lib/domain";
import { useHousehold, useMembers, useTable } from "../lib/hooks";
import { useSession } from "../lib/session";
import { store } from "../lib/store";
import type { CalEvent } from "../lib/types";
import { Avatar, Field, MemberChips, Sheet, toast } from "./ui";

const KINDS: [string, string][] = [["event", "Événement"], ["medical", "Santé"], ["activity", "Activité"], ["social", "Sortie, amis"], ["work", "Travail"], ["travel", "Voyage"], ["other", "Autre"]];
export const STATUS_TAG: Record<string, { cls: string; text: string }> = {
  pending: { cls: "warn", text: "En attente d'approbation" }, declined: { cls: "danger", text: "Refusé" }, cancelled: { cls: "danger", text: "Annulé" },
};

export function EventSheet({ id, day, onClose }: { id?: string; day?: string; onClose: () => void }) {
  const events = useTable("events");
  const event = id ? events.find((e) => e.id === id) : undefined;
  const [editing, setEditing] = useState(!id);
  if (id && !event) return <Sheet title="Événement" onClose={onClose}><p className="muted">Cet événement n'existe plus.</p></Sheet>;
  return editing ? <EventForm event={event} day={day} onClose={onClose} onDone={() => (id ? setEditing(false) : onClose())} />
    : <EventView event={event!} onClose={onClose} onEdit={() => setEditing(true)} />;
}

function EventView({ event: e, onClose, onEdit }: { event: CalEvent; onClose: () => void; onEdit: () => void }) {
  const { tz } = useHousehold(), members = useMembers(), { me, acting, isKiosk } = useSession();
  const comments = useTable("event_comments").filter((c) => c.event_id === e.id).sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
  const [text, setText] = useState("");
  const actor = isKiosk ? acting : me;
  const alone = uncared(e, members.all);
  const days = eventDays(e, tz);
  const canDecide = e.status === "pending" && !!actor && actor.role === "adult" && (e.approver_ids.length ? e.approver_ids.includes(actor.id) : actor.id !== e.created_by);
  const comment = () => {
    if (!text.trim()) return;
    store.put("event_comments", { event_id: e.id, author_id: actor?.id ?? null, body: text.trim() });
    setText("");
  };
  const decide = (status: "confirmed" | "declined") => {
    if (text.trim()) comment();
    store.put("events", { ...e, status, approval_decided_by: actor!.id, approval_decided_at: new Date().toISOString(), approval_note: text.trim() || null });
    toast(status === "confirmed" ? "Approuvé" : "Refusé");
    onClose();
  };
  return (
    <Sheet title={e.title} onClose={onClose} footer={<>
      {!e.gcal_recurring && <button className="btn danger" onClick={() => { if (confirm("Supprimer cet événement ? Il sera aussi retiré de Google Agenda.")) { store.remove("events", e.id); onClose(); } }}><Trash2 />Supprimer</button>}
      <button className="btn" onClick={onEdit}><Pencil />Modifier</button>
    </>}>
      <div className="card col">
        <div className="row top"><CalendarClock size={20} className="muted" /><div>
          <b>{cap(fmtDay(days.first, { weekday: "long", month: "long" }))}{days.last !== days.first ? ` → ${fmtDay(days.last, { weekday: "long", month: "long" })}` : ""}</b>
          <div className="muted">{timeRange(e, tz)}</div>
        </div></div>
        {e.location && <div className="row top"><MapPin size={20} className="muted" /><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location)}`} target="_blank" rel="noreferrer">{e.location}</a></div>}
        {e.description && <p style={{ whiteSpace: "pre-wrap" }}>{e.description}</p>}
        <div className="row wrap">
          {STATUS_TAG[e.status] && <span className={`tag ${STATUS_TAG[e.status].cls}`}>{STATUS_TAG[e.status].text}</span>}
          {e.kind === "medical" && <span className="tag danger">Santé</span>}
          {e.gcal_recurring && <span className="tag">Récurrent (Google Agenda)</span>}
          {e.source === "gcal" && !e.gcal_recurring && <span className="tag">Google Agenda</span>}
        </div>
      </div>

      <div className="card col">
        <Field label="Pour qui"><MemberChips value={e.participant_ids} options={members.family} none="Toute la famille" onChange={(ids) => store.put("events", { ...e, participant_ids: ids })} /></Field>
        {(alone.length > 0 || e.caregiver_ids.length > 0 || members.family.some((m) => m.needs_caregiver && e.participant_ids.includes(m.id))) && (
          <Field label={alone.length ? `Qui accompagne ${alone.map((m) => m.name).join(", ")} ?` : "Accompagné par"}>
            <MemberChips value={e.caregiver_ids} options={members.adults} onChange={(ids) => store.put("events", { ...e, caregiver_ids: ids })} />
          </Field>
        )}
      </div>

      {e.status === "pending" && (
        <div className="card warn col">
          <b>{members.name(e.created_by)} demande l'accord de {members.names(e.approver_ids, "l'autre parent")}</b>
          {canDecide ? (
            <>
              <input className="input" placeholder="Un commentaire ? (facultatif)" value={text} onChange={(ev) => setText(ev.target.value)} />
              <div className="row"><button className="btn ok grow" onClick={() => decide("confirmed")}><Check />Approuver</button><button className="btn danger grow" onClick={() => decide("declined")}><X />Refuser</button></div>
            </>
          ) : isKiosk && !acting ? <span className="small">Choisis qui tu es, en haut de l'écran, pour répondre.</span>
            : <span className="small">En attente de sa réponse. Il ou elle a reçu une notification.</span>}
        </div>
      )}
      {e.status !== "pending" && e.approval_decided_by && (
        <p className="small muted">{e.status === "declined" ? "Refusé" : "Approuvé"} par {members.name(e.approval_decided_by)}{e.approval_note ? ` : « ${e.approval_note} »` : ""}</p>
      )}

      <div className="card col">
        <span className="label row"><MessageCircle size={14} />Commentaires</span>
        {comments.map((c) => <div key={c.id} className="row top"><Avatar member={members.byId.get(c.author_id || "")} /><div className="grow"><b className="small">{members.name(c.author_id)}</b><div>{c.body}</div></div></div>)}
        {!canDecide && <form className="row" onSubmit={(ev) => { ev.preventDefault(); comment(); }}>
          <input className="input grow" placeholder="Écrire un commentaire" value={text} onChange={(ev) => setText(ev.target.value)} /><button className="btn" disabled={!text.trim()}>Envoyer</button>
        </form>}
      </div>
    </Sheet>
  );
}

function EventForm({ event, day, onClose, onDone }: { event?: CalEvent; day?: string; onClose: () => void; onDone: () => void }) {
  const { tz } = useHousehold(), members = useMembers(), { me, acting, isKiosk } = useSession();
  const actor = isKiosk ? acting : me;
  const today = partsIn(Date.now(), tz).day;
  const initial = useMemo(() => {
    if (event) {
      const s = partsIn(Date.parse(event.starts_at), tz), e = event.ends_at ? partsIn(Date.parse(event.ends_at), tz) : null;
      return { title: event.title, allDay: event.all_day, date: event.all_day ? event.start_date || s.day : s.day, endDate: event.end_date || event.start_date || s.day,
        start: s.time, end: e?.time || "", location: event.location || "", description: event.description || "", kind: event.kind,
        who: event.participant_ids, carers: event.caregiver_ids, approvers: event.status === "pending" ? event.approver_ids : [] as string[] };
    }
    return { title: "", allDay: false, date: day || today, endDate: day || today, start: "18:00", end: "19:00", location: "", description: "", kind: "event",
      who: actor ? [actor.id] : [] as string[], carers: [] as string[], approvers: [] as string[] };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [f, setF] = useState(initial);
  const [touchedApproval, setTouchedApproval] = useState(!!event);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const dependents = members.family.filter((m) => m.needs_caregiver);
  const needsCarer = dependents.some((m) => f.who.includes(m.id));
  const others = members.adults.filter((m) => m.id !== actor?.id);
  // A parent going out alone leaves the other one with the child: by default, their agreement is asked
  const soloOuting = !!actor && dependents.length > 0 && f.who.length > 0 && f.who.every((id) => members.byId.get(id)?.role === "adult") && !others.every((m) => f.who.includes(m.id));
  const approvers = touchedApproval ? f.approvers : soloOuting ? others.filter((m) => !f.who.includes(m.id)).map((m) => m.id) : [];
  const error = !f.title.trim() ? "Donne un titre." : needsCarer && !f.carers.length ? `Qui accompagne ${dependents.filter((m) => f.who.includes(m.id)).map((m) => m.name).join(", ")} ?`
    : !f.allDay && f.end && f.end <= f.start ? "L'heure de fin est avant le début." : f.allDay && f.endDate < f.date ? "La date de fin est avant le début." : null;

  const save = () => {
    if (error) return toast(error);
    const starts = f.allDay ? instant(f.date, "00:00", tz) : instant(f.date, f.start, tz);
    const ends = f.allDay ? instant(addDays(f.endDate, 1), "00:00", tz) : instant(f.date, f.end || f.start, tz);
    const wasPending = event?.status === "pending";
    const status = approvers.length ? (event && !wasPending && event.approver_ids.join() === approvers.join() ? event.status : "pending") : event && !wasPending ? event.status : "confirmed";
    store.put("events", {
      ...(event || {}), title: f.title.trim(), all_day: f.allDay, starts_at: starts.toISOString(), ends_at: (f.allDay || f.end ? ends : new Date(starts.getTime() + 3600e3)).toISOString(),
      start_date: f.allDay ? f.date : null, end_date: f.allDay ? f.endDate : null, location: f.location.trim() || null, description: f.description.trim() || null, kind: f.kind,
      participant_ids: f.who, caregiver_ids: needsCarer ? f.carers : [], approver_ids: approvers, status,
      ...(event ? {} : { created_by: actor?.id ?? null }),
    } as Partial<CalEvent>);
    toast(status === "pending" && !wasPending ? "Demande envoyée" : "Enregistré");
    onDone();
  };
  const locked = !!event?.gcal_recurring;
  return (
    <Sheet title={event ? "Modifier" : "Nouvel événement"} onClose={onClose} footer={<><button className="btn" onClick={event ? onDone : onClose}>Annuler</button><button className="btn primary" onClick={save}>Enregistrer</button></>}>
      {locked && <p className="small muted">Occurrence d'un événement récurrent de Google Agenda : le titre et l'horaire se changent dans Google Agenda.</p>}
      <Field label="Titre"><input className="input" value={f.title} disabled={locked} onChange={(e) => set({ title: e.target.value })} placeholder="5 à 7 avec les collègues" autoFocus={!event} /></Field>
      <label className="switch"><input type="checkbox" checked={f.allDay} disabled={locked} onChange={(e) => set({ allDay: e.target.checked })} />Toute la journée</label>
      <div className="fields">
        <Field label={f.allDay ? "Du" : "Date"}><input className="input" type="date" value={f.date} disabled={locked} onChange={(e) => set({ date: e.target.value, endDate: e.target.value > f.endDate ? e.target.value : f.endDate })} /></Field>
        {f.allDay ? <Field label="Au"><input className="input" type="date" value={f.endDate} min={f.date} disabled={locked} onChange={(e) => set({ endDate: e.target.value })} /></Field>
          : <><Field label="Début"><input className="input" type="time" value={f.start} disabled={locked} onChange={(e) => set({ start: e.target.value })} /></Field>
            <Field label="Fin"><input className="input" type="time" value={f.end} disabled={locked} onChange={(e) => set({ end: e.target.value })} /></Field></>}
      </div>
      <Field label="Pour qui"><MemberChips value={f.who} options={members.family} none="Toute la famille" onChange={(who) => set({ who })} /></Field>
      {needsCarer && <Field label="Accompagné par (obligatoire)"><MemberChips value={f.carers} options={members.adults} onChange={(carers) => set({ carers })} /></Field>}
      {others.length > 0 && (
        <Field label="Demander l'accord de" hint={soloOuting && !touchedApproval ? "Proposé parce que l'autre parent garde l'enfant. Décoche si c'est déjà convenu." : undefined}>
          <MemberChips value={approvers} options={others} none="Personne" onChange={(ids) => { setTouchedApproval(true); set({ approvers: ids }); }} />
        </Field>
      )}
      <Field label="Lieu"><input className="input" value={f.location} onChange={(e) => set({ location: e.target.value })} /></Field>
      <Field label="Type"><select className="input" value={f.kind} onChange={(e) => set({ kind: e.target.value })}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
      <Field label="Notes"><textarea className="input" value={f.description} onChange={(e) => set({ description: e.target.value })} /></Field>
    </Sheet>
  );
}
