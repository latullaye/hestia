// The TV poster: the days ahead as one still picture, for the Chromecast's ambient screen (a Google Photos album).
// Laid out at 1920 × 1080 and taken at twice the scale: a 3840 × 2160 (4K) picture. No clock and no weather: the TV
// draws them itself in the bottom-right corner, which is left empty. Read from across the room, so large type.
//   #/poster?v=semaine | aujourdhui | epure    (three looks, to choose from)
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Glyph, Wordmark } from "../components/icons";
import { hhmm } from "../components/Away";
import { Avatars } from "../components/ui";
import { BIRTHDAY_ICON, KIND_ICON, STAY_ICON, addDays, birthdaysOn, cap, countdownsFrom, eventsOn, fmtDay, mealName, mealsOn, occurrencesOn,
  partsIn, startTime, stayLabel, stayOn, upcomingBirthdays } from "../lib/domain";
import { useHousehold, useMembers, useTable, useToday } from "../lib/hooks";
import type { CalEvent, Meal } from "../lib/types";

type Variant = "semaine" | "aujourdhui" | "epure";

function useDays(n: number) {
  const { tz } = useHousehold(), today = useToday(tz), members = useMembers();
  const events = useTable("events"), meals = useTable("meal_plan"), dishes = useTable("dishes"), occurrences = useTable("chore_occurrences");
  const birthdaysAll = useTable("birthdays"), countdowns = useTable("countdowns"), stays = useTable("stays");
  const dishMap = new Map(dishes.map((d) => [d.id, d]));
  const days = [...Array(n)].map((_, i) => {
    const d = addDays(today, i);
    return {
      d, i,
      events: eventsOn(events, d, tz).filter((e) => e.kind !== "birthday"),
      birthdays: birthdaysOn(birthdaysAll, d).filter((b) => b.kind !== "memorial"),
      stay: stayOn(stays, d),
      lunch: mealsOn(meals, d, "lunch"), dinner: mealsOn(meals, d, "dinner"),
    };
  });
  // The chores worth a reminder: not those done every single day (nobody forgets the dishes), the others
  const rules = useTable("chores");
  const everyDay = new Set(rules.filter((c) => c.schedule.type === "daily" && (c.schedule.every ?? 1) <= 1).map((c) => c.id));
  const chores = occurrencesOn(occurrences, today, tz, today).filter((o) => o.status === "todo" && !(o.chore_id && everyDay.has(o.chore_id)));
  const soon = [
    ...upcomingBirthdays(birthdaysAll, today).filter((b) => b.in >= n && b.in <= 30 && b.kind !== "memorial")
      .map((b) => ({ key: b.id, icon: BIRTHDAY_ICON[b.kind] ?? "cake", text: shortName(b.name), in: b.in })),
  ].sort((a, b) => a.in - b.in).slice(0, 4);
  // Birthdays from today on, for "Aujourd'hui en grand", where they are a quiet line of their own
  const birthdays = upcomingBirthdays(birthdaysAll, today).filter((b) => b.in <= 21 && b.kind !== "memorial").slice(0, 4)
    .map((b) => ({ key: b.id, text: shortName(b.name), in: b.in }));
  // The countdowns shown on the kiosk (Noël…) are at the top, beside the date
  const counts = countdownsFrom(countdowns.filter((c) => c.show_on_kiosk), today).slice(0, 2)
    .map((c) => ({ key: c.id, icon: c.emoji || "calendar", text: c.title, in: c.in }));
  return { tz, today, members, days, chores, soon, birthdays, counts, dish: (m: Meal) => mealName(m, dishMap) || "Plat à choisir" };
}

// "Camille Dubois-Laferrière" → "Camille D.": enough to know who, short enough for a line of the poster
const shortName = (name: string) => { const [first, second] = name.trim().split(/\s+/); return second ? `${first} ${second[0]}.` : first; };
const dayName = (d: string, i: number) => (i === 0 ? "Aujourd'hui" : i === 1 ? "Demain" : cap(fmtDay(d, { weekday: "long", day: undefined, month: undefined })));
const dayDate = (d: string) => fmtDay(d, { weekday: undefined, day: "numeric", month: "long" });

