// "Mes trajets": the trips home over weeks. For each, four times: when I said "je rentre", when I really left (from the
// position, or the "Je pars" button), the time I announced first, and when I was home. The usual trip (medians), a chart
// with one column per trip, and the list. The numbers are those Claude reads (tool trajets): @shared/trips.ts.
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { type TripStat, clock, gap, tripStats, tripSummary } from "@shared/trips.ts";
import { fmtDay } from "@shared/time.ts";
import { Empty, Segmented, SyncPill } from "../components/ui";
import { useHousehold, useMembers, useTable, useToday } from "../lib/hooks";
import { useSession } from "../lib/session";
import { addDays } from "../lib/domain";

type Period = "30" | "90" | "all";
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const shortDay = (day: string) => `${Number(day.slice(8))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`; // "2 nov."
const H = 230, PAD = { top: 14, right: 10, bottom: 26, left: 52 };

// The marks, the same in the legend and the chart: what was said is grey (a dash, a ring), what happened is the accent
// (a dot, a larger dot), joined by the ride
function Mark({ kind, x, y }: { kind: "told" | "left" | "planned" | "home"; x: number; y: number }) {
  if (kind === "told") return <line className="tc-told" x1={x - 6} x2={x + 6} y1={y} y2={y} />;
  if (kind === "planned") return <circle className="tc-planned" cx={x} cy={y} r={4.5} />;
  return <circle className={kind === "left" ? "tc-left" : "tc-home"} cx={x} cy={y} r={kind === "left" ? 3.5 : 5} />;
}
function Legend() {
  const item = (kind: "told" | "left" | "planned" | "home", label: string) => (
    <span className="row" style={{ gap: 6 }}><svg width={16} height={14} className="trip-chart"><Mark kind={kind} x={8} y={7} /></svg>{label}</span>
  );
  return <div className="row small muted" style={{ flexWrap: "wrap", gap: "4px 14px" }}>{item("told", "prévenu")}{item("left", "parti")}{item("planned", "annoncé")}{item("home", "arrivé")}</div>;
}

