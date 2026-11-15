// The family's agenda: a week strip to move around, then the days one under the other.
import { ChevronLeft, ChevronRight, Luggage, Plus } from "lucide-react";
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { StaySheet } from "../components/Away";
import { EventSheet } from "../components/EventSheet";
import { Glyph } from "../components/icons";
import { EventRow } from "../components/rows";
import { SyncPill } from "../components/ui";
import { BIRTHDAY_ICON, STAY_ICON, TRANSPORT_LABEL, addDays, birthdaysOn, cap, carshareMissing, dayTitle, eventsOn, fmtDay, partsIn, stayOn, stayTitle } from "../lib/domain";
import type { Stay } from "../lib/types";
import { useHousehold, useMembers, useTable, useToday } from "../lib/hooks";
import { useSwipe } from "../lib/swipe";

const monday = (day: string) => addDays(day, 1 - partsIn(Date.parse(day + "T12:00:00Z"), "UTC").dow);

export function Calendar() {
  const { tz } = useHousehold(), today = useToday(tz), members = useMembers();
  const events = useTable("events"), birthdays = useTable("birthdays"), stays = useTable("stays");
  const [stay, setStay] = useState<Stay | "new" | null>(null);
  const params = useParams(), navigate = useNavigate();
  const [selected, setSelected] = useState(today);
  const [adding, setAdding] = useState(false);
  const weekStart = monday(selected);
  const week = [...Array(7)].map((_, i) => addDays(weekStart, i));
  const days = [...Array(21)].map((_, i) => addDays(selected, i));
  const openEvent = (id: string) => navigate(`/event/${id}`);
  // Swiping the week strip: to the left, the next week; to the right, the one before
  const swipe = useSwipe({ base: 1, maxSteps: 1, onSettle: (steps) => setSelected((s) => addDays(s, steps * 7)) });

  return (
    <div className="page">
      <div className="top"><h1>{cap(fmtDay(weekStart, { weekday: undefined, day: undefined, month: "long", year: "numeric" }))}</h1><SyncPill />
        <button className="icon-btn" onClick={() => setStay("new")} aria-label="Ajouter une absence (séjour, vacances)"><Luggage /></button>
        <button className="icon-btn" onClick={() => setAdding(true)} aria-label="Ajouter un événement"><Plus /></button></div>
      <div className="card row" style={{ padding: 8 }}>
        <button className="icon-btn plain" onClick={() => swipe.go(-1)} aria-label="Semaine précédente"><ChevronLeft /></button>
        <div className="swipe-viewport grow" {...swipe.viewport}>
          <div className="swipe-track" ref={swipe.track}>
            {[-7, 0, 7].map((shift) => (
              <div key={shift} className="weekstrip">
                {week.map((w) => addDays(w, shift)).map((d) => (
                  <button key={d} className={`${d === selected ? "on" : ""} ${d === today ? "today" : ""} ${eventsOn(events, d, tz).length ? "has" : ""} ${stayOn(stays, d) ? "away" : ""}`} onClick={() => setSelected(d)}>
                    {fmtDay(d, { day: undefined, month: undefined }).slice(0, 3)}<b>{Number(d.slice(8))}</b><i />
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
        <button className="icon-btn plain" onClick={() => swipe.go(1)} aria-label="Semaine suivante"><ChevronRight /></button>
      </div>
      {selected !== today && <button className="btn small" style={{ alignSelf: "flex-start" }} onClick={() => setSelected(today)}>Revenir à aujourd'hui</button>}

      {days.map((d) => {
        const evs = eventsOn(events, d, tz, true), bds = birthdaysOn(birthdays, d), s = stayOn(stays, d);
        if (!evs.length && !bds.length && !s && d !== selected) return null;
        return (
          <div key={d} className="col" style={{ gap: 6 }}>
            <div className="section-title"><h2>{dayTitle(d, today)}</h2>{dayTitle(d, today) !== cap(fmtDay(d, { weekday: "long", month: "long" })) && <span className="muted small">{fmtDay(d)}</span>}</div>
            <div className="card flush list">
              {s && <button className={`stay-row ${carshareMissing(s) ? "warn" : ""} ${s.status}`} onClick={() => setStay(s)}><Glyph name={STAY_ICON[s.kind]} />
                <span className="grow"><b>{stayTitle(s)}</b>{s.status === "planned" && <span className="tag warn" style={{ marginLeft: 6 }}>À confirmer</span>}{s.member_ids.length ? <span className="small muted"> · {members.names(s.member_ids)}</span> : null}
                  <span className="small muted">{d === s.start_date && s.transport ? ` · départ en ${TRANSPORT_LABEL[s.transport].toLowerCase()}` : ""}{d === s.start_date && carshareMissing(s) ? " · Communauto à réserver" : ""}</span></span></button>}
              {bds.map((b) => <div key={b.id}><Glyph name={BIRTHDAY_ICON[b.kind]} /><span className="grow">{b.kind === "memorial" ? "En mémoire de " : ""}{b.name}{b.year && b.kind !== "memorial" ? ` · ${Number(d.slice(0, 4)) - b.year} ans` : ""}</span></div>)}
              {evs.map((e) => <EventRow key={e.id} event={e} tz={tz} members={members} onOpen={openEvent} />)}
              {!evs.length && !bds.length && !s && <div className="muted">Rien de prévu.</div>}
            </div>
          </div>
        );
      })}
      {params.id && <EventSheet id={params.id} onClose={() => navigate("/calendar")} />}
      {adding && <EventSheet day={selected} onClose={() => setAdding(false)} />}
      {stay && <StaySheet stay={stay === "new" ? undefined : stay} day={selected} onClose={() => setStay(null)} />}
    </div>
  );
}
