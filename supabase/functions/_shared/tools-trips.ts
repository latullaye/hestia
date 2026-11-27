// The trips home, for Claude: when one says "je rentre", leaves, says one will be home, and is home, over weeks.
// The numbers are those of the app's "Mes trajets" screen (trips.ts).
import { type Ctx, addDays, dayArg, fail, fmtDay, nameOf, people, today, tool, z } from "./tools.ts";
import { type TripRow, type TripStat, clock, gap, tripStats, tripSummary } from "./trips.ts";

const of = (name: string) => (/^[aeiouyhàâéèêîïôû]/i.test(name) ? `d'${name}` : `de ${name}`);
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function summaryLine(stats: TripStat[]): string {
  const s = tripSummary(stats);
  return `prévient vers ${clock(s.told)} · part vers ${clock(s.left)}${s.wait != null ? ` (${s.wait} min après)` : ""} · annonce ${clock(s.planned)}`
    + ` · arrive ${clock(s.home)} · trajet ${s.ride != null ? `${s.ride} min` : "—"} · écart ${gap(s.late)}`;
}
function tripLine(t: TripStat): string {
  return `- ${fmtDay(t.day)}${t.from ? ` (${t.from})` : ""} : prévenu ${clock(t.told)} · parti ${clock(t.left)}`
    + ` · annoncé ${clock(t.planned)}${t.plannedLast !== t.planned ? ` (puis ${clock(t.plannedLast)})` : ""}`
    + ` · arrivé ${clock(t.home)}${t.late != null ? ` (${gap(t.late)})` : ""}${t.ride != null ? ` · ${t.ride} min` : ""}`;
}

export const tripTools = [
  tool({
    name: "trajets",
    title: "Trajets vers la maison (statistiques)",
    description: "Les trajets « Je rentre » d'une personne sur une période (par défaut les 60 derniers jours), pour suivre leur évolution : "
      + "pour chacun, l'heure où elle a prévenu, l'heure de départ réelle (détectée par la position, ou donnée par le bouton « Je pars »), "
      + "l'heure d'arrivée annoncée d'abord (et la dernière si elle a changé), l'heure d'arrivée réelle, la durée et l'écart avec l'heure annoncée. "
      + "Puis les médianes de la période et de chaque mois. « qui » : prénom (par défaut, celui qui demande). « — » : pas connu.",
    shape: {
      qui: z.string().optional(),
      du: z.string().optional().describe("AAAA-MM-JJ"),
      au: z.string().optional().describe("AAAA-MM-JJ"),
    },
    write: false,
    run: async (a, c: Ctx) => {
      const who = a.qui ? people(c, [a.qui], "personne")[0] : c.actor?.id;
      if (!who) fail(`Les trajets de qui ? Donne un prénom.`);
      const to = dayArg(c, a.au, today(c)), from = dayArg(c, a.du, addDays(to, -60));
      const rows = await c.db.all(
        `select id, member_id, from_label, created_at, departed_at, first_eta, eta, arrived_at, deleted_at from public.arrivals
         where member_id = $1::uuid and deleted_at is null and created_at >= ($2::date - 1) and created_at < ($3::date + 2)`, [who, from, to]);
      const stats = tripStats(rows as unknown as TripRow[], c.tz).filter((t) => t.day >= from && t.day <= to);
      const name = nameOf(c, who);
      if (!stats.length) return `Aucun trajet ${of(name)} du ${fmtDay(from)} au ${fmtDay(to)}.`;
      const out = [`## Trajets ${of(name)}, du ${fmtDay(from)} au ${fmtDay(to)} : ${stats.length}`, `Médianes : ${summaryLine(stats)}`];
      const months = [...new Set(stats.map((t) => t.day.slice(0, 7)))];
      if (months.length > 1) {
        out.push(`## Par mois\n${months.map((m) => `- ${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)} (${stats.filter((t) => t.day.startsWith(m)).length}) : ${summaryLine(stats.filter((t) => t.day.startsWith(m)))}`).join("\n")}`);
      }
      out.push(`## Chaque trajet\n${stats.slice(-60).map(tripLine).join("\n")}`);
      return out.join("\n\n");
    },
  }),
];
