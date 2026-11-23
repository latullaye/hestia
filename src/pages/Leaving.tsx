// "Je rentre": on the way home, tell the others when one will arrive. Reached from the app icon (a long press on Android
// shows the shortcut), or from Plus. The others get a notification; their home screen and the kiosk count the minutes.
//
// The time is always a round one (17 h 30): the usual trip, rounded up to the next 5 minutes, then moved 5 minutes at a
// time. The others are told 45 seconds after the last change (the server waits), with a word if there is one. While
// the trip lasts, where I am is shared if I chose to (components/TripSharer.tsx, or OwnTracks with the phone locked).
import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { activeArrivals, hhmm, minutesLeft } from "../components/Away";
import { useOwnTracks } from "../components/OwnTracks";
import { isSharing, setSharing } from "../components/TripSharer";
import { TripMap } from "../components/TripMap";
import { Field, MemberChips, SyncPill, toast } from "../components/ui";
import { useHousehold, useMembers, useNow, useTable } from "../lib/hooks";
import { useSession } from "../lib/session";
import { store } from "../lib/store";
import { type Point, ago, fmtDistance, homeOf, shiftSlot, slotAfter, useBikeRoute } from "../lib/trip";
import type { Arrival } from "../lib/types";

const USUAL_MINUTES = 25;
const remembered = (key: string) => { try { return JSON.parse(localStorage.getItem(`hestia:leaving:${key}`) || "null"); } catch { return null; } };
const remember = (key: string, value: unknown) => localStorage.setItem(`hestia:leaving:${key}`, JSON.stringify(value));
const inMinutes = (eta: number, now: number) => Math.max(0, Math.round((eta - now) / 60_000));

function Stepper({ onMinus, onPlus, minusOff }: { onMinus: () => void; onPlus: (by: number) => void; minusOff?: boolean }) {
  return (
    <div className="row" style={{ justifyContent: "center" }}>
      <button className="btn" disabled={minusOff} onClick={onMinus}><Minus />5 min</button>
      <button className="btn" onClick={() => onPlus(1)}><Plus />5 min</button>
      <button className="btn" onClick={() => onPlus(3)}><Plus />15 min</button>
    </div>
  );
}

function OnTheWay({ trip }: { trip: Arrival }) {
  const household = useHousehold(), members = useMembers(), navigate = useNavigate(), now = useNow(10_000);
  const [note, setNote] = useState(trip.note ?? "");
  const [sharing, setOn] = useState(isSharing(trip.id));
  const ownTracks = useOwnTracks(useSession().demo);
  const loc = useTable("arrival_locations").find((l) => l.id === trip.id);
  const home = homeOf(household);
  const me: Point | null = loc?.lat != null && loc?.lng != null ? { lat: loc.lat, lng: loc.lng } : null;
  const route = useBikeRoute(me, home);
  const eta = Date.parse(trip.eta), left = minutesLeft(trip.eta, now);
  const told = members.names(trip.notify_ids.filter((id) => id !== trip.member_id), "personne");
  const move = (steps: number) => store.put("arrivals", { ...trip, eta: new Date(shiftSlot(eta, steps, now)).toISOString() });
  const saveNote = () => { if ((trip.note ?? "") !== note.trim()) { store.put("arrivals", { ...trip, note: note.trim() || null }); toast("Mot envoyé dans 45 s"); } };
  const share = (on: boolean) => { setSharing(trip.id, on); setOn(on); };

  return (
    <>
      <div className="card leaving">
        <span className="label">J'arrive vers</span>
        <div className="leaving-eta">{hhmm(trip.eta, household.tz)}</div>
        <p className="muted" style={{ margin: 0 }}>{left > 0 ? `dans ${left} min` : "c'est l'heure"} · {told} {trip.notify_ids.filter((id) => id !== trip.member_id).length > 1 ? "le savent" : "le sait"}</p>
        <Stepper onMinus={() => move(-1)} onPlus={move} minusOff={shiftSlot(eta, -1, now) === eta} />
        <p className="tiny muted" style={{ margin: 0 }}>Les changements partent 45 secondes après le dernier : ajuste tranquillement.</p>
      </div>
      <Field label="Un mot pour eux">
        <div className="row">
          <input className="input grow" value={note} maxLength={140} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveNote()}
            placeholder="Je passe chercher les pizzas" enterKeyHint="send" />
          <button className="btn" disabled={(trip.note ?? "") === note.trim()} onClick={saveNote}>Envoyer</button>
        </div>
      </Field>
      <div className="card col">
        <label className="pref-row">
          <span className="grow col" style={{ gap: 1 }}><span>Partager ma position</span>
            <span className="small muted">{members.names(trip.notify_ids.filter((id) => id !== trip.member_id), "Les autres")} et le kiosque voient où tu es, jusqu'à la maison.</span></span>
          <input type="checkbox" role="switch" className="toggle" checked={sharing} onChange={(e) => share(e.target.checked)} aria-label="Partager ma position" />
        </label>
        {sharing && <>
          <TripMap rider={me} home={home} route={route} height={220} />
          <span className="small muted">
            {loc?.located_at ? `Envoyée ${ago(loc.located_at, now)}${loc.via === "owntracks" ? " par OwnTracks" : ""}` : "En attente de ta position…"}
            {route && !route.straight ? ` · ${fmtDistance(route.meters)} jusqu'à la maison` : ""}
          </span>
          <span className="tiny muted">
            {ownTracks === "used" ? "OwnTracks l'envoie même téléphone verrouillé : tu peux fermer Hestia."
              : ownTracks === "set" ? "OwnTracks n'a encore rien envoyé : ouvre-le pour vérifier. D'ici là, garde Hestia ouverte."
              : "Garde Hestia ouverte (l'écran reste allumé). Téléphone verrouillé : seule OwnTracks peut l'envoyer (Réglages)."}
            {!home && " La maison n'est pas encore placée : Réglages › La maison."}</span>
        </>}
      </div>
      <button className="btn primary" onClick={() => { store.put("arrivals", { ...trip, arrived_at: new Date().toISOString() }); navigate("/"); }}>Je suis à la maison</button>
      <button className="btn" onClick={() => { store.remove("arrivals", trip.id); toast("Annulé"); }}>Finalement, je ne pars pas</button>
    </>
  );
}

