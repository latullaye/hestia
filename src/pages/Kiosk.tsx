// The kitchen screen (landscape tablet, always on): the week at a glance, weather, shopping, today's chores, coming
// birthdays, countdowns, and the intercom. Everything is readable from across the room; a touch opens the detail.
import { CalendarDays, ChevronLeft, ChevronRight, CookingPot, ListChecks, Mic, ShoppingCart, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toggleOccurrence } from "../components/ChoreSheets";
import { EventSheet } from "../components/EventSheet";
import { IntercomPanel } from "../components/Intercom";
import { MealSheet } from "../components/MealSheet";
import { Avatar, Avatars, CheckBox, Sheet, SyncPill, toast } from "../components/ui";
import { BIRTHDAY_EMOJI, KIND_EMOJI, addDays, birthdaysOn, cap, countdownsFrom, eventsOn, fmtDay, inDays, mealName, mealsOn, occurrencesOn, partsIn, startTime, uncared, upcomingBirthdays } from "../lib/domain";
import { demoWeather } from "../lib/demo";
import { keepAwake } from "../lib/device";
import { useHousehold, useMembers, useNow, useTable } from "../lib/hooks";
import { useSession } from "../lib/session";
import { store } from "../lib/store";
import type { MealSlot, ShoppingItem } from "../lib/types";
import { describe, useWeather } from "../lib/weather";
import { buy } from "./Shopping";

const WxIcon = ({ code }: { code: number }) => { const { Icon } = describe(code); return <Icon className="e" />; };

