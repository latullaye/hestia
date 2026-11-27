// The trips home, over time (public.arrivals): when one said "je rentre", really left, said one would be home (first
// time announced, then the latest), and was home. Plain functions: the app's "Mes trajets" screen and Claude's tool
// "trajets" (tools-trips.ts) read the same numbers. No dependency: used by the Edge Functions and by the web app.
import { daysBetween, partsIn } from "./time.ts";

export type TripRow = {
  id: string; member_id: string; from_label?: string | null; created_at: string; departed_at?: string | null;
  first_eta?: string | null; eta: string; arrived_at?: string | null; deleted_at?: string | null;
};
// Times are minutes after midnight of the day one said "je rentre" (household time): 17 h 05 = 1025, past midnight > 1440
export type TripStat = {
  id: string; member_id: string; day: string; from: string | null;
  told: number;            // said "je rentre"
  left: number | null;     // really left (position or "Je pars"); null: not known
  planned: number;         // the time announced first
  plannedLast: number;     // the latest time announced
  home: number | null;     // was home; null: not known (or still on the way)
  ride: number | null;     // minutes from leaving to home
  late: number | null;     // minutes home after the time announced first (negative: early)
};

function minutesOf(iso: string, day: string, tz: string): number {
  const p = partsIn(Date.parse(iso), tz), [h, m] = p.time.split(":").map(Number);
  return daysBetween(day, p.day) * 1440 + h * 60 + m;
}

// The trips not cancelled, oldest first
export function tripStats(rows: TripRow[], tz: string): TripStat[] {
  return rows.filter((r) => !r.deleted_at).sort((a, b) => a.created_at.localeCompare(b.created_at)).map((r) => {
    const day = partsIn(Date.parse(r.created_at), tz).day, at = (iso: string) => minutesOf(iso, day, tz);
    const told = at(r.created_at), planned = at(r.first_eta || r.eta), plannedLast = at(r.eta);
    // A departure before the "je rentre" cannot be known: it is the moment one said it
    const left = r.departed_at ? Math.max(told, at(r.departed_at)) : null, home = r.arrived_at ? at(r.arrived_at) : null;
    return {
      id: r.id, member_id: r.member_id, day, from: r.from_label ?? null, told, left, planned, plannedLast, home,
      ride: left != null && home != null && home >= left ? home - left : null,
      late: home != null ? home - planned : null,
    };
  });
}

export const median = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const i = Math.floor(v.length / 2);
  return v.length % 2 ? v[i] : Math.round((v[i - 1] + v[i]) / 2);
};

// The usual trip: medians (a late evening does not move them much)
export function tripSummary(stats: TripStat[]) {
  return {
    count: stats.length,
    told: median(stats.map((s) => s.told)),
    left: median(stats.map((s) => s.left)),
    wait: median(stats.map((s) => (s.left != null ? s.left - s.told : null))),
    planned: median(stats.map((s) => s.planned)),
    home: median(stats.map((s) => s.home)),
    ride: median(stats.map((s) => s.ride)),
    late: median(stats.map((s) => s.late)),
  };
}

// 1025 → "17 h 05"; 1500 → "1 h" (past midnight)
export function clock(m: number | null): string {
  if (m == null) return "—";
  const d = ((m % 1440) + 1440) % 1440, h = Math.floor(d / 60), mm = d % 60;
  return `${h} h${mm ? ` ${String(mm).padStart(2, "0")}` : ""}`;
}
// 2 → "+2 min"; -3 → "−3 min"; 0 → "à l'heure"
export function gap(m: number | null): string {
  if (m == null) return "—";
  if (m === 0) return "à l'heure";
  return `${m > 0 ? "+" : "−"}${Math.abs(m)} min`;
}