function Chart({ stats, picked, onPick }: { stats: TripStat[]; picked: string | null; onPick: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const all = stats.flatMap((s) => [s.told, s.left, s.planned, s.home]).filter((m): m is number => m != null);
  const lo = Math.floor((Math.min(...all) - 3) / 15) * 15, hi = Math.ceil((Math.max(...all) + 3) / 15) * 15;
  const y = (m: number) => H - PAD.bottom - ((m - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom); // later is higher
  const step = stats.length > 1 ? (w - PAD.left - PAD.right) / (stats.length - 1) : 0;
  const x = (i: number) => (stats.length > 1 ? PAD.left + i * step : (w + PAD.left - PAD.right) / 2);
  const ticks: number[] = [];
  const by = hi - lo > 150 ? 60 : 30;
  for (let m = Math.ceil(lo / by) * by; m <= hi; m += by) ticks.push(m);
  // A date under the axis every few trips, as many as fit without touching
  const every = Math.max(1, Math.ceil(stats.length / Math.max(1, Math.floor((w - PAD.left - PAD.right) / 56))));
  const dates = stats.map((s, i) => ({ i, s })).filter(({ i }) => (stats.length - 1 - i) % every === 0);
  const hit = Math.max(14, step);

  return (
    <div ref={box} style={{ width: "100%" }}>
      {w > 0 && (
        <svg width={w} height={H} className="trip-chart" role="img" aria-label="Les quatre heures de chaque trajet">
          {ticks.map((m) => <g key={m}><line className="tc-grid" x1={PAD.left} x2={w - PAD.right} y1={y(m)} y2={y(m)} /><text className="tc-axis" x={PAD.left - 8} y={y(m) + 4} textAnchor="end">{clock(m)}</text></g>)}
          {dates.map(({ i, s }) => <text key={s.id} className="tc-axis" x={x(i)} y={H - 6} textAnchor={i === stats.length - 1 && stats.length > 1 ? "end" : "middle"}>{shortDay(s.day)}</text>)}
          {stats.map((s, i) => (
            <g key={s.id} className={picked === s.id ? "tc-on" : ""} onClick={() => onPick(s.id)}>
              {picked === s.id && <rect className="tc-pick" x={x(i) - hit / 2} y={PAD.top - 6} width={hit} height={H - PAD.top - PAD.bottom + 12} rx={6} />}
              {s.left != null && s.home != null && <line className="tc-ride" x1={x(i)} x2={x(i)} y1={y(s.left)} y2={y(s.home)} />}
              <Mark kind="told" x={x(i)} y={y(s.told)} />
              <Mark kind="planned" x={x(i)} y={y(s.planned)} />
              {s.left != null && <Mark kind="left" x={x(i)} y={y(s.left)} />}
              {s.home != null && <Mark kind="home" x={x(i)} y={y(s.home)} />}
              <rect x={x(i) - hit / 2} y={0} width={hit} height={H} fill="transparent" />
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

const line = (s: TripStat) => <>prévenu {clock(s.told)} · parti {clock(s.left)} · annoncé {clock(s.planned)}{s.plannedLast !== s.planned ? ` (puis ${clock(s.plannedLast)})` : ""} · arrivé {clock(s.home)}{s.late != null ? ` (${gap(s.late)})` : ""}</>;

export function Trips() {
  const { tz } = useHousehold(), members = useMembers(), { me } = useSession(), today = useToday(tz);
  const rows = useTable("arrivals");
  const done = (r: (typeof rows)[number]) => !r.deleted_at && (!!r.arrived_at || Date.parse(r.eta) + 3_600_000 < Date.now()); // still on the way: not yet a trip to count
  const people = members.adults.filter((m) => m.id === me?.id || rows.some((r) => r.member_id === m.id && done(r)));
  const [who, setWho] = useState<string>(me?.id ?? "");
  const [period, setPeriod] = useState<Period>("30");
  const [picked, setPicked] = useState<string | null>(null);
  const stats = useMemo(() => {
    const from = period === "all" ? "" : addDays(today, -Number(period));
    const mine = rows.filter((r) => r.member_id === who && done(r));
    return tripStats(mine.map((r) => ({ ...r, created_at: r.created_at ?? r.left_at })), tz).filter((s) => s.day > from); // not synced yet: no created_at
  }, [rows, who, period, tz, today]);
  const sum = tripSummary(stats), shown = stats.find((s) => s.id === picked) ?? stats[stats.length - 1];

  return (
    <div className="page">
      <div className="top"><h1 className="grow">{who === me?.id ? "Mes trajets" : `Trajets de ${members.name(who)}`}</h1><SyncPill /></div>
      {people.length > 1 && <Segmented value={who} onChange={(v) => { setWho(v); setPicked(null); }} options={people.map((m) => ({ value: m.id, label: m.name }))} />}
      <Segmented value={period} onChange={(v) => { setPeriod(v); setPicked(null); }} options={[{ value: "30", label: "30 jours" }, { value: "90", label: "3 mois" }, { value: "all", label: "Tout" }]} />
      {!stats.length ? <Empty>Pas encore de trajet sur cette période. Ils s'ajoutent à chaque « Je rentre ».</Empty> : <>
        <div className="card col">
          <span className="label">D'habitude ({stats.length} trajet{stats.length > 1 ? "s" : ""})</span>
          <div className="trip-usual">
            <div><span className="small muted">Prévenu</span><b>{clock(sum.told)}</b></div>
            <div><span className="small muted">Parti</span><b>{clock(sum.left)}</b></div>
            <div><span className="small muted">Annoncé</span><b>{clock(sum.planned)}</b></div>
            <div><span className="small muted">Arrivé</span><b>{clock(sum.home)}</b></div>
          </div>
          <span className="small muted">
            {sum.wait != null ? `Départ ${sum.wait} min après avoir prévenu · ` : ""}trajet {sum.ride != null ? `${sum.ride} min` : "—"} · {sum.late == null ? "écart —" : sum.late === 0 ? "à l'heure annoncée" : `${gap(sum.late)} sur l'heure annoncée`}
          </span>
          <span className="tiny muted">Médianes : un soir à part ne les déplace presque pas.</span>
        </div>
        <div className="card col">
          <Chart stats={stats} picked={shown?.id ?? null} onPick={setPicked} />
          <Legend />
          {shown && <span className="small"><b>{fmtDay(shown.day, { weekday: "long", month: "long" })}</b> · {line(shown)}</span>}
        </div>
        <div className="card flush list">
          {[...stats].reverse().map((s) => (
            <div key={s.id} onClick={() => setPicked(s.id)} className={s.id === shown?.id ? "on" : ""}>
              <span className="grow col" style={{ gap: 1 }}><span>{fmtDay(s.day)}{s.ride != null ? ` · ${s.ride} min` : ""}</span><span className="small muted">{line(s)}</span></span>
            </div>
          ))}
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>
          Le départ vient de la position (200 m plus près de la maison qu'au moment de prévenir) ou du bouton « Je pars » ; l'arrivée, de la
          position près de la maison ou du bouton « Je suis à la maison ». « — » : pas connu.
        </p>
      </>}
    </div>
  );
}