type Count = { key: string; icon: string; text: string; in: number };
function Head({ today, small, counts = [] }: { today: string; small?: boolean; counts?: Count[] }) {
  return (
    <header className="p-head">
      <span className="p-logo"><Wordmark height={small ? 56 : 72} /></span>
      <span className="p-head-right">
        <span className="p-date">{cap(fmtDay(today, { weekday: "long", day: "numeric", month: "long" }))}</span>
        {counts.map((c) => <span key={c.key} className="p-count"><Glyph name={c.icon} />{c.text}<b>{c.in === 0 ? "aujourd'hui" : c.in === 1 ? "demain" : `dans ${c.in} jours`}</b></span>)}
      </span>
    </header>
  );
}

// Who it is for (their badges), and with whom when a child goes with an adult: "Léo avec Sam"
function Who({ e, members }: { e: CalEvent; members: ReturnType<typeof useMembers> }) {
  if (!e.participant_ids.length && !e.caregiver_ids.length) return null;
  return (
    <span className="p-who">
      {e.participant_ids.length > 0 && <Avatars ids={e.participant_ids} members={members} size="sm" />}
      {e.caregiver_ids.length > 0 && <><em>avec</em><Avatars ids={e.caregiver_ids} members={members} size="sm" /></>}
    </span>
  );
}

function EventLine({ e, tz, members }: { e: CalEvent; tz: string; members: ReturnType<typeof useMembers> }) {
  return (
    <div className={`p-event ${e.status}`}>
      <span className="p-time">{e.status === "pending" && <Glyph name="hourglass" />}{e.all_day ? "Journée" : startTime(e, tz)}</span>
      <span className="p-title">{e.title}</span>
      <Who e={e} members={members} />
    </div>
  );
}

// For whom a dish is (nothing when it is for everyone), and who cooks it (a chef's hat, then their badge): as on the kiosk
function MealWho({ m }: { m: Meal }) {
  const members = useMembers();
  if (!m.member_ids.length && !m.cook_ids.length) return null;
  return (
    <span className="p-who">
      {m.member_ids.length > 0 && <Avatars ids={m.member_ids} members={members} size="sm" />}
      {m.cook_ids.length > 0 && <span className="p-cook"><Glyph name="chef-hat" /><Avatars ids={m.cook_ids} members={members} size="sm" /></span>}
    </span>
  );
}

function Meals({ list, dish, label }: { list: Meal[]; dish: (m: Meal) => string; label: string }) {
  if (!list.length) return null;
  return (
    <div className="p-meal"><span className="p-meal-label">{label}</span>
      {list.map((m) => <span key={m.id} className="p-dish"><Glyph name={KIND_ICON[m.kind]} />{dish(m)}<MealWho m={m} /></span>)}</div>
  );
}
// The dishes of a meal on one line (the next days): "Soupe ⓐ, Pain"
const dishLine = (list: Meal[], dish: (m: Meal) => string) =>
  <span className="p-dishes">{list.map((m, i) => <span key={m.id}>{i > 0 && ", "}{dish(m)}<MealWho m={m} /></span>)}</span>;

function Soon({ soon, max = 3 }: { soon: ReturnType<typeof useDays>["soon"]; max?: number }) {
  if (!soon.length) return null;
  return (
    <div className="p-soon">
      <span className="p-label">Bientôt</span>
      {soon.slice(0, max).map((s) => <span key={s.key} className="p-chip"><Glyph name={s.icon} /><span className="p-chip-t">{s.text}</span><em>dans {s.in} jours</em></span>)}
    </div>
  );
}

// A: the coming days side by side, like the kiosk
function Semaine() {
  const { tz, today, members, days, chores, soon, counts, dish } = useDays(5);
  return (
    <div className="poster p-semaine">
      <Head today={today} counts={counts} />
      <div className="p-cols">
        {days.map(({ d, i, events, birthdays, stay, dinner }) => (
          <section key={d} className={`p-col ${i === 0 ? "today" : ""}`}>
            <div className="p-dayhead"><b>{dayName(d, i)}</b><span>{dayDate(d)}</span></div>
            {stay && <span className="p-chip soft"><Glyph name={STAY_ICON[stay.kind]} />{stayLabel(stay)}</span>}
            {birthdays.map((b) => <span key={b.id} className="p-chip soft"><Glyph name={BIRTHDAY_ICON[b.kind] ?? "cake"} />{b.name}</span>)}
            <div className="p-events">{events.length ? events.map((e) => <EventLine key={e.id} e={e} tz={tz} members={members} />) : <span className="p-empty">Rien de prévu</span>}</div>
            <Meals list={dinner} dish={dish} label="Souper" />
          </section>
        ))}
      </div>
      <footer className="p-foot">
        {chores.length > 0 && <div className="p-chores"><span className="p-label">Tâches du jour</span>
          {chores.slice(0, 4).map((o) => <span key={o.id} className="p-chip"><Glyph name={o.emoji || "check"} /><span className="p-chip-t">{o.title}</span></span>)}</div>}
        <Soon soon={soon} />
      </footer>
    </div>
  );
}

