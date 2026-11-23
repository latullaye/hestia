// Being on the way home, and being away from home: the banners several screens show, and the sheet of a stay.
import { Car, ChevronRight, Trash2 } from "lucide-react";
import { partsIn } from "@shared/time.ts";
import { useState } from "react";
import { Link } from "react-router-dom";
import { STAY_ICON, TRANSPORT_LABEL, addDays, carshareMissing, fmtDay, stayLabel, stayTitle } from "../lib/domain";
import { type Members, useMembers, useNow, useTable } from "../lib/hooks";
import { useSession } from "../lib/session";
import { store } from "../lib/store";
import type { Arrival, Stay, Transport } from "../lib/types";
import { Glyph } from "./icons";
import { Field, MemberChips, Segmented, Sheet, toast } from "./ui";

const SHOWN_AFTER_ETA = 20 * 60_000; // an arrival stays on screen a little after its time

// "17 h 05" (partsIn reuses its formatter: this is drawn on every render of the kiosk)
export const hhmm = (iso: string | number, tz: string) => {
  const [h, m] = partsIn(typeof iso === "number" ? iso : Date.parse(iso), tz).time.split(":");
  return `${Number(h)} h ${m}`;
};
export const minutesLeft = (eta: string, now: number) => Math.round((Date.parse(eta) - now) / 60_000);

export function activeArrivals(arrivals: Arrival[], now: number) {
  return arrivals.filter((a) => !a.deleted_at && !a.arrived_at && Date.parse(a.eta) + SHOWN_AFTER_ETA > now)
    .sort((a, b) => a.eta.localeCompare(b.eta));
}

// "Alex arrive vers 17 h 32 · dans 23 min", for the others; for oneself, a way back to the trip
export function ArrivalBanners({ tz, compact, onOpen }: { tz: string; compact?: boolean; onOpen?: (a: Arrival) => void }) {
  const now = useNow(20_000), members = useMembers(), { me } = useSession();
  const list = activeArrivals(useTable("arrivals"), now);
  if (!list.length) return null;
  return <>{list.map((a) => {
    const left = minutesLeft(a.eta, now), mine = a.member_id === me?.id;
    const when = left > 0 ? `dans ${left} min` : "devrait être là";
    if (compact) return <button key={a.id} className="karrival" onClick={() => onOpen?.(a)}><Glyph name="home" />{members.name(a.member_id)} · {hhmm(a.eta, tz)} · {when}</button>;
    return mine ? (
      <Link key={a.id} to="/leaving" className="card row arrival" style={{ textDecoration: "none", color: "inherit" }}>
        <span className="grow"><b>Tu arrives vers {hhmm(a.eta, tz)}</b><div className="small muted">{members.names(a.notify_ids.filter((id) => id !== a.member_id), "Personne")} {a.notify_ids.length > 1 ? "le savent" : "le sait"} · {when}</div></span>
        <ChevronRight size={18} className="muted" />
      </Link>
    ) : (
      <Link key={a.id} to={`/trip/${a.id}`} className="card row arrival" style={{ textDecoration: "none", color: "inherit" }}>
        <span className="grow"><b>{members.name(a.member_id)} arrive vers {hhmm(a.eta, tz)}</b>
          <div className="small muted">{a.from_label ? `Départ ${a.from_label} à ${hhmm(a.left_at, tz)} · ` : ""}{when}</div>
          {a.note && <div className="small trip-note">« {a.note} »</div>}</span>
        <span className="arrival-count">{left > 0 ? <><b>{left}</b><small>min</small></> : <Glyph name="home" />}</span>
      </Link>
    );
  })}</>;
}

// A stay under way, or one starting within a week (with the shared car still to book, in amber)
export function StayBanner({ today, onOpen }: { today: string; onOpen: (s: Stay) => void }) {
  const stays = useTable("stays").filter((s) => !s.deleted_at && s.end_date >= today && s.start_date <= addDays(today, 7))
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  return <>{stays.map((s) => (
    <button key={s.id} className={`card row stay-banner ${carshareMissing(s) ? "warn" : ""} ${s.status}`} onClick={() => onOpen(s)}>
      <Glyph name={STAY_ICON[s.kind]} />
      <span className="grow"><b>{stayTitle(s)}</b>{s.status === "planned" && <span className="tag warn" style={{ marginLeft: 6 }}>À confirmer</span>}
        <div className="small muted">{s.start_date <= today ? `Jusqu'au ${fmtDay(s.end_date, { weekday: "long" })}` : `Du ${fmtDay(s.start_date, { weekday: "long" })} au ${fmtDay(s.end_date, { weekday: "long" })}`}
          {s.transport ? ` · ${TRANSPORT_LABEL[s.transport]}` : ""}{carshareMissing(s) ? " · Communauto à réserver" : s.carshare ? " · Communauto réservée" : ""}</div></span>
      <ChevronRight size={18} className="muted" />
    </button>
  ))}</>;
}

