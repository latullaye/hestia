// The tools of Hestia: one registry, two doors.
//   - the "mcp" function exposes them to Claude (claude.ai, Claude Code…) as an MCP server;
//   - the "intercom" function gives them to Claude through the Messages API to act on a spoken sentence.
// A tool is a name, a description, a zod shape for its arguments and a function that answers in French Markdown.
// Rules shared by all of them: nothing is ever hard-deleted (soft delete, status), every write carries who did it
// (updated_by) and from where (updated_via), so the activity log stays truthful.
import { z } from "zod";
import { type Db, type Member, type Row, isUuid } from "./db.ts";
import { addDays, daysBetween, fmtDay, fmtTime, isDay, norm, partsIn, relDay } from "./time.ts";

export type Ctx = {
  db: Db;
  actor: Member | null;       // who is asking (null: nobody in particular, e.g. the kiosk)
  via: "mcp" | "intercom";
  tz: string;
  now: () => number;
  members: Member[];          // adults, children and devices
};
// deno-lint-ignore no-explicit-any
export type Tool<S extends z.ZodRawShape = any> = {
  name: string;
  title: string;
  description: string;
  shape: S;
  write: boolean;
  run: (args: z.infer<z.ZodObject<S>>, c: Ctx) => Promise<string>;
};
// An error the model should read and act on ("which one?", "missing caregiver")
export class ToolError extends Error {}
export function fail(message: string): never { throw new ToolError(message); }

export function tool<S extends z.ZodRawShape>(t: Tool<S>): Tool<S> { return t; }

// ---------- Shared helpers ----------
export const today = (c: Ctx) => partsIn(c.now(), c.tz).day;
export const family = (c: Ctx) => c.members.filter((m) => m.role !== "device");
export const adults = (c: Ctx) => c.members.filter((m) => m.role === "adult");
export const nameOf = (c: Ctx, id: string | null | undefined) => c.members.find((m) => m.id === id)?.name || "?";
export const namesOf = (c: Ctx, ids: string[] | null | undefined, empty = "toute la famille") =>
  ids && ids.length ? ids.map((id) => nameOf(c, id)).join(", ") : empty;
export const actorId = (c: Ctx) => c.actor?.id ?? null;
export const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} et ${xs[xs.length - 1]}`);

const EVERYONE = new Set(["tous", "tout le monde", "famille", "la famille", "toute la famille", "nous", "nous tous", "everyone"]);
const BOTH = new Set(["nous deux", "les deux", "les parents", "parents", "ensemble"]);
const ME = new Set(["moi", "je", "moi meme", "me"]);

// First names (or "moi", "tous", "nous deux") -> member ids. "tous" gives an empty list: the whole family.
export function people(c: Ctx, names: string[] | undefined | null, what = "personne"): string[] {
  const out = new Set<string>();
  for (const raw of names || []) {
    const n = norm(raw);
    if (!n) continue;
    if (EVERYONE.has(n)) return [];
    if (BOTH.has(n)) { adults(c).forEach((m) => out.add(m.id)); continue; }
    if (ME.has(n)) {
      if (!c.actor) fail(`« ${raw} » : je ne sais pas qui parle. Donne un prénom (${family(c).map((m) => m.name).join(", ")}).`);
      out.add(c.actor!.id); continue;
    }
    const m = family(c).find((x) => [x.name, ...(x.aliases || [])].map(norm).includes(n))
      || family(c).find((x) => norm(x.name).startsWith(n) || n.startsWith(norm(x.name)));
    if (!m) fail(`${what} inconnue : « ${raw} ». Membres de la famille : ${family(c).map((x) => x.name).join(", ")}.`);
    out.add(m!.id);
  }
  return [...out];
}

// A day given as AAAA-MM-JJ, or "aujourd'hui" / "demain" / "hier"
export function dayArg(c: Ctx, s: string | undefined | null, fallback?: string): string {
  if (!s) return fallback ?? today(c);
  const n = norm(s);
  if (n === "aujourd hui" || n === "aujourdhui" || n === "today") return today(c);
  if (n === "demain") return addDays(today(c), 1);
  if (n === "apres demain") return addDays(today(c), 2);
  if (n === "hier") return addDays(today(c), -1);
  if (isDay(s.slice(0, 10))) return s.slice(0, 10);
  return fail(`Date illisible : « ${s} ». Format attendu : AAAA-MM-JJ.`);
}

// Finds one row by id or by words of its name among candidates; says which ones when several match
export function pick<T extends Row>(rows: T[], query: string, label: (r: T) => string, what: string): T {
  if (isUuid(query)) {
    const r = rows.find((x) => x.id === query);
    return r ?? fail(`${what} introuvable avec cet id.`);
  }
  const words = norm(query).split(" ").filter(Boolean);
  if (!words.length) fail(`Précise ${what}.`);
  const exact = rows.filter((r) => norm(label(r)) === norm(query));
  const hits = exact.length ? exact : rows.filter((r) => { const t = ` ${norm(label(r))} `; return words.every((w) => t.includes(w)); });
  if (!hits.length) fail(`${what} introuvable : « ${query} ».`);
  if (hits.length > 1) {
    fail(`Plusieurs ${what} correspondent à « ${query} » : ${hits.slice(0, 8).map((r) => `${label(r)} [${r.id}]`).join(" ; ")}. Précise avec l'id.`);
  }
  return hits[0];
}

export const when = (c: Ctx, e: Row) => {
  const t = today(c);
  if (e.all_day) {
    const end = e.end_date && e.end_date !== e.start_date ? ` → ${fmtDay(e.end_date)}` : "";
    return `${relDay(t, e.start_date)}${end} (journée)`;
  }
  const s = partsIn(Date.parse(e.starts_at), c.tz);
  const end = e.ends_at ? `–${fmtTime(Date.parse(e.ends_at), c.tz)}` : "";
  return `${relDay(t, s.day)} ${fmtTime(s.time, c.tz)}${end}`;
};

export { z, addDays, daysBetween, fmtDay, fmtTime, isDay, norm, partsIn, relDay, isUuid };
export type { Db, Member, Row };
