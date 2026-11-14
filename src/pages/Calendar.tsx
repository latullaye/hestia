// The family's agenda: a week strip to move around, then the days one under the other.
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { EventSheet } from "../components/EventSheet";
import { EventRow } from "../components/rows";
import { SyncPill } from "../components/ui";
import { BIRTHDAY_EMOJI, addDays, birthdaysOn, cap, dayTitle, eventsOn, fmtDay, partsIn } from "../lib/domain";
import { useHousehold, useMembers, useTable, useToday } from "../lib/hooks";

const monday = (day: string) => addDays(day, 1 - partsIn(Date.parse(day + "T12:00:00Z"), "UTC").dow);

export function Calendar() {
  const { tz } = useHousehold(), today = useToday(tz), members = useMembers();
  const events = useTable("events"), birthdays = useTable("birthdays");
  const params = useParams(), navigate = useNavigate();
  const [selected, setSelected] = useState(today);
  const [adding, setAdding] = useState(false);
  const weekStart = monday(selected);
  const week = [...Array(7)].map((_, i) => addDays(weekStart, i));
  const days = [...Array(21)].map((_, i) => addDays(selected, i));
  const openEvent = (id: string) => navigate(`/event/${id}`);

  return (
    <div className="page">
      <div className="top"><h1>{cap(fmtDay(weekStart, { weekday: undefined, day: undefined, month: "long", year: "numeric" }))}</h1><SyncPill />
        <button className="icon-btn" onClick={() => setAdding(true)} aria-label="Ajouter un événement"><Plus /></button></div>
      <div className="card row" style={{ padding: 8 }}>
        <button className="icon-btn plain" onClick={() => setSelected(addDays(selected, -7))} aria-label="Semaine précédente"><ChevronLeft /></button>
        <div className="weekstrip grow">
          {week.map((d) => (
            <button key={d} className={`${d === selected ? "on" : ""} ${d === today ? "today" : ""} ${eventsOn(events, d, tz).length ? "has" : ""}`} onClick={() => setSelected(d)}>
              {fmtDay(d, { day: undefined, month: undefined }).slice(0, 3)}<b>{Number(d.slice(8))}</b><i />
            </button>
          ))}
        </div>
        <button className="icon-btn plain" onClick={() => setSelected(addDays(selected, 7))} aria-label="Semaine suivante"><ChevronRight /></button>
      </div>
      {selected !== today && <button className="btn small" style={{ alignSelf: "flex-start" }} onClick={() => setSelected(today)}>Revenir à aujourd'hui</button>}

      {days.map((d) => {
        const evs = eventsOn(events, d, tz, true), bds = birthdaysOn(birthdays, d);
        if (!evs.length && !bds.length && d !== selected) return null;
        return (
          <div key={d} className="col" style={{ gap: 6 }}>
            <div className="section-title"><h2>{dayTitle(d, today)}</h2>{dayTitle(d, today) !== cap(fmtDay(d, { weekday: "long", month: "long" })) && <span className="muted small">{fmtDay(d)}</span>}</div>
            <div className="card flush list">
              {bds.map((b) => <div key={b.id}>{BIRTHDAY_EMOJI[b.kind]} <span className="grow">{b.kind === "memorial" ? "En mémoire de " : ""}{b.name}{b.year && b.kind !== "memorial" ? ` · ${Number(d.slice(0, 4)) - b.year} ans` : ""}</span></div>)}
              {evs.map((e) => <EventRow key={e.id} event={e} tz={tz} members={members} onOpen={openEvent} />)}
              {!evs.length && !bds.length && <div className="muted">Rien de prévu.</div>}
            </div>
          </div>
        );
      })}
      {params.id && <EventSheet id={params.id} onClose={() => navigate("/calendar")} />}
      {adding && <EventSheet day={selected} onClose={() => setAdding(false)} />}
    </div>
  );
}
