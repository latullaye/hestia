// The TV poster: the days ahead as one still picture, for the Chromecast's ambient screen (a Google Photos album).
// Laid out at 1920 × 1080 and taken at twice the scale: a 3840 × 2160 (4K) picture. No clock and no weather: the TV
// draws them itself in the bottom-right corner, which is left empty. Read from across the room, so large type.
//   #/poster?v=semaine | aujourdhui | epure    (three looks, to choose from)
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Glyph, Wordmark } from "../components/icons";
import { Avatars } from "../components/ui";
import { BIRTHDAY_ICON, KIND_ICON, STAY_ICON, addDays, birthdaysOn, cap, countdownsFrom, eventsOn, fmtDay, mealName, mealsOn, occurrencesOn,
  startTime, stayLabel, stayOn, upcomingBirthdays } from "../lib/domain";
import { useHousehold, useMembers, useTable, useToday } from "../lib/hooks";
import type { CalEvent, Meal } from "../lib/types";

type Variant = "semaine" | "aujourdhui" | "epure";

function useDays(n: number) {
  const { tz } = useHousehold(), today = useToday(tz), members = useMembers();
  const events = useTable("events"), meals = useTable("meal_plan"), dishes = useTable("dishes"), occurrences = useTable("chore_occurrences");
  const birthdays = useTable("birthdays"), countdowns = useTable("countdowns"), stays = useTable("stays");
  const dishMap = new Map(dishes.map((d) => [d.id, d]));
  const days = [...Array(n)].map((_, i) => {
    const d = addDays(today, i);
    return {
      d, i,
      events: eventsOn(events, d, tz).filter((e) => e.kind !== "birthday"),
      birthdays: birthdaysOn(birthdays, d).filter((b) => b.kind !== "memorial"),
      stay: stayOn(stays, d),
      lunch: mealsOn(meals, d, "lunch"), dinner: mealsOn(meals, d, "dinner"),
    };
  });
  const chores = occurrencesOn(occurrences, today, tz, today).filter((o) => o.status === "todo");
  const soon = [
    ...upcomingBirthdays(birthdays, today).filter((b) => b.in >= n && b.in <= 30 && b.kind !== "memorial")
      .map((b) => ({ key: b.id, icon: BIRTHDAY_ICON[b.kind] ?? "cake", text: b.name, in: b.in })),
  ].sort((a, b) => a.in - b.in).slice(0, 4);
  // The countdowns shown on the kiosk (Noël…) are at the top, beside the date
  const counts = countdownsFrom(countdowns.filter((c) => c.show_on_kiosk), today).slice(0, 2)
    .map((c) => ({ key: c.id, icon: c.emoji || "calendar", text: c.title, in: c.in }));
  return { tz, today, members, days, chores, soon, counts, dish: (m: Meal) => mealName(m, dishMap) || "Plat à choisir" };
}

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

function EventLine({ e, tz, members }: { e: CalEvent; tz: string; members: ReturnType<typeof useMembers> }) {
  return (
    <div className={`p-event ${e.status}`}>
      <span className="p-time">{e.status === "pending" && <Glyph name="hourglass" />}{e.all_day ? "Journée" : startTime(e, tz)}</span>
      <span className="p-title">{e.title}</span>
      {e.participant_ids.length > 0 && <Avatars ids={e.participant_ids} members={members} size="sm" />}
    </div>
  );
}

function Meals({ list, dish, label }: { list: Meal[]; dish: (m: Meal) => string; label: string }) {
  if (!list.length) return null;
  return (
    <div className="p-meal"><span className="p-meal-label">{label}</span>
      {list.map((m) => <span key={m.id} className="p-dish"><Glyph name={KIND_ICON[m.kind]} />{dish(m)}</span>)}</div>
  );
}

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
function Aujourdhui() {
  const { tz, today, members, days, chores, soon, counts, dish } = useDays(4);
  const [t, ...next] = days;
  return (
    <div className="poster p-aujourdhui">
      <span className="p-orb one" /><span className="p-orb two" /><span className="p-orb three" />
      <Head today={today} counts={counts} />
      <div className="p-split">
        <section className="p-today">
          <span className="p-label">Aujourd'hui</span>
          {t.stay && <span className="p-chip soft"><Glyph name={STAY_ICON[t.stay.kind]} />{stayLabel(t.stay)}</span>}
          {t.birthdays.map((b) => <span key={b.id} className="p-chip soft"><Glyph name={BIRTHDAY_ICON[b.kind] ?? "cake"} />{b.name}</span>)}
          <div className="p-events big">{t.events.length ? t.events.map((e) => <EventLine key={e.id} e={e} tz={tz} members={members} />) : <span className="p-empty">Rien de prévu</span>}</div>
          <div className="p-meals"><Meals list={t.lunch} dish={dish} label="Dîner" /><Meals list={t.dinner} dish={dish} label="Souper" /></div>
          {chores.length > 0 && <div className="p-chores"><span className="p-label">Tâches</span>
            {chores.slice(0, 4).map((o) => <span key={o.id} className="p-chip"><Glyph name={o.emoji || "check"} /><span className="p-chip-t">{o.title}</span></span>)}</div>}
          <Soon soon={soon} />
        </section>
        <section className="p-next">
          {next.map(({ d, i, events, birthdays, stay, lunch, dinner }) => (
            <div key={d} className="p-nextday">
              <div className="p-dayhead"><b>{dayName(d, i)}</b><span>{dayDate(d)}</span></div>
              {stay && <span className="p-line"><Glyph name={STAY_ICON[stay.kind]} />{stayLabel(stay)}</span>}
              {birthdays.map((b) => <span key={b.id} className="p-line"><Glyph name={BIRTHDAY_ICON[b.kind] ?? "cake"} />{b.name}</span>)}
              {events.slice(0, 2).map((e) => <span key={e.id} className="p-line"><b>{e.all_day ? "Journée" : startTime(e, tz)}</b><span>{e.title}</span></span>)}
              {events.length > 2 && <span className="p-line muted">et {events.length - 2} autre{events.length > 3 ? "s" : ""}</span>}
              {!events.length && !stay && !birthdays.length && !lunch.length && !dinner.length && <span className="p-line muted">Rien de prévu</span>}
              {(lunch.length > 0 || dinner.length > 0) && <span className="p-menu">
                {lunch.length > 0 && <span className="p-line"><em>Dîner</em>{lunch.map(dish).join(", ")}</span>}
                {dinner.length > 0 && <span className="p-line"><em>Souper</em>{dinner.map(dish).join(", ")}</span>}
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
