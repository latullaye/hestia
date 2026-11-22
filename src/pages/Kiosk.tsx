// The kitchen screen (landscape tablet, always on): the week at a glance, weather, shopping, today's chores, coming
// birthdays, countdowns, and the intercom. Everything is readable from across the room; a touch opens the detail.
import { CalendarDays, ChevronLeft, ChevronRight, CookingPot, ListChecks, Mic, ShoppingCart, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toggleOccurrence } from "../components/ChoreSheets";
import { ArrivalBanners, StaySheet } from "../components/Away";
import { EventSheet } from "../components/EventSheet";
import { TripView } from "./Trip";
import { Glyph } from "../components/icons";
import { IntercomPanel } from "../components/Intercom";
import { MealSheet } from "../components/MealSheet";
import { Avatar, Avatars, CheckBox, Sheet, SyncPill, toast } from "../components/ui";
import { BIRTHDAY_ICON, KIND_ICON, STAY_ICON, SLOT_LABEL, addDays, allAway, carshareMissing, stayLabel, stayOn, stayTitle, birthdaysOn, cap, countdownsFrom, eventsOn, fmtDay, inDays, mealName, mealsOn, occurrencesOn, partsIn, startTime, uncared, upcomingBirthdays } from "../lib/domain";
import { demoWeather } from "../lib/demo";
import { fullScreen, keepAwake } from "../lib/device";
import { useHousehold, useMembers, useNow, useTable } from "../lib/hooks";
import { useMealDrag } from "../lib/mealDrag";
import { useSwipe } from "../lib/swipe";
import { useSession } from "../lib/session";
import { store } from "../lib/store";
import type { CalEvent, MealSlot, ShoppingItem, Stay } from "../lib/types";
import { describe, useWeather } from "../lib/weather";
import { buy } from "./Shopping";

// The hours the week columns stand for: earlier events sit at the top, later ones at the bottom
const DAY_START = 7, DAY_END = 22;
// Spare columns kept on each side of the week, so that a swipe always has days to show
const SPARE = 7;
const IDLE_BACK_MS = 3 * 60 * 1000;

const WxIcon = ({ code }: { code: number }) => { const { Icon } = describe(code); return <Icon className="e" />; };

