// The first screen: what matters today, for the person holding the phone.
import { Bell, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toggleOccurrence } from "../components/ChoreSheets";
import { EventSheet } from "../components/EventSheet";
import { MealSheet } from "../components/MealSheet";
import { Glyph } from "../components/icons";
import { ChoreRow, EventRow } from "../components/rows";
import { Avatars, SyncPill } from "../components/ui";
import { BIRTHDAY_ICON, KIND_ICON, SLOT_LABEL, addDays, cap, countdownsFrom, eventDays, eventsOn, fmtDay, inDays, mealName, mealsOn, occurrencesOn, plural, upcomingBirthdays } from "../lib/domain";
import { useHousehold, useMembers, useTable, useToday } from "../lib/hooks";
import { demoWeather } from "../lib/demo";
import { useSession } from "../lib/session";
import type { MealSlot } from "../lib/types";
import { describe, useWeather } from "../lib/weather";
import { inboxOf } from "./Inbox";

export function Today() {
  const { tz, weather: place } = useHousehold(), today = useToday(tz), members = useMembers(), { me, demo } = useSession();
  const events = useTable("events"), meals = useTable("meal_plan"), dishes = useTable("dishes"), occurrences = useTable("chore_occurrences");
  const items = useTable("shopping_items"), lists = useTable("shopping_lists"), birthdays = useTable("birthdays"), countdowns = useTable("countdowns");
  const notifications = useTable("notifications");
  const weather = useWeather(place, tz, demo ? demoWeather() : null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [meal, setMeal] = useState<{ date: string; slot: MealSlot } | null>(null);
  const dishMap = useMemo(() => new Map(dishes.map((d) => [d.id, d])), [dishes]);

  const todays = eventsOn(events, today, tz, true), tomorrow = eventsOn(events, addDays(today, 1), tz);
  const { toAnswer: toApprove, badge } = inboxOf(events, notifications, me);
  const chores = occurrencesOn(occurrences, today, tz, today);
  const mine = chores.filter((o) => !o.assignee_ids.length || (me && o.assignee_ids.includes(me.id)));
  const others = chores.filter((o) => !mine.includes(o));
  const soon = upcomingBirthdays(birthdays, today).filter((b) => b.in <= 21);
  const cds = countdownsFrom(countdowns, today).slice(0, 3);
  const w = weather && describe(weather.current.code, weather.current.isDay);
  const needed = lists.map((l) => ({ l, n: items.filter((i) => i.list_id === l.id && i.needed).length })).filter((x) => x.n);
  const mealLine = (slot: MealSlot) => {
    const ms = mealsOn(meals, today, slot);
    return (
      <button className="tap" onClick={() => setMeal({ date: today, slot })}>
        <span className="label" style={{ width: 58 }}>{SLOT_LABEL[slot]}</span>
        <span className="grow col" style={{ gap: 2 }}>{ms.length ? ms.map((m) => (
          <span key={m.id} className="meal-line"><Glyph name={KIND_ICON[m.kind]} />{mealName(m, dishMap) || <span className="muted">Plat à choisir</span>}
            {m.member_ids.length > 0 && <Avatars ids={m.member_ids} members={members} size="sm" />}
            {m.cook_ids.length > 0 && <span className="care"><Glyph name="chef-hat" /><Avatars ids={m.cook_ids} members={members} size="sm" /></span>}</span>
        )) : <span className="muted">À décider</span>}</span>
        <ChevronRight size={18} className="muted" />
      </button>
    );
  };

  return (
    <div className="page">
      <div className="top">
        <div className="grow"><h1>{cap(fmtDay(today, { weekday: "long", month: "long" }))}</h1>
          {weather && w && <div className="muted small row" style={{ gap: 5 }}><w.Icon size={17} /><span>{Math.round(weather.current.temperature)}° · {w.text} · {Math.round(weather.days[0]?.min)}° / {Math.round(weather.days[0]?.max)}°</span></div>}</div>
        <SyncPill />
        <Link className="icon-btn" to="/inbox" aria-label="Boîte de réception"><Bell />{badge > 0 && <span className="dot">{badge}</span>}</Link>
      </div>

      {toApprove.map((e) => (
        <button key={e.id} className="card warn row" onClick={() => setEventId(e.id)}>
          <span className="grow"><b><Glyph name="hourglass" />{members.name(e.created_by)} demande ton accord</b><div>{e.title} · {fmtDay(eventDays(e, tz).first)}</div></span><ChevronRight />
        </button>
      ))}

      <div className="section-title"><h2 className="grow">Aujourd'hui</h2><button className="btn small" onClick={() => setAdding(true)}><Plus />Événement</button></div>
      <div className="card flush list">
        {todays.length ? todays.map((e) => <EventRow key={e.id} event={e} tz={tz} members={members} onOpen={setEventId} />) : <div className="muted">Rien de prévu aujourd'hui.</div>}
        {tomorrow.length > 0 && <div className="head label">Demain</div>}
        {tomorrow.map((e) => <EventRow key={e.id} event={e} tz={tz} members={members} onOpen={setEventId} />)}
      </div>

      <div className="section-title"><h2 className="grow">Repas</h2><Link className="btn small" to="/meals">Semaine</Link></div>
      <div className="card flush list">{mealLine("lunch")}{mealLine("dinner")}</div>

      <div className="section-title"><h2 className="grow">Mes tâches</h2><Link className="btn small" to="/chores">Toutes</Link></div>
      <div className="card flush list">
        {mine.length ? mine.map((o) => <ChoreRow key={o.id} occurrence={o} today={today} members={members} onToggle={(x) => toggleOccurrence(x, me?.id ?? null)} />) : <div className="muted">Rien à faire.</div>}
        {others.length > 0 && <div className="head label">Les autres</div>}
        {others.map((o) => <ChoreRow key={o.id} occurrence={o} today={today} members={members} onToggle={(x) => toggleOccurrence(x, me?.id ?? null)} />)}
      </div>

      {needed.length > 0 && <>
        <div className="section-title"><h2>Courses</h2></div>
        <div className="card flush list">{needed.map(({ l, n }) => <Link key={l.id} to={`/shopping/${l.id}`} style={{ textDecoration: "none", color: "inherit" }}><span className="grow"><Glyph name={l.emoji} />{l.name}</span><span className="tag accent">{plural(n, "article")}</span><ChevronRight size={18} className="muted" /></Link>)}</div>
      </>}

      {soon.length > 0 && <>
        <div className="section-title"><h2 className="grow">Anniversaires à venir</h2><Link className="btn small" to="/birthdays">Année</Link></div>
        <div className="card flush list">{soon.map((b) => <div key={b.id}><span className="grow"><Glyph name={BIRTHDAY_ICON[b.kind]} />{b.name}{b.age != null && b.kind !== "memorial" ? ` · ${b.age} ans` : ""}{b.gift_ideas ? <span className="small muted"> · <Glyph name="gift" />{b.gift_ideas}</span> : null}</span><span className={`tag ${b.in <= 3 ? "warn" : ""}`}>{inDays(b.in)}</span></div>)}</div>
      </>}

      {cds.length > 0 && <div className="row wrap">{cds.map((c) => <div key={c.id} className="card grow"><span className="num" style={{ fontSize: "1.6rem", color: "var(--accent)" }}>{c.in}</span> <span className="muted">jour{c.in > 1 ? "s" : ""} avant</span> <b><Glyph name={c.emoji} />{c.title}</b></div>)}</div>}

      {eventId && <EventSheet id={eventId} onClose={() => setEventId(null)} />}
      {adding && <EventSheet day={today} onClose={() => setAdding(false)} />}
      {meal && <MealSheet {...meal} onClose={() => setMeal(null)} />}
    </div>
  );
}
