// The first screen: what matters today, for the person holding the phone.
import { Bell, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toggleOccurrence } from "../components/ChoreSheets";
import { EventSheet } from "../components/EventSheet";
import { MealSheet } from "../components/MealSheet";
import { ChoreRow, EventRow } from "../components/rows";
import { Avatars, Sheet, SyncPill } from "../components/ui";
import { BIRTHDAY_EMOJI, KIND_EMOJI, addDays, cap, countdownsFrom, eventDays, eventsOn, fmtDay, inDays, mealName, mealsOn, occurrencesOn, plural, upcomingBirthdays } from "../lib/domain";
import { useHousehold, useMembers, useTable, useToday } from "../lib/hooks";
import { demoWeather } from "../lib/demo";
import { useSession } from "../lib/session";
import { store } from "../lib/store";
import type { MealSlot } from "../lib/types";
import { describe, useWeather } from "../lib/weather";

export function Today() {
  const { tz, weather: place } = useHousehold(), today = useToday(tz), members = useMembers(), { me, demo } = useSession();
  const events = useTable("events"), meals = useTable("meal_plan"), dishes = useTable("dishes"), occurrences = useTable("chore_occurrences");
  const items = useTable("shopping_items"), lists = useTable("shopping_lists"), birthdays = useTable("birthdays"), countdowns = useTable("countdowns");
  const notifications = useTable("notifications");
  const weather = useWeather(place, tz, demo ? demoWeather() : null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [meal, setMeal] = useState<{ date: string; slot: MealSlot } | null>(null);
  const [inbox, setInbox] = useState(false);
  const dishMap = useMemo(() => new Map(dishes.map((d) => [d.id, d])), [dishes]);

  const todays = eventsOn(events, today, tz, true), tomorrow = eventsOn(events, addDays(today, 1), tz);
  const toApprove = events.filter((e) => e.status === "pending" && !e.deleted_at && me && e.approver_ids.includes(me.id));
  const chores = occurrencesOn(occurrences, today, tz, today);
  const mine = chores.filter((o) => !o.assignee_ids.length || (me && o.assignee_ids.includes(me.id)));
  const others = chores.filter((o) => !mine.includes(o));
  const soon = upcomingBirthdays(birthdays, today).filter((b) => b.in <= 21);
  const cds = countdownsFrom(countdowns, today).slice(0, 3);
  const unread = notifications.filter((n) => me && n.member_id === me.id && !n.read_at).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const w = weather && describe(weather.current.code, weather.current.isDay);
  const needed = lists.map((l) => ({ l, n: items.filter((i) => i.list_id === l.id && i.needed).length })).filter((x) => x.n);
  const mealLine = (slot: MealSlot) => {
    const ms = mealsOn(meals, today, slot);
    return (
      <button className="tap" onClick={() => setMeal({ date: today, slot })}>
        <span className="label" style={{ width: 58 }}>{slot === "lunch" ? "Lunch" : "Souper"}</span>
        <span className="grow">{ms.length ? ms.map((m) => (
          <span key={m.id} className="meal-line">{KIND_EMOJI[m.kind]} {mealName(m, dishMap) || <span className="muted">Plat à choisir</span>}
            {m.member_ids.length > 0 && <Avatars ids={m.member_ids} members={members} size="sm" />}
            {m.cook_ids.length > 0 && <span className="care">👩‍🍳 <Avatars ids={m.cook_ids} members={members} size="sm" /></span>}</span>
        )) : <span className="muted">À décider</span>}</span>
        <ChevronRight size={18} className="muted" />
      </button>
    );
  };

  return (
    <div className="page">
      <div className="top">
        <div className="grow"><h1>{cap(fmtDay(today, { weekday: "long", month: "long" }))}</h1>
          {weather && w && <div className="muted small">{w.emoji} {Math.round(weather.current.temperature)}° · {w.text} · {Math.round(weather.days[0]?.min)}° / {Math.round(weather.days[0]?.max)}° · {place.label}</div>}</div>
        <SyncPill />
        <button className="icon-btn" onClick={() => setInbox(true)} aria-label="Notifications"><Bell />{unread.length > 0 && <span className="dot">{unread.length}</span>}</button>
      </div>

      {toApprove.map((e) => (
        <button key={e.id} className="card warn row" onClick={() => setEventId(e.id)}>
          <span className="grow"><b>⏳ {members.name(e.created_by)} demande ton accord</b><div>{e.title} · {fmtDay(eventDays(e, tz).first)}</div></span><ChevronRight />
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
        {mine.length ? mine.map((o) => <ChoreRow key={o.id} occurrence={o} today={today} members={members} onToggle={(x) => toggleOccurrence(x, me?.id ?? null)} />) : <div className="muted">Rien à faire. 🎉</div>}
        {others.length > 0 && <div className="head label">Les autres</div>}
        {others.map((o) => <ChoreRow key={o.id} occurrence={o} today={today} members={members} onToggle={(x) => toggleOccurrence(x, me?.id ?? null)} />)}
      </div>

      {needed.length > 0 && <>
        <div className="section-title"><h2>Courses</h2></div>
        <div className="card flush list">{needed.map(({ l, n }) => <Link key={l.id} to={`/shopping/${l.id}`} style={{ textDecoration: "none", color: "inherit" }}><span className="grow">{l.emoji} {l.name}</span><span className="tag accent">{plural(n, "article")}</span><ChevronRight size={18} className="muted" /></Link>)}</div>
      </>}

      {soon.length > 0 && <>
        <div className="section-title"><h2 className="grow">Anniversaires à venir</h2><Link className="btn small" to="/birthdays">Année</Link></div>
        <div className="card flush list">{soon.map((b) => <div key={b.id}><span className="grow">{BIRTHDAY_EMOJI[b.kind]} {b.name}{b.age != null && b.kind !== "memorial" ? ` · ${b.age} ans` : ""}{b.gift_ideas ? <span className="small muted"> · 🎁 {b.gift_ideas}</span> : null}</span><span className={`tag ${b.in <= 3 ? "warn" : ""}`}>{inDays(b.in)}</span></div>)}</div>
      </>}

      {cds.length > 0 && <div className="row wrap">{cds.map((c) => <div key={c.id} className="card grow"><span className="num" style={{ fontSize: "1.6rem", color: "var(--accent)" }}>{c.in}</span> <span className="muted">jour{c.in > 1 ? "s" : ""} avant</span> <b>{c.emoji} {c.title}</b></div>)}</div>}

      {eventId && <EventSheet id={eventId} onClose={() => setEventId(null)} />}
      {adding && <EventSheet day={today} onClose={() => setAdding(false)} />}
      {meal && <MealSheet {...meal} onClose={() => setMeal(null)} />}
      {inbox && (
        <Sheet title="Notifications" onClose={() => { unread.forEach((n) => store.put("notifications", { ...n, read_at: new Date().toISOString() })); setInbox(false); }}>
          {notifications.filter((n) => me && n.member_id === me.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 40).map((n) => (
            <a key={n.id} className="card" href={n.url || "#/"} onClick={() => setInbox(false)} style={{ textDecoration: "none", color: "inherit", borderColor: n.read_at ? undefined : "var(--accent)" }}>
              <b>{n.title}</b><div style={{ whiteSpace: "pre-wrap" }}>{n.body}</div><div className="tiny muted">{new Date(n.created_at).toLocaleString("fr-CA", { timeZone: tz, dateStyle: "medium", timeStyle: "short" })}</div>
            </a>
          ))}
          {!notifications.some((n) => me && n.member_id === me.id) && <p className="muted">Aucune notification.</p>}
        </Sheet>
      )}
    </div>
  );
}
