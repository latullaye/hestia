// "Je rentre": on the way home, tell the others when one will arrive. Reached from the app icon (a long press on Android
// shows the shortcut), or from Plus. The others get a notification; their home screen and the kiosk count the minutes.
import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { activeArrivals, hhmm, minutesLeft } from "../components/Away";
import { Field, MemberChips, SyncPill, toast } from "../components/ui";
import { useHousehold, useMembers, useNow, useTable } from "../lib/hooks";
import { useSession } from "../lib/session";
import { store } from "../lib/store";

const DEFAULT_MINUTES = 30;
const remembered = (key: string) => { try { return JSON.parse(localStorage.getItem(`hestia:leaving:${key}`) || "null"); } catch { return null; } };
const remember = (key: string, value: unknown) => localStorage.setItem(`hestia:leaving:${key}`, JSON.stringify(value));

export function Leaving() {
  const { tz } = useHousehold(), members = useMembers(), { me } = useSession(), navigate = useNavigate();
  const now = useNow(15_000);
  const trip = activeArrivals(useTable("arrivals"), now).find((a) => a.member_id === me?.id);
  const others = members.adults.filter((m) => m.id !== me?.id);
  const [mins, setMins] = useState(DEFAULT_MINUTES);
  const [from, setFrom] = useState<string>(remembered("from") ?? "du bureau");
  const [to, setTo] = useState<string[]>((remembered("to") as string[] | null)?.filter((id) => others.some((m) => m.id === id)) ?? others.map((m) => m.id));
  const eta = now + mins * 60_000;

  const send = () => {
    if (!me) return;
    if (!to.length) return toast("Choisis qui prévenir.");
    remember("from", from.trim()); remember("to", to);
    store.put("arrivals", { member_id: me.id, from_label: from.trim() || null, left_at: new Date().toISOString(), eta: new Date(eta).toISOString(), notify_ids: to, arrived_at: null });
    toast(`${members.names(to)} ${to.length > 1 ? "le savent" : "le sait"}`);
    navigate("/");
  };
  const shift = (by: number) => trip && store.put("arrivals", { ...trip, eta: new Date(Math.max(now, Date.parse(trip.eta) + by * 60_000)).toISOString() });

  if (trip) {
    const left = minutesLeft(trip.eta, now);
    return (
      <div className="page">
        <div className="top"><h1 className="grow">Je rentre</h1><SyncPill /></div>
        <div className="card leaving">
          <span className="label">Arrivée prévue</span>
          <div className="leaving-eta">{hhmm(trip.eta, tz)}</div>
          <p className="muted">{left > 0 ? `dans ${left} min` : "c'est l'heure"} · {members.names(trip.notify_ids.filter((id) => id !== me?.id), "personne")} {trip.notify_ids.length > 1 ? "le savent" : "le sait"}</p>
          <div className="row" style={{ justifyContent: "center" }}>
            <button className="btn" onClick={() => shift(-5)}><Minus />5 min</button>
            <button className="btn" onClick={() => shift(5)}><Plus />5 min</button>
            <button className="btn" onClick={() => shift(15)}><Plus />15 min</button>
          </div>
          <p className="tiny muted">Un changement de 5 minutes ou plus est envoyé.</p>
        </div>
        <button className="btn primary" onClick={() => { store.put("arrivals", { ...trip, arrived_at: new Date().toISOString() }); navigate("/"); }}>Je suis à la maison</button>
        <button className="btn" onClick={() => { store.remove("arrivals", trip.id); toast("Annulé"); }}>Finalement, je ne pars pas</button>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="top"><h1 className="grow">Je rentre</h1><SyncPill /></div>
      <div className="card leaving">
        <span className="label">Temps de trajet</span>
        <div className="leaving-eta">{mins} min</div>
        <p className="muted">Arrivée vers <b>{hhmm(eta, tz)}</b></p>
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn" disabled={mins <= 5} onClick={() => setMins(mins - 5)}><Minus />5</button>
          <button className="btn" onClick={() => setMins(mins + 5)}><Plus />5</button>
          <button className="btn" onClick={() => setMins(mins + 15)}><Plus />15</button>
        </div>
      </div>
      <Field label="Je pars"><input className="input" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="du bureau" /></Field>
      {others.length > 0 && <Field label="Prévenir"><MemberChips value={to} options={others} onChange={setTo} /></Field>}
      <button className="btn primary big" onClick={send}>Prévenir {members.names(to, "…")}</button>
      <p className="tiny muted">Sur Android, un appui long sur l'icône de Hestia ouvre directement cet écran (raccourci « Je rentre »).</p>
    </div>
  );
}