export function Leaving() {
  const { tz } = useHousehold(), members = useMembers(), { me } = useSession();
  const now = useNow(15_000);
  const trip = activeArrivals(useTable("arrivals"), now).find((a) => a.member_id === me?.id);
  const others = members.adults.filter((m) => m.id !== me?.id);
  const [usual, setUsual] = useState<number>(remembered("usual") ?? USUAL_MINUTES);
  const [chosen, setChosen] = useState<number | null>(null); // a time moved by hand; otherwise the usual trip from now
  const [from, setFrom] = useState<string>(remembered("from") ?? "du bureau");
  const [to, setTo] = useState<string[]>((remembered("to") as string[] | null)?.filter((id) => others.some((m) => m.id === id)) ?? others.map((m) => m.id));
  const [note, setNote] = useState("");
  const [share, setShare] = useState<boolean>(remembered("share") ?? true);
  const eta = Math.max(chosen ?? slotAfter(now, usual), slotAfter(now, 1));
  const changeUsual = (by: number) => { const u = Math.min(120, Math.max(5, usual + by)); setUsual(u); remember("usual", u); setChosen(null); };

  const send = () => {
    if (!me) return;
    if (!to.length) return toast("Choisis qui prévenir.");
    remember("from", from.trim()); remember("to", to); remember("share", share);
    const row = store.put("arrivals", { member_id: me.id, from_label: from.trim() || null, left_at: new Date().toISOString(), eta: new Date(eta).toISOString(),
      notify_ids: to, arrived_at: null, note: note.trim() || null });
    setSharing(row.id, share);
    toast(`${members.names(to)} ${to.length > 1 ? "le sauront" : "le saura"} dans 45 s`);
  };

  return (
    <div className="page">
      <div className="top"><h1 className="grow">Je rentre</h1><SyncPill /></div>
      {trip ? <OnTheWay trip={trip} /> : <>
        <div className="card leaving">
          <span className="label">J'arrive vers</span>
          <div className="leaving-eta">{hhmm(eta, tz)}</div>
          <p className="muted" style={{ margin: 0 }}>dans {inMinutes(eta, now)} min</p>
          <Stepper onMinus={() => setChosen(shiftSlot(eta, -1, now))} onPlus={(n) => setChosen(shiftSlot(eta, n, now))} minusOff={shiftSlot(eta, -1, now) === eta} />
          <p className="tiny muted" style={{ margin: 0 }}>
            Trajet habituel : {usual} min{" "}
            <button className="link" onClick={() => changeUsual(-5)} aria-label="Trajet habituel plus court">−5</button>{" "}
            <button className="link" onClick={() => changeUsual(5)} aria-label="Trajet habituel plus long">+5</button>
          </p>
        </div>
        <Field label="Je pars"><input className="input" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="du bureau" /></Field>
        <Field label="Un mot (facultatif)"><input className="input" value={note} maxLength={140} onChange={(e) => setNote(e.target.value)} placeholder="Je passe chercher les pizzas" /></Field>
        {others.length > 0 && <Field label="Prévenir"><MemberChips value={to} options={others} onChange={setTo} /></Field>}
        <label className="pref-row card" style={{ padding: "8px 14px" }}>
          <span className="grow col" style={{ gap: 1 }}><span>Partager ma position</span><span className="small muted">Pendant le trajet seulement.</span></span>
          <input type="checkbox" role="switch" className="toggle" checked={share} onChange={(e) => setShare(e.target.checked)} aria-label="Partager ma position" />
        </label>
        <button className="btn primary big" onClick={send}>Prévenir {members.names(to, "…")}</button>
        <p className="tiny muted">Sur Android, un appui long sur l'icône de Hestia ouvre directement cet écran (raccourci « Je rentre »).</p>
      </>}
    </div>
  );
}