// B: today in large, the next three days in a column beside it
// B, the family's choice. The left column follows the time of day:
//   - someone on the way home: a bright glass panel at the top ("Arthur arrive vers 17 h 30"), until half an hour after
//     the time they gave (the picture is redrawn as soon as the news goes out: functions/notify asks GitHub for it);
//   - today: what is still to come (past appointments leave), and the menu (lunch and dinner, only dinner from 16 h);
//   - when nothing is left to come today, today keeps only its menu and a second panel shows tomorrow; the column on the
//     right then starts the day after.
const EVENING = "16:00", ARRIVAL_SHOWN_MS = 30 * 60_000;
const notOver = (e: CalEvent, now: number) => e.all_day || (e.ends_at ? Date.parse(e.ends_at) : Date.parse(e.starts_at) + 3_600_000) > now;

function Aujourdhui() {
  const { tz, today, members, days, chores, birthdays, counts, dish } = useDays(5);
  const now = Date.now(), evening = partsIn(now, tz).time >= EVENING;
  const arrivals = useTable("arrivals").filter((a) => !a.deleted_at && !a.arrived_at && Date.parse(a.eta) + ARRIVAL_SHOWN_MS > now)
    .sort((a, b) => a.eta.localeCompare(b.eta));
  const [t, tomorrow] = days;
  const toCome = t.events.filter((e) => notOver(e, now));
  const lunch = evening ? [] : t.lunch;
  const showTomorrow = !toCome.length && !t.stay;
  const next = showTomorrow ? days.slice(2, 5) : days.slice(1, 4);
  const when = (n: number) => (n === 0 ? "aujourd'hui" : n === 1 ? "demain" : `dans ${n} jours`);
  const menu = (l: Meal[], d: Meal[]) => (l.length || d.length) ? <div className="p-meals"><Meals list={l} dish={dish} label="Dîner" /><Meals list={d} dish={dish} label="Souper" /></div> : null;
  return (
    <div className="poster p-aujourdhui">
      <span className="p-orb one" /><span className="p-orb two" /><span className="p-orb three" />
      <Head today={today} counts={counts} />
      <div className="p-split">
        <div className="p-left">
          {arrivals.map((a) => (
            <section key={a.id} className="p-today p-arrival">
              <span className="p-arrival-icon"><Glyph name="home" /></span>
              <span className="p-arrival-text">
                <span>{members.name(a.member_id)} arrive vers</span>
                <b>{hhmm(a.eta, tz)}</b>
                {(a.from_label || a.note) && <em>{a.from_label ? `Départ ${a.from_label} à ${hhmm(a.left_at, tz)}` : ""}{a.from_label && a.note ? " · " : ""}{a.note ? `« ${a.note} »` : ""}</em>}
              </span>
            </section>
          ))}
          {/* Today: what is still to come, and the menu */}
          <section className={`p-today ${showTomorrow ? "compact" : "main"}`}>
            <span className="p-label">{showTomorrow && evening ? "Ce soir" : "Aujourd'hui"}</span>
            {t.stay && <span className="p-chip soft"><Glyph name={STAY_ICON[t.stay.kind]} />{stayLabel(t.stay)}</span>}
            {!showTomorrow && <div className="p-events big">{toCome.map((e) => <EventLine key={e.id} e={e} tz={tz} members={members} />)}</div>}
            {menu(lunch, t.dinner) ?? (showTomorrow && <span className="p-empty">Rien d'autre aujourd'hui</span>)}
          </section>
          {/* Nothing left today: tomorrow in a panel of its own */}
          {showTomorrow && (
            <section className="p-today main tomorrow">
              <span className="p-label">Demain · {dayDate(tomorrow.d)}</span>
              {tomorrow.stay && <span className="p-chip soft"><Glyph name={STAY_ICON[tomorrow.stay.kind]} />{stayLabel(tomorrow.stay)}</span>}
              <div className="p-events big">{tomorrow.events.length ? tomorrow.events.map((e) => <EventLine key={e.id} e={e} tz={tz} members={members} />) : <span className="p-empty">Rien de prévu</span>}</div>
              {/* Two compact lines: tomorrow shares the column, and a meal may have several dishes */}
              {(tomorrow.lunch.length > 0 || tomorrow.dinner.length > 0) && <div className="p-meals lines">
                {tomorrow.lunch.length > 0 && <span className="p-line"><em>Dîner</em>{dishLine(tomorrow.lunch, dish)}</span>}
                {tomorrow.dinner.length > 0 && <span className="p-line"><em>Souper</em>{dishLine(tomorrow.dinner, dish)}</span>}
              </div>}
            </section>
          )}
          {/* Beneath, quieter: the day's chores and the birthdays to come, as plain lines */}
          {(chores.length > 0 || birthdays.length > 0) && <div className="p-aside">
            {chores.length > 0 && <p><Glyph name="list-checks" /><span>{chores.map((o) => o.title).join(" · ")}</span></p>}
            {birthdays.length > 0 && <p><Glyph name="cake" /><span>{birthdays.map((x) => `${x.text} ${when(x.in)}`).join(" · ")}</span></p>}
          </div>}
        </div>
        <section className="p-next">
          {next.map(({ d, i, events, stay, lunch: l, dinner }) => (
            <div key={d} className="p-nextday">
              <div className="p-dayhead"><b>{dayName(d, i)}</b><span>{dayDate(d)}</span></div>
              {stay && <span className="p-line"><Glyph name={STAY_ICON[stay.kind]} />{stayLabel(stay)}</span>}
              {events.slice(0, 2).map((e) => <span key={e.id} className="p-line"><b>{e.all_day ? "Journée" : startTime(e, tz)}</b><span>{e.title}</span><Who e={e} members={members} /></span>)}
              {events.length > 2 && <span className="p-line muted">et {events.length - 2} autre{events.length > 3 ? "s" : ""}</span>}
              {!events.length && !stay && !l.length && !dinner.length && <span className="p-line muted">Rien de prévu</span>}
              {(l.length > 0 || dinner.length > 0) && <span className="p-menu">
                {l.length > 0 && <span className="p-line"><em>Dîner</em>{dishLine(l, dish)}</span>}
                {dinner.length > 0 && <span className="p-line"><em>Souper</em>{dishLine(dinner, dish)}</span>}
              </span>}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

// C: a calm list, three days, very large type: only what is planned and what is eaten in the evening
function Epure() {
  const { tz, today, days, soon, counts, dish } = useDays(3);
  return (
    <div className="poster p-epure">
      <Head today={today} small counts={counts} />
      <div className="p-rows">
        {days.map(({ d, i, events, birthdays, stay, dinner }) => (
          <section key={d} className="p-row">
            <div className="p-rowhead"><b>{dayName(d, i)}</b><span>{dayDate(d)}</span></div>
            <div className="p-rowbody">
              {stay && <span className="p-item"><Glyph name={STAY_ICON[stay.kind]} />{stayLabel(stay)}</span>}
              {birthdays.map((b) => <span key={b.id} className="p-item"><Glyph name={BIRTHDAY_ICON[b.kind] ?? "cake"} />Anniversaire de {b.name}</span>)}
              {events.slice(0, 4).map((e) => <span key={e.id} className="p-item"><b>{e.all_day ? "Journée" : startTime(e, tz)}</b>{e.title}</span>)}
              {!events.length && !stay && !birthdays.length && <span className="p-item muted">Journée libre</span>}
              {dinner.length > 0 && <span className="p-item muted"><Glyph name="pot-steam" />{dinner.map(dish).join(" · ")}</span>}
            </div>
          </section>
        ))}
      </div>
      <Soon soon={soon} />
    </div>
  );
}

export function Poster() {
  const [params] = useSearchParams();
  const v = (params.get("v") as Variant) || "aujourdhui"; // the family chose "aujourdhui"; the others stay to try
  const theme = params.get("theme") === "light" ? "light" : "dark"; // a TV in a dim room: dark by default
  useEffect(() => {
    const root = document.documentElement, before = root.dataset.theme;
    root.dataset.theme = theme;
    return () => { if (before) root.dataset.theme = before; else delete root.dataset.theme; };
  }, [theme]);
  return v === "aujourdhui" ? <Aujourdhui /> : v === "epure" ? <Epure /> : <Semaine />;
}
