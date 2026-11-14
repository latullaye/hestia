// How an event of Hestia is written in Google Calendar, and read back. Pure functions, shared by the gcal-sync function
// and its tests. The household's conventions in the "Family" calendar:
//   "Prénom : titre"      an event of one adult (several: "A & B : titre")
//   "titre (Prénom)"      an event of a child (this is how the baby app writes its appointments)
//   "⏳ titre"            waiting for an approval
//   "Anniversaire … 🎈"   a birthday (all-day, every year)
// and a footer in the description, below FOOTER_MARK, that Hestia owns.
import { norm } from "./time.ts";

export type Person = { id: string; name: string; role: string; aliases?: string[] | null; needs_caregiver?: boolean };
export const PENDING_MARK = "⏳";
export const FOOTER_MARK = "— Hestia —";

const names = (p: Person) => [p.name, ...(p.aliases || [])].map(norm).filter(Boolean);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasWord = (text: string, word: string) => ` ${norm(text)} `.includes(` ${word} `);

// Health-looking words (the same idea as the baby app's list)
const CARE = /clsc|vaccin|m[ée]decin|docteur|\bdre?\b|p[ée]diatr|ost[ée]o|[ée]chograph|\bgmf\b|h[ôo]pital|hospital|clinique|lactation|urgence|chiro|dentiste|physio|acupunct|optom|rdv m[ée]dical|rendez-vous m[ée]dical/i;

export type Decoded = { title: string; pending: boolean; participantIds: string[]; kind: string };

// A Google title -> the title shown in Hestia, who it concerns, whether it waits for an approval
export function decodeTitle(summary: string, people: Person[], location = ""): Decoded {
  let title = (summary || "").trim() || "(sans titre)";
  let pending = false;
  if (title.startsWith(PENDING_MARK)) { pending = true; title = title.slice(PENDING_MARK.length).replace(/^\s*\[[^\]]*\]\s*/, "").trim(); }
  const found = new Set<string>();
  const who = (text: string) => people.filter((p) => p.role !== "device" && names(p).some((n) => hasWord(text, n)));

  // "Prénom : …" or "Prénom & Prénom : …"
  const head = title.match(/^([^:]{1,40}?)\s*:\s+(.+)$/);
  if (head) {
    const parts = head[1].split(/\s*(?:&|,|\bet\b|\+)\s*/i).map(norm).filter(Boolean);
    const matched = parts.map((part) => people.find((p) => p.role !== "device" && names(p).includes(part)));
    if (parts.length && matched.every(Boolean)) {
      matched.forEach((p) => found.add(p!.id));
      title = head[2].trim();
    }
  }
  // "… (Prénom)"
  const tail = title.match(/^(.+?)\s*\(([^()]{1,40})\)\s*$/);
  if (tail) {
    const p = people.find((x) => x.role !== "device" && names(x).includes(norm(tail[2])));
    if (p) { found.add(p.id); title = tail[1].trim(); }
  }
  // Otherwise: a first name somewhere in the title
  if (!found.size) who(title).forEach((p) => found.add(p.id));
  const kind = CARE.test(`${title} ${location}`) ? "medical" : "event";
  return { title, pending, participantIds: [...found], kind };
}

// The title written in Google for an event of Hestia
export function encodeTitle(ev: { title: string; status: string; participant_ids: string[] }, people: Person[]): string {
  const concerned = people.filter((p) => ev.participant_ids.includes(p.id));
  const family = people.filter((p) => p.role !== "device");
  let title = ev.title.trim();
  const named = (p: Person) => names(p).some((n) => hasWord(title, n));
  if (concerned.length && concerned.length < family.length) {
    const adults = concerned.filter((p) => p.role === "adult" && !named(p));
    const children = concerned.filter((p) => p.role === "child" && !named(p));
    if (children.length) title = `${title} (${children.map((p) => p.name).join(", ")})`;
    if (adults.length && !concerned.some((p) => p.role === "child")) title = `${adults.map((p) => p.name).join(" & ")} : ${title}`;
  }
  return ev.status === "pending" ? `${PENDING_MARK} ${title}` : title;
}

// The description without Hestia's footer
export function stripFooter(description: string | null | undefined): string {
  const d = description || "";
  const i = d.indexOf(FOOTER_MARK);
  return (i < 0 ? d : d.slice(0, i)).trim();
}

// The description written in Google: the event's own text, then what Hestia knows
export function encodeDescription(ev: { description: string | null; status: string; caregiver_ids: string[]; approver_ids: string[] }, people: Person[]): string {
  const name = (id: string) => people.find((p) => p.id === id)?.name;
  const lines: string[] = [];
  if (ev.status === "pending") {
    const from = ev.approver_ids.map(name).filter(Boolean).join(", ");
    lines.push(`${PENDING_MARK} En attente d'approbation${from ? ` (${from})` : ""}`);
  } else if (ev.approver_ids.length) {
    lines.push("✅ Confirmé");
  }
  const carers = ev.caregiver_ids.map(name).filter(Boolean);
  if (carers.length) lines.push(`Accompagné par : ${carers.join(", ")}`);
  const own = (ev.description || "").trim();
  return lines.length ? `${own}${own ? "\n\n" : ""}${FOOTER_MARK}\n${lines.join("\n")}` : own;
}

// "Anniversaire de Léa 🎈" -> { name: "Léa", kind: "birthday" }; null when the title is not a birthday
export function decodeBirthday(summary: string): { name: string; kind: "birthday" | "anniversary" } | null {
  const m = (summary || "").trim().match(/^anniversaire\s+(.*)$/i);
  if (!m) return null;
  // deno-lint-ignore no-misleading-character-class
  let rest = m[1].replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{1F1E6}-\u{1F1FF}]/gu, "").trim();
  const special = rest.match(/^de\s+(rencontre|mariage|fian[çc]ailles)\b/i);
  if (special) return { name: special[1][0].toUpperCase() + special[1].slice(1).toLowerCase(), kind: "anniversary" };
  rest = rest.replace(/^(?:de\s+la\s+|de\s+|du\s+|d['’]\s*)/i, "").trim();
  return rest ? { name: rest[0].toUpperCase() + rest.slice(1), kind: "birthday" } : null;
}

// Same person? (one name's words are found in the other: "Léa" and "Léa (Tremblay)")
export function sameName(a: string, b: string): boolean {
  const ta = norm(a).split(" ").filter((w) => w.length > 2), tb = norm(b).split(" ").filter((w) => w.length > 2);
  if (!ta.length || !tb.length) return norm(a) === norm(b);
  const [small, big] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return small.every((w) => big.includes(w));
}

export const escapeRegExp = escapeRe;