export function Kiosk() {
  const { tz, weather: place } = useHousehold(), members = useMembers(), { acting, setActing, demo, isKiosk } = useSession();
  const now = useNow(20_000), local = partsIn(now, tz), today = local.day;
  const events = useTable("events"), meals = useTable("meal_plan"), dishes = useTable("dishes"), occurrences = useTable("chore_occurrences");
  const items = useTable("shopping_items"), lists = useTable("shopping_lists"), birthdays = useTable("birthdays"), countdowns = useTable("countdowns");
  const rules = useTable("chores");
  // In the week's columns, the chores of every single day would only be noise: they are in "Tâches du jour"
  const everyDay = useMemo(() => new Set(rules.filter((c) => c.schedule.type === "daily" && !c.schedule.every).map((c) => c.id)), [rules]);
  const weather = useWeather(place, tz, demo ? demoWeather() : null);
  const dishMap = useMemo(() => new Map(dishes.map((d) => [d.id, d])), [dishes]);
  const [offset, setOffset] = useState(0); // weeks from the current one
  const [eventId, setEventId] = useState<string | null>(null);
  const [meal, setMeal] = useState<{ date: string; slot: MealSlot } | null>(null);
  const [item, setItem] = useState<ShoppingItem | null>(null);
  const [intercom, setIntercom] = useState(false);

  useEffect(() => keepAwake(), []);
  // Back to this week after a while, so the screen never stays on another week
  useEffect(() => { if (!offset) return; const t = setTimeout(() => setOffset(0), 3 * 60 * 1000); return () => clearTimeout(t); }, [offset]);

  const first = addDays(today, offset * 7);
  const days = [...Array(7)].map((_, i) => addDays(first, i));
  const chores = occurrencesOn(occurrences, today, tz, today);
  const shopping = [...lists].filter((l) => l.show_on_kiosk).sort((a, b) => a.sort_order - b.sort_order)
    .map((l) => ({ l, mine: items.filter((i) => i.list_id === l.id && i.needed).sort((a, b) => a.name.localeCompare(b.name)) })).filter((x) => x.mine.length);
  const soon = upcomingBirthdays(birthdays, today).filter((b) => b.in > 0 && b.in <= 21 && b.kind !== "memorial");
  const cds = countdownsFrom(countdowns.filter((c) => c.show_on_kiosk), today).slice(0, 3);
  const w = weather && describe(weather.current.code, weather.current.isDay);
  const mealRow = (date: string, slot: MealSlot) => {
    const ms = mealsOn(meals, date, slot);
    return (
      <span className="m"><b>{slot === "lunch" ? "Lunch" : "Souper"}</b>
        <span>{ms.length ? ms.map((m, i) => (
          <span key={m.id}>{i > 0 ? " · " : ""}{KIND_EMOJI[m.kind]} {mealName(m, dishMap) || "?"}{m.member_ids.length ? <> <Avatars ids={m.member_ids} members={members} size="sm" /></> : null}
            {m.cook_ids.length ? <> 👩‍🍳<Avatars ids={m.cook_ids} members={members} size="sm" /></> : null}</span>
        )) : <span className="muted">—</span>}</span>
      </span>
    );
  };

  return (
    <div className="kiosk">
      <div className="kiosk-main">
        <div className="kiosk-head">
          <span className="clock">{Number(local.time.slice(0, 2))} h {local.time.slice(3)}</span>
          <span className="date grow">{cap(fmtDay(today, { weekday: "long", month: "long" }))}</span>
          <div className="kwho" title="Qui est là ?">
            <UserRound size={18} className="muted" />
            {members.family.filter((m) => !m.needs_caregiver).map((m) => (
              <button key={m.id} className={acting?.id === m.id ? "on" : ""} onClick={() => setActing(acting?.id === m.id ? null : m)} aria-label={m.name}><Avatar member={m} /></button>
            ))}
          </div>
          <SyncPill />
          <button className="icon-btn" onClick={() => setOffset(offset - 1)} aria-label="Semaine précédente"><ChevronLeft /></button>
          {offset !== 0 && <button className="btn small" onClick={() => setOffset(0)}>Aujourd'hui</button>}
          <button className="icon-btn" onClick={() => setOffset(offset + 1)} aria-label="Semaine suivante"><ChevronRight /></button>
        </div>
        <div className="kiosk-week">
          {days.map((d) => {
            const wx = weather?.days.find((x) => x.date === d), bds = birthdaysOn(birthdays, d), evs = eventsOn(events, d, tz);
            const todo = d === today ? [] : occurrencesOn(occurrences, d, tz, today).filter((o) => !o.chore_id || !everyDay.has(o.chore_id));
            return (
              <div key={d} className={`kday ${d === today ? "today" : ""} ${d < today ? "past" : ""}`}>
                <div className="kday-head">
                  <div><div className="dow">{fmtDay(d, { day: undefined, month: undefined })}</div><div className="dom">{Number(d.slice(8))}</div></div>
                  {wx && <div className="wx"><WxIcon code={wx.code} />{Math.round(wx.max)}° / {Math.round(wx.min)}°</div>}
                </div>
                <div className="kday-body">
                  {bds.map((b) => <div key={b.id} className="kbday">{BIRTHDAY_EMOJI[b.kind]} {b.name}{b.year && b.kind !== "memorial" ? ` · ${Number(d.slice(0, 4)) - b.year} ans` : ""}</div>)}
                  {evs.map((e) => {
                    const alone = uncared(e, members.all);
                    return (
                      <button key={e.id} className={`kevent ${e.status} ${e.kind} ${alone.length ? "alert" : ""}`} onClick={() => setEventId(e.id)}>
                        <span className="t">{e.status === "pending" ? "⏳ " : ""}{e.all_day ? "Journée" : startTime(e, tz)}</span>
                        <span className="n">{e.title}</span>
                        {(e.participant_ids.length > 0 || alone.length > 0) && <span className="w"><Avatars ids={e.participant_ids} members={members} size="sm" />
                          {e.caregiver_ids.length > 0 && <span className="care">avec <Avatars ids={e.caregiver_ids} members={members} size="sm" /></span>}
                          {alone.length > 0 && <span className="tag danger">avec qui ?</span>}</span>}
                      </button>
                    );
                  })}
                  {!evs.length && !bds.length && <span className="muted small" style={{ padding: "2px 4px" }}>—</span>}
                  {todo.length > 0 && <div className="kday-chores">🧹 {todo.map((o) => o.title).join(" · ")}</div>}
                </div>
                <button className="kday-meals" onClick={() => setMeal({ date: d, slot: "dinner" })}>{mealRow(d, "lunch")}{mealRow(d, "dinner")}</button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="kiosk-side">
        {weather && w && (
          <div className="kcard">
            <div className="kweather"><w.Icon className="e" /><span className="big">{Math.round(weather.current.temperature)}°</span>
              <span className="small"><b>{w.text}</b><br /><span className="muted">Ressenti {Math.round(weather.current.feels)}° · {place.label}</span></span></div>
          </div>
        )}
        <div className="kcard scroll" style={{ flexGrow: 1.2 }}>
          <h3><ListChecks size={15} />Tâches du jour</h3>
          {chores.map((o) => (
            <button key={o.id} className="kline" onClick={() => toggleOccurrence(o, acting?.id ?? null)}>
              <CheckBox on={o.status === "done"} /><span className={`grow ${o.status === "done" ? "strike" : ""}`}>{o.emoji ? `${o.emoji} ` : ""}{o.title}</span><Avatars ids={o.status === "done" && o.done_by ? [o.done_by] : o.assignee_ids} members={members} size="sm" />
            </button>
          ))}
          {!chores.length && <span className="muted">Rien à faire. 🎉</span>}
        </div>
        <div className="kcard scroll" style={{ flexGrow: 1.4 }}>
          <h3><ShoppingCart size={15} />À acheter</h3>
          {shopping.map(({ l, mine }) => (
            <div key={l.id}><b className="small">{l.emoji} {l.name}</b>
              <div className="chips" style={{ gap: 5, marginTop: 3 }}>{mine.map((i) => <button key={i.id} className="chip small" onClick={() => setItem(i)}>{i.name}{i.note ? ` (${i.note})` : ""}</button>)}</div></div>
          ))}
          {!shopping.length && <span className="muted">Rien à acheter.</span>}
        </div>
        {(soon.length > 0 || cds.length > 0) && (
          <div className="kcard scroll">
            {soon.length > 0 && <><h3>🎂 Bientôt</h3>{soon.slice(0, 5).map((b) => <div key={b.id} className="kline"><span className="grow">{b.name}{b.age != null ? ` · ${b.age} ans` : ""}</span><span className="tag">{inDays(b.in)}</span></div>)}</>}
            {cds.map((c) => <div key={c.id} className="kcount"><span className="num">{c.in}</span><span>jour{c.in > 1 ? "s" : ""} avant <b>{c.emoji} {c.title}</b></span></div>)}
          </div>
        )}
        <div className="row">
          <Link className="icon-btn" to="/calendar" aria-label="Calendrier"><CalendarDays /></Link>
          <Link className="icon-btn" to="/meals" aria-label="Repas"><CookingPot /></Link>
          <Link className="icon-btn" to="/shopping" aria-label="Courses"><ShoppingCart /></Link>
          <Link className="icon-btn" to="/chores" aria-label="Tâches"><ListChecks /></Link>
          {!isKiosk && <Link className="btn small right" to="/">Quitter</Link>}
        </div>
        <button className="kiosk-intercom" onClick={() => setIntercom(true)}><Mic />Interphone</button>
      </div>

      {eventId && <EventSheet id={eventId} onClose={() => setEventId(null)} />}
      {meal && <MealSheet {...meal} onClose={() => setMeal(null)} />}
      {intercom && <IntercomPanel onClose={() => setIntercom(false)} />}
      {item && (
        <Sheet title={item.name} onClose={() => setItem(null)}>
          <button className="btn ok" onClick={() => { buy(item); toast(`${item.name} : acheté`); setItem(null); }}>Acheté ✓</button>
          <button className="btn" onClick={() => { store.put("shopping_items", { ...item, needed: false }); setItem(null); }}>Finalement, pas besoin</button>
        </Sheet>
      )}
    </div>
  );
}