// A stay away from home: where, when, who, how one goes there
export function StaySheet({ stay, day, onClose }: { stay?: Stay; day?: string; onClose: () => void }) {
  const members = useMembers(), all = useTable("stays");
  const places = [...new Set(all.filter((s) => s.kind === "visit").sort((a, b) => b.start_date.localeCompare(a.start_date)).map((s) => s.place))].slice(0, 6);
  const start = stay?.start_date ?? day ?? new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    kind: stay?.kind ?? "visit" as Stay["kind"], planned: stay?.status === "planned", place: stay?.place ?? places[0] ?? "", start, end: stay?.end_date ?? addDays(start, 2),
    who: stay?.member_ids ?? [] as string[], transport: stay?.transport ?? null as Transport | null, carshare: stay?.carshare ?? false,
    booked: stay?.carshare_booked ?? false, note: stay?.note ?? "",
  });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const save = (confirm = false) => {
    if (!f.place.trim()) return toast(f.kind === "vacation" ? "Où partez-vous ?" : "Où allez-vous ?");
    store.put("stays", { ...(stay || {}), kind: f.kind, status: f.planned && !confirm ? "planned" : "confirmed", place: f.place.trim(), start_date: f.start, end_date: f.end < f.start ? f.start : f.end, member_ids: f.who,
      transport: f.transport, carshare: f.transport === "car" && f.carshare, carshare_booked: f.transport === "car" && f.carshare && f.booked, note: f.note.trim() || null });
    toast(confirm ? "Confirmé" : stay ? "Enregistré" : f.planned ? "Proposé : les autres sont prévenus" : "Ajouté : les autres sont prévenus");
    onClose();
  };
  return (
    <Sheet title={stay ? stayLabel(stay) : "Absence"} onClose={onClose} footer={<>
      {stay && <button className="btn danger" onClick={() => { store.remove("stays", stay.id); onClose(); }}><Trash2 />Annuler</button>}
      {stay?.status === "planned" && <button className="btn" onClick={() => save(true)}>Confirmer</button>}
      <button className="btn primary" onClick={() => save()}>Enregistrer</button></>}>
      <Segmented value={f.kind} onChange={(kind) => set({ kind })} options={[{ value: "visit", label: "Séjour" }, { value: "vacation", label: "Vacances" }]} />
      <Field label={f.kind === "vacation" ? "Destination" : "Où"}>
        <input className="input" value={f.place} onChange={(e) => set({ place: e.target.value })} placeholder={f.kind === "vacation" ? "France, Mexique…" : "Chez qui, quelle ville"} />
      </Field>
      {f.kind === "visit" && places.length > 0 && <div className="chips">{places.map((p) => <button key={p} className={`chip small ${p === f.place ? "on" : ""}`} onClick={() => set({ place: p })}>{p}</button>)}</div>}
      <div className="row">
        <Field label="Du"><input className="input" type="date" value={f.start} onChange={(e) => set({ start: e.target.value, end: e.target.value > f.end ? e.target.value : f.end })} /></Field>
        <Field label="Au (inclus)"><input className="input" type="date" value={f.end} min={f.start} onChange={(e) => set({ end: e.target.value })} /></Field>
      </div>
      <label className="switch"><input type="checkbox" checked={f.planned} onChange={(e) => set({ planned: e.target.checked })} />À confirmer (on pense y aller)</label>
      <Field label="Pour quoi (s'affiche dans l'agenda)"><input className="input" value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="Un anniversaire, une fête…" /></Field>
      <Field label="Qui part"><MemberChips value={f.who} options={members.family} none="Toute la famille" onChange={(who) => set({ who })} /></Field>
      <Field label="Comment">
        <div className="chips">{(["car", "bus", "train", "plane", "other"] as Transport[]).map((t) => (
          <button key={t} className={`chip small ${f.transport === t ? "on" : ""}`} onClick={() => set({ transport: f.transport === t ? null : t })}>{TRANSPORT_LABEL[t]}</button>
        ))}</div>
      </Field>
      {f.transport === "car" && <>
        <label className="switch"><input type="checkbox" checked={f.carshare} onChange={(e) => set({ carshare: e.target.checked })} />Il faut réserver une Communauto</label>
        {f.carshare && <label className="switch"><input type="checkbox" checked={f.booked} onChange={(e) => set({ booked: e.target.checked })} /><Car size={18} />Communauto réservée</label>}
      </>}
      <p className="tiny muted">Les autres adultes sont prévenus quand on propose, confirme, déplace ou annule. Une fois confirmé, les tâches de ceux qui
        partent sont passées pendant ces jours ; si toute la famille part, il n'y a pas de repas à prévoir.</p>
    </Sheet>
  );
}

export type { Members };