export function Kiosk() {
  const { tz, weather: place } = useHousehold(), members = useMembers(), { acting, setActing, demo, isKiosk } = useSession();
  const now = useNow(20_000), local = partsIn(now, tz), today = local.day;
  const events = useTable("events"), meals = useTable("meal_plan"), dishes = useTable("dishes"), occurrences = useTable("chore_occurrences");
  const items = useTable("shopping_items"), lists = useTable("shopping_lists"), birthdays = useTable("birthdays"), countdowns = useTable("countdowns");
  const rules = useTable("chores"), stays = useTable("stays");
  const [stay, setStay] = useState<Stay | null>(null);
  // In the week's columns, the chores of every single day would only be noise: they are in "Tâches du jour"
  const everyDay = useMemo(() => new Set(rules.filter((c) => c.schedule.type === "daily" && !c.schedule.every).map((c) => c.id)), [rules]);
  const weather = useWeather(place, tz, demo ? demoWeather() : null);
  const dishMap = useMemo(() => new Map(dishes.map((d) => [d.id, d])), [dishes]);
  const [offset, setOffset] = useState(0); // days from today: the first column shown
  // Swiping the week: it follows the finger and settles on a whole day; at most a week per throw
  const swipe = useSwipe({ base: SPARE, maxSteps: 7, onSettle: (steps) => setOffset((o) => o + steps) });
  const touched = useRef(Date.now());
  const [eventId, setEventId] = useState<string | null>(null);
  const [meal, setMeal] = useState<{ date: string; slot: MealSlot } | null>(null);
  const drag = useMealDrag({ instant: true });
  const [item, setItem] = useState<ShoppingItem | null>(null);
  const [tripId, setTripId] = useState<string | null>(null); // someone on the way home, shown on a map
  const trip = useTable("arrivals").find((a) => a.id === tripId);
  const [intercom, setIntercom] = useState(false);

  useEffect(() => keepAwake(), []);
  useEffect(() => fullScreen(isKiosk), [isKiosk]);
  // Back to this week after a while, so the screen never stays on another week
  // After a while without a touch, the week glides back to today
  const backToToday = useCallback((slow = true) => {
    // A week at a time at most (the spare columns), one glide after the other until today
    const glide = () => {
      const o = offsetRef.current;
      if (!o) return;
      const steps = Math.sign(o) * Math.min(Math.abs(o), SPARE);
      requestAnimationFrame(() => swipe.go(-steps, slow ? 700 + 60 * Math.abs(steps) : 320, slow ? "cubic-bezier(.45,0,.25,1)" : undefined, glide));
    };
    glide();
  }, [swipe.go]); // eslint-disable-line react-hooks/exhaustive-deps
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  useEffect(() => {
    const t = setInterval(() => { if (offsetRef.current && Date.now() - touched.current > IDLE_BACK_MS) backToToday(); }, 10_000);
    return () => clearInterval(t);
  }, [backToToday]);

  // The seven days shown, plus a week of spare columns on each side for the swipe
  const days = [...Array(7 + 2 * SPARE)].map((_, i) => addDays(today, offset - SPARE + i));
  const chores = occurrencesOn(occurrences, today, tz, today);
  const shopping = [...lists].filter((l) => l.show_on_kiosk).sort((a, b) => a.sort_order - b.sort_order)
    .map((l) => ({ l, mine: items.filter((i) => i.list_id === l.id && i.needed).sort((a, b) => a.name.localeCompare(b.name)) })).filter((x) => x.mine.length);
  const soon = upcomingBirthdays(birthdays, today).filter((b) => b.in > 0 && b.in <= 21 && b.kind !== "memorial");
  const cds = countdownsFrom(countdowns.filter((c) => c.show_on_kiosk), today).slice(0, 3);
  const w = weather && describe(weather.current.code, weather.current.isDay);
  const mealRow = (date: string, slot: MealSlot) => {
    const ms = mealsOn(meals, date, slot);
    return (
      <button className="m" {...drag.target(date, slot)} onClick={() => { if (!drag.justDropped()) setMeal({ date, slot }); }}>
        <b>{SLOT_LABEL[slot]}</b>
        {ms.length ? ms.map((m) => {
          const name = mealName(m, dishMap) || "Plat à choisir";
          const it = drag.item(m, name);
          return (
            <span key={m.id} {...it} className={`meal ${it.className}`}><Glyph name={KIND_ICON[m.kind]} />{name}
              {m.member_ids.length ? <> <Avatars ids={m.member_ids} members={members} size="sm" /></> : null}
              {m.cook_ids.length ? <> <Glyph name="chef-hat" /><Avatars ids={m.cook_ids} members={members} size="sm" /></> : null}</span>
          );
        }) : <span className="muted add">+</span>}
      </button>
    );
  };
  // Events sit roughly where they fall in the day: the free height is shared out in proportion to the hours between them
  const dayBody = (d: string, evs: CalEvent[]) => {
    const out: JSX.Element[] = [];
    let cursor = DAY_START;
    for (const e of evs.filter((x) => !x.all_day)) {
      const t = partsIn(Date.parse(e.starts_at), tz), h = t.day < d ? DAY_START : Math.min(DAY_END, Math.max(DAY_START, Number(t.time.slice(0, 2)) + Number(t.time.slice(3)) / 60));
      out.push(<span key={`gap-${e.id}`} className="kgap" style={{ flexGrow: Math.max(0, h - cursor) }} />);
      out.push(eventCard(e));
      cursor = Math.max(cursor, h);
    }
    out.push(<span key="gap-end" className="kgap" style={{ flexGrow: Math.max(0.5, DAY_END - cursor) }} />);
    return out;
  };
  const eventCard = (e: CalEvent) => {
    const alone = uncared(e, members.all);
    return (
      <button key={e.id} className={`kevent ${e.status} ${e.kind} ${alone.length ? "alert" : ""}`} onClick={() => setEventId(e.id)}>
        <span className="t">{e.status === "pending" && <Glyph name="hourglass" />}{e.all_day ? "Journée" : startTime(e, tz)}</span>
        <span className="n">{e.title}</span>
        {(e.participant_ids.length > 0 || alone.length > 0) && <span className="w"><Avatars ids={e.participant_ids} members={members} size="sm" />
          {e.caregiver_ids.length > 0 && <span className="care">avec <Avatars ids={e.caregiver_ids} members={members} size="sm" /></span>}
          {alone.length > 0 && <span className="tag warn">avec qui ?</span>}</span>}
      </button>
    );
  };

  return (
    <div className="kiosk" onPointerDownCapture={() => { touched.current = Date.now(); }}>
      <div className="kiosk-head">
        <span className="clock">{Number(local.time.slice(0, 2))} h {local.time.slice(3)}</span>
        <span className="date">{cap(fmtDay(today, { weekday: "long", month: "long" }))}</span>
        {weather && w && (
          <span className="kweather"><w.Icon className="e" /><span className="big">{Math.round(weather.current.temperature)}°</span>
            <span className="small"><b>{w.text}</b><br /><span className="muted">Ressenti {Math.round(weather.current.feels)}° · {place.label}</span></span></span>
        )}
        <span className="grow karrivals"><ArrivalBanners tz={tz} compact onOpen={(a) => setTripId(a.id)} /></span>
        <div className="kwho" title="Qui est là ?">
          <UserRound size={18} className="muted" />
          {members.family.filter((m) => !m.needs_caregiver).map((m) => (
            <button key={m.id} className={acting?.id === m.id ? "on" : ""} onClick={() => setActing(acting?.id === m.id ? null : m)} aria-label={m.name}><Avatar member={m} /></button>
          ))}
        </div>
        <SyncPill />
        <button className="icon-btn" onClick={() => swipe.go(-7, 420)} aria-label="Semaine précédente"><ChevronLeft /></button>
        {offset !== 0 && <button className="btn small" onClick={() => backToToday(false)}>Aujourd'hui</button>}
        <button className="icon-btn" onClick={() => swipe.go(7, 420)} aria-label="Semaine suivante"><ChevronRight /></button>
        {!isKiosk && <Link className="btn small" to="/">Quitter</Link>}
      </div>

      <div className="kiosk-week" {...swipe.viewport}>
        <div className="kiosk-track" ref={swipe.track}>
        {days.map((d) => {
          const wx = weather?.days.find((x) => x.date === d), bds = birthdaysOn(birthdays, d), evs = eventsOn(events, d, tz), s = stayOn(stays, d);
          const todo = d === today ? [] : occurrencesOn(occurrences, d, tz, today).filter((o) => !o.chore_id || !everyDay.has(o.chore_id));
          return (
            <div key={d} data-day={d} className={`kday ${d === today ? "today" : ""} ${d < today ? "past" : ""} ${s?.status === "confirmed" ? "away" : ""}`}>
              <div className="kday-head">
                <div><div className="dow">{fmtDay(d, { day: undefined, month: undefined })}</div><div className="dom">{Number(d.slice(8))}</div></div>
                {wx && <div className="wx"><WxIcon code={wx.code} />{Math.round(wx.max)}° / {Math.round(wx.min)}°</div>}
              </div>
              <div className="kday-body">
                {s && <button className={`kstay ${carshareMissing(s) ? "warn" : ""} ${s.status}`} onClick={() => setStay(s)}><Glyph name={STAY_ICON[s.kind]} />{stayTitle(s)}{s.status === "planned" ? " ?" : ""}</button>}
                {bds.map((b) => <div key={b.id} className="kbday"><Glyph name={BIRTHDAY_ICON[b.kind]} />{b.name}{b.year && b.kind !== "memorial" ? ` · ${Number(d.slice(0, 4)) - b.year} ans` : ""}</div>)}
                {evs.filter((e) => e.all_day).map(eventCard)}
                {dayBody(d, evs)}
                {todo.length > 0 && <div className="kday-chores">{todo.map((o) => <span key={o.id}><Glyph name={o.emoji || "list-checks"} />{o.title}</span>)}</div>}
              </div>
              {allAway(s, members.adults) && !mealsOn(meals, d).length
                ? <div className="kday-meals away"><span className="m"><b>Repas</b><span className="muted">{stayLabel(s!)}</span></span></div>
                : <div className="kday-meals">{mealRow(d, "lunch")}{mealRow(d, "dinner")}</div>}
            </div>
          );
        })}
        </div>
      </div>

      <div className="kiosk-bottom">
        <div className="kcard scroll">
          <h3><ListChecks size={15} />Tâches du jour</h3>
          {chores.map((o) => (
            <button key={o.id} className="kline" onClick={() => toggleOccurrence(o, acting?.id ?? null)}>
              <CheckBox on={o.status === "done"} /><span className={`grow ${o.status === "done" ? "strike" : ""}`}><Glyph name={o.emoji} />{o.title}</span><Avatars ids={o.status === "done" && o.done_by ? [o.done_by] : o.assignee_ids} members={members} size="sm" />
            </button>
          ))}
          {!chores.length && <span className="muted">Rien à faire.</span>}
        </div>
        <div className="kcard scroll">
          <h3><ShoppingCart size={15} />À acheter</h3>
          {shopping.map(({ l, mine }) => (
            <div key={l.id}><b className="small"><Glyph name={l.emoji} />{l.name}</b>
              <div className="chips" style={{ gap: 5, marginTop: 3 }}>{mine.map((i) => <button key={i.id} className="chip small" onClick={() => setItem(i)}>{i.name}{i.note ? ` (${i.note})` : ""}</button>)}</div></div>
          ))}
          {!shopping.length && <span className="muted">Rien à acheter.</span>}
        </div>
        <div className="kcard scroll">
          <h3><Glyph name="cake" />Bientôt</h3>
          {soon.slice(0, 6).map((b) => <div key={b.id} className="kline"><span className="grow">{b.name}{b.age != null ? ` · ${b.age} ans` : ""}</span><span className="tag">{inDays(b.in)}</span></div>)}
          {cds.map((c) => <div key={c.id} className="kcount"><span className="num">{c.in}</span><span>jour{c.in > 1 ? "s" : ""} avant <b><Glyph name={c.emoji} />{c.title}</b></span></div>)}
          {!soon.length && !cds.length && <span className="muted">Rien dans les 3 semaines.</span>}
        </div>
        <div className="kiosk-actions">
          <nav className="knav">
            <Link to="/calendar"><CalendarDays />Agenda</Link>
            <Link to="/meals"><CookingPot />Repas</Link>
            <Link to="/shopping"><ShoppingCart />Courses</Link>
            <Link to="/chores"><ListChecks />Tâches</Link>
          </nav>
          <button className="kiosk-intercom" onClick={() => setIntercom(true)}><Mic />Interphone</button>
        </div>
      </div>

      {eventId && <EventSheet id={eventId} onClose={() => setEventId(null)} />}
      {meal && <MealSheet {...meal} onClose={() => setMeal(null)} />}
      {stay && <StaySheet stay={stay} onClose={() => setStay(null)} />}
      {intercom && <IntercomPanel onClose={() => setIntercom(false)} />}
      {trip && <Sheet title="Sur le chemin" onClose={() => setTripId(null)}><TripView trip={trip} mapHeight={380} /></Sheet>}
      {item && (
        <Sheet title={item.name} onClose={() => setItem(null)}>
          <button className="btn ok" onClick={() => { buy(item); toast(`${item.name} : acheté`); setItem(null); }}>Acheté</button>
          <button className="btn" onClick={() => { store.put("shopping_items", { ...item, needed: false }); setItem(null); }}>Finalement, pas besoin</button>
        </Sheet>
      )}
    </div>
  );
}
