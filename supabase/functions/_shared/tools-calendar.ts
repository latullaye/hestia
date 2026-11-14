// Tools: events, approvals, comments, birthdays, countdowns.
import { uuids } from "./db.ts";
import { instant, parseWhen } from "./time.ts";
import {
  type Ctx, type Row, actorId, addDays, adults, dayArg, daysBetween, fail, family, fmtDay, iconArg, list, nameOf, namesOf, norm, people, pick,
  relDay, today, tool, when, z,
} from "./tools.ts";

const KINDS = ["event", "medical", "activity", "social", "work", "travel", "other"] as const;
const EVENT_COLUMNS = `id, title, description, location, all_day, starts_at, ends_at, start_date, end_date, kind, participant_ids,
  caregiver_ids, status, approver_ids, created_by, approval_note, approval_decided_by, source, gcal_recurring`;

export async function eventsBetween(c: Ctx, from: string, to: string, includeDeclined = false): Promise<Row[]> {
  return await c.db.all(
    `select ${EVENT_COLUMNS} from public.events
     where deleted_at is null and kind <> 'birthday' and status <> 'cancelled' ${includeDeclined ? "" : "and status <> 'declined'"}
       and coalesce(ends_at, starts_at) >= $1::timestamptz and starts_at < $2::timestamptz
     order by starts_at, title`,
    [instant(from, "00:00", c.tz).toISOString(), instant(addDays(to, 1), "00:00", c.tz).toISOString()]);
}

// Who cannot go alone and has nobody with them
export const uncared = (c: Ctx, e: Row) =>
  (e.caregiver_ids || []).length ? [] : c.members.filter((m) => m.needs_caregiver && (e.participant_ids || []).includes(m.id));

export function eventLine(c: Ctx, e: Row): string {
  const bits = [`**${when(c, e)}** : ${e.title}`];
  if (e.participant_ids?.length) bits.push(`pour ${namesOf(c, e.participant_ids)}`);
  if (e.caregiver_ids?.length) bits.push(`accompagné par ${namesOf(c, e.caregiver_ids)}`);
  const alone = uncared(c, e);
  if (alone.length) bits.push(`⚠ personne n'accompagne ${alone.map((m) => m.name).join(", ")}`);
  if (e.status === "pending") bits.push(`⏳ en attente de l'accord de ${namesOf(c, e.approver_ids, "?")}`);
  if (e.status === "declined") bits.push("❌ refusé");
  if (e.location) bits.push(e.location.split("\n")[0]);
  return `- ${bits.join(" · ")} [${e.id}]`;
}

async function findEvent(c: Ctx, query: string): Promise<Row> {
  const rows = await c.db.all(
    `select ${EVENT_COLUMNS} from public.events
     where deleted_at is null and kind <> 'birthday' and status <> 'cancelled'
       and (id::text = $1 or coalesce(ends_at, starts_at) >= now() - interval '2 days')
     order by starts_at limit 400`, [query]);
  return pick(rows, query, (r) => r.title, "événement");
}

// "2026-11-14 17:30" (timed) or "2026-11-14" (all day) -> the columns of an event
function span(c: Ctx, debut: string, fin?: string | null) {
  const s = parseWhen(debut, today(c)) ?? fail(`Début illisible : « ${debut} ». Format : AAAA-MM-JJ HH:MM, ou AAAA-MM-JJ pour une journée entière.`);
  const e = fin ? parseWhen(fin, s.day) ?? fail(`Fin illisible : « ${fin} ».`) : null;
  if (!s.time) {
    const end = e?.day && e.day >= s.day ? e.day : s.day;
    return { all_day: true, starts_at: instant(s.day, "00:00", c.tz).toISOString(), ends_at: instant(addDays(end, 1), "00:00", c.tz).toISOString(),
      start_date: s.day, end_date: end };
  }
  const start = instant(s.day, s.time, c.tz);
  let end = e ? instant(e.day, e.time || s.time, c.tz) : new Date(start.getTime() + 3600e3);
  if (end <= start) end = new Date(start.getTime() + 3600e3);
  return { all_day: false, starts_at: start.toISOString(), ends_at: end.toISOString(), start_date: null, end_date: null };
}

export const calendarTools = [
  tool({
    name: "agenda",
    title: "Agenda de la famille",
    description: "Les événements de la famille sur une période (par défaut : aujourd'hui et les 14 jours suivants), avec qui est concerné, qui accompagne, les demandes d'approbation en attente et leurs id. « texte » filtre sur le titre ou le lieu.",
    shape: {
      du: z.string().optional().describe("premier jour, AAAA-MM-JJ (défaut : aujourd'hui)"),
      au: z.string().optional().describe("dernier jour inclus, AAAA-MM-JJ (défaut : du + 14 jours)"),
      texte: z.string().optional().describe("mots à trouver dans le titre ou le lieu"),
    },
    write: false,
    run: async ({ du, au, texte }, c) => {
      const from = dayArg(c, du), to = dayArg(c, au, addDays(from, 14));
      let rows = await eventsBetween(c, from, to, true);
      if (texte) { const w = norm(texte).split(" "); rows = rows.filter((r) => w.every((x) => norm(`${r.title} ${r.location || ""}`).includes(x))); }
      if (!rows.length) return `Aucun événement du ${fmtDay(from)} au ${fmtDay(to)}.`;
      return `Événements du ${fmtDay(from)} au ${fmtDay(to)} :\n${rows.map((e) => eventLine(c, e)).join("\n")}`;
    },
  }),

  tool({
    name: "evenement_ajouter",
    title: "Ajouter un événement",
    description: "Ajoute un événement au calendrier de la famille (il part aussi dans Google Agenda « Family »). « pour » : qui est concerné (prénoms ; vide = toute la famille). Un membre qui ne peut pas y aller seul (un enfant) doit avoir un accompagnateur : « accompagne_par ». « approbation » : prénoms des adultes dont l'accord est demandé ; l'événement reste « en attente » et ils reçoivent une notification. À utiliser quand un parent prévoit une sortie qui laisse l'autre s'occuper seul d'un enfant, sauf si c'est déjà convenu.",
    shape: {
      titre: z.string().min(1).describe("titre court, sans le prénom (ex. « 5 à 7 avec les collègues »)"),
      debut: z.string().describe("AAAA-MM-JJ HH:MM, ou AAAA-MM-JJ pour une journée entière"),
      fin: z.string().optional().describe("AAAA-MM-JJ HH:MM (ou HH:MM le même jour) ; défaut : 1 h après le début"),
      lieu: z.string().optional(),
      description: z.string().optional(),
      pour: z.array(z.string()).optional().describe("prénoms des personnes concernées ; « moi » = la personne qui parle ; vide = toute la famille"),
      accompagne_par: z.array(z.string()).optional().describe("prénoms des adultes qui accompagnent un enfant concerné"),
      approbation: z.array(z.string()).optional().describe("prénoms des adultes dont l'accord est demandé"),
      type: z.enum(KINDS).optional().describe("medical pour un rendez-vous de santé"),
    },
    write: true,
    run: async (a, c) => {
      const who = people(c, a.pour), carers = people(c, a.accompagne_par, "accompagnateur"), approvers = people(c, a.approbation, "approbateur");
      const alone = c.members.filter((m) => m.needs_caregiver && who.includes(m.id));
      if (alone.length && !carers.length) {
        fail(`${alone.map((m) => m.name).join(", ")} ne peut pas y aller seul : précise « accompagne_par » (${adults(c).map((m) => m.name).join(" ou ")}).`);
      }
      const bad = approvers.filter((id) => !adults(c).some((m) => m.id === id));
      if (bad.length) fail("Seul un adulte peut approuver.");
      const s = span(c, a.debut, a.fin);
      const status = approvers.length ? "pending" : "confirmed";
      const [row] = await c.db.exec(
        `insert into public.events (title, description, location, all_day, starts_at, ends_at, start_date, end_date, kind,
           participant_ids, caregiver_ids, status, approver_ids, created_by, updated_by, updated_via)
         values ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7::date, $8::date, $9,
           $10::text::uuid[], $11::text::uuid[], $12, $13::text::uuid[], $14::uuid, $14::uuid, $15)
         returning id`,
        [a.titre.trim(), a.description || null, a.lieu || null, s.all_day, s.starts_at, s.ends_at, s.start_date, s.end_date, a.type || "event",
          uuids(who), uuids(carers), status, uuids(approvers), actorId(c), c.via]);
      const e = await c.db.one(`select ${EVENT_COLUMNS} from public.events where id = $1::uuid`, [row.id]);
      return `Ajouté : ${eventLine(c, e!).slice(2)}${status === "pending" ? `\n${namesOf(c, approvers)} reçoit une demande d'approbation.` : ""}`;
    },
  }),

  tool({
    name: "evenement_modifier",
    title: "Modifier ou annuler un événement",
    description: "Modifie un événement (id, ou mots de son titre parmi les événements à venir) : titre, horaire, lieu, personnes concernées, accompagnateur. « annuler: true » l'annule (il disparaît aussi de Google Agenda). Une occurrence d'un événement récurrent créé dans Google ne change que dans Hestia (qui, accompagnateur).",
    shape: {
      evenement: z.string().describe("id ou mots du titre"),
      titre: z.string().optional(),
      debut: z.string().optional().describe("AAAA-MM-JJ HH:MM, ou AAAA-MM-JJ pour une journée entière"),
      fin: z.string().optional(),
      lieu: z.string().optional(),
      description: z.string().optional(),
      pour: z.array(z.string()).optional().describe("remplace les personnes concernées ; [\"tous\"] = toute la famille"),
      accompagne_par: z.array(z.string()).optional().describe("remplace les accompagnateurs"),
      type: z.enum(KINDS).optional(),
      annuler: z.boolean().optional(),
    },
    write: true,
    run: async (a, c) => {
      const e = await findEvent(c, a.evenement);
      if (a.annuler) {
        await c.db.exec(`update public.events set status = 'cancelled', updated_by = $2::uuid, updated_via = $3 where id = $1::uuid`, [e.id, actorId(c), c.via]);
        return `Annulé : ${e.title} (${when(c, e)}).`;
      }
      if (e.gcal_recurring && (a.debut || a.fin || a.titre)) {
        fail("C'est une occurrence d'un événement récurrent de Google Agenda : son titre et son horaire se changent dans Google Agenda. Ici, on peut changer qui est concerné et qui accompagne.");
      }
      const who = a.pour ? people(c, a.pour) : e.participant_ids, carers = a.accompagne_par ? people(c, a.accompagne_par, "accompagnateur") : e.caregiver_ids;
      const alone = c.members.filter((m) => m.needs_caregiver && who.includes(m.id));
      if (alone.length && !carers.length && (a.pour || a.accompagne_par)) {
        fail(`${alone.map((m) => m.name).join(", ")} ne peut pas y aller seul : précise « accompagne_par ».`);
      }
      const s = a.debut ? span(c, a.debut, a.fin) : a.fin
        ? span(c, e.all_day ? e.start_date : `${partsOf(c, e.starts_at)}`, a.fin) : null;
      await c.db.exec(
        `update public.events set title = $2, description = $3, location = $4, kind = $5,
           participant_ids = $6::text::uuid[], caregiver_ids = $7::text::uuid[],
           all_day = coalesce($8::boolean, all_day), starts_at = coalesce($9::timestamptz, starts_at), ends_at = coalesce($10::timestamptz, ends_at),
           start_date = case when $8::boolean is null then start_date else $11::date end,
           end_date = case when $8::boolean is null then end_date else $12::date end,
           updated_by = $13::uuid, updated_via = $14
         where id = $1::uuid`,
        [e.id, a.titre?.trim() || e.title, a.description ?? e.description, a.lieu ?? e.location, a.type || e.kind, uuids(who), uuids(carers),
          s ? s.all_day : null, s?.starts_at ?? null, s?.ends_at ?? null, s?.start_date ?? null, s?.end_date ?? null, actorId(c), c.via]);
      const fresh = await c.db.one(`select ${EVENT_COLUMNS} from public.events where id = $1::uuid`, [e.id]);
      return `Modifié : ${eventLine(c, fresh!).slice(2)}`;
    },
  }),

  tool({
    name: "evenement_decider",
    title: "Approuver ou refuser un événement",
    description: "Répond à une demande d'approbation : « approuver » confirme l'événement, « refuser » le refuse (il sort de Google Agenda). La personne qui a demandé reçoit une notification, avec le commentaire.",
    shape: {
      evenement: z.string().describe("id ou mots du titre"),
      decision: z.enum(["approuver", "refuser"]),
      commentaire: z.string().optional(),
      par: z.string().optional().describe("prénom de l'adulte qui décide, si ce n'est pas la personne qui parle"),
    },
    write: true,
    run: async (a, c) => {
      const e = await findEvent(c, a.evenement);
      if (e.status !== "pending") fail(`« ${e.title} » n'attend pas d'approbation (statut : ${e.status}).`);
      const by = a.par ? people(c, [a.par])[0] : actorId(c);
      if (!by) fail("Qui décide ? Précise « par ».");
      if (e.approver_ids.length && !e.approver_ids.includes(by)) fail(`C'est à ${namesOf(c, e.approver_ids)} de décider.`);
      await c.db.exec(
        `update public.events set status = $2, approval_decided_by = $3::uuid, approval_decided_at = now(), approval_note = $4,
           updated_by = $3::uuid, updated_via = $5 where id = $1::uuid`,
        [e.id, a.decision === "approuver" ? "confirmed" : "declined", by, a.commentaire || null, c.via]);
      return `${a.decision === "approuver" ? "Approuvé ✅" : "Refusé ❌"} : ${e.title} (${when(c, e)}). ${nameOf(c, e.created_by)} est prévenu.`;
    },
  }),

  tool({
    name: "evenement_commenter",
    title: "Commenter un événement",
    description: "Ajoute un commentaire à un événement (les adultes concernés sont prévenus). Sans « texte » : lit les commentaires.",
    shape: { evenement: z.string().describe("id ou mots du titre"), texte: z.string().optional() },
    write: true,
    run: async (a, c) => {
      const e = await findEvent(c, a.evenement);
      if (a.texte?.trim()) {
        await c.db.exec(`insert into public.event_comments (event_id, author_id, body, updated_by, updated_via) values ($1::uuid, $2::uuid, $3, $2::uuid, $4)`,
          [e.id, actorId(c), a.texte.trim(), c.via]);
      }
      const rows = await c.db.all(`select author_id, body, created_at from public.event_comments where event_id = $1::uuid and deleted_at is null order by created_at`, [e.id]);
      return `${eventLine(c, e).slice(2)}\n${rows.length ? rows.map((r) => `- ${nameOf(c, r.author_id)} : ${r.body}`).join("\n") : "Aucun commentaire."}`;
    },
  }),

  tool({
    name: "anniversaires",
    title: "Anniversaires",
    description: "Les anniversaires à venir (par défaut : les 30 prochains jours), avec l'âge quand l'année est connue, les notes et les idées de cadeaux. « mois » (1 à 12) : ceux de ce mois. « tous: true » : toute l'année.",
    shape: {
      jours: z.number().int().min(1).max(366).optional(),
      mois: z.number().int().min(1).max(12).optional(),
      tous: z.boolean().optional(),
    },
    write: false,
    run: async (a, c) => {
      const rows = upcomingBirthdays(c, await c.db.all(`select id, name, month, day, year, kind, note, gift_ideas from public.birthdays where deleted_at is null`));
      const pickRows = a.tous ? [...rows].sort((x, y) => x.month - y.month || x.day - y.day)
        : a.mois ? rows.filter((r) => r.month === a.mois).sort((x, y) => x.day - y.day)
        : rows.filter((r) => r.in <= (a.jours ?? 30));
      if (!pickRows.length) return "Aucun anniversaire sur cette période.";
      return pickRows.map((r) => birthdayLine(c, r)).join("\n");
    },
  }),

  tool({
    name: "anniversaire_enregistrer",
    title: "Ajouter ou modifier un anniversaire",
    description: "Ajoute un anniversaire, ou complète celui qui porte ce nom (année de naissance, note, idées de cadeaux). type : birthday (naissance), anniversary (mariage, rencontre…), memorial (en mémoire, affiché à part).",
    shape: {
      nom: z.string().min(1),
      jour: z.number().int().min(1).max(31).optional(),
      mois: z.number().int().min(1).max(12).optional(),
      annee: z.number().int().min(1900).max(2100).optional(),
      type: z.enum(["birthday", "anniversary", "memorial"]).optional(),
      note: z.string().optional(),
      idees_cadeaux: z.string().optional(),
      supprimer: z.boolean().optional(),
    },
    write: true,
    run: async (a, c) => {
      const rows = await c.db.all(`select id, name, month, day, year, kind, note, gift_ideas from public.birthdays where deleted_at is null`);
      const found = rows.filter((r) => norm(r.name) === norm(a.nom));
      const hit = found[0] ?? rows.filter((r) => norm(r.name).includes(norm(a.nom)))[0];
      if (a.supprimer) {
        if (!hit) fail(`Aucun anniversaire au nom de « ${a.nom} ».`);
        await c.db.exec(`update public.birthdays set deleted_at = now(), updated_by = $2::uuid, updated_via = $3 where id = $1::uuid`, [hit.id, actorId(c), c.via]);
        return `Supprimé : ${hit.name}.`;
      }
      if (hit) {
        await c.db.exec(
          `update public.birthdays set day = $2, month = $3, year = $4, kind = $5, note = $6, gift_ideas = $7, updated_by = $8::uuid, updated_via = $9 where id = $1::uuid`,
          [hit.id, a.jour ?? hit.day, a.mois ?? hit.month, a.annee ?? hit.year, a.type ?? hit.kind, a.note ?? hit.note, a.idees_cadeaux ?? hit.gift_ideas, actorId(c), c.via]);
        return `Mis à jour : ${hit.name}, le ${a.jour ?? hit.day}/${a.mois ?? hit.month}${a.annee ?? hit.year ? ` (${a.annee ?? hit.year})` : ""}.`;
      }
      if (!a.jour || !a.mois) fail("Pour un nouvel anniversaire, il faut le jour et le mois.");
      await c.db.exec(
        `insert into public.birthdays (name, day, month, year, kind, note, gift_ideas, updated_by, updated_via) values ($1, $2, $3, $4, $5, $6, $7, $8::uuid, $9)`,
        [a.nom.trim(), a.jour, a.mois, a.annee ?? null, a.type ?? "birthday", a.note ?? null, a.idees_cadeaux ?? null, actorId(c), c.via]);
      return `Ajouté : ${a.nom.trim()}, le ${a.jour}/${a.mois}${a.annee ? ` (${a.annee})` : ""}.`;
    },
  }),

  tool({
    name: "decompte_enregistrer",
    title: "Ajouter, modifier ou retirer un décompte",
    description: "Un décompte affiché sur le kiosque (« dans 42 jours : Noël »). Crée ou met à jour celui qui porte ce titre ; « supprimer: true » le retire.",
    shape: {
      titre: z.string().min(1),
      date: z.string().optional().describe("AAAA-MM-JJ"),
      icone: iconArg.optional(),
      annuel: z.boolean().optional().describe("revient chaque année à la même date"),
      supprimer: z.boolean().optional(),
    },
    write: true,
    run: async (a, c) => {
      const hit = (await c.db.all(`select id, title, target_date, emoji, yearly from public.countdowns where deleted_at is null`)).find((r) => norm(r.title) === norm(a.titre));
      if (a.supprimer) {
        if (!hit) fail(`Aucun décompte « ${a.titre} ».`);
        await c.db.exec(`update public.countdowns set deleted_at = now(), updated_by = $2::uuid, updated_via = $3 where id = $1::uuid`, [hit.id, actorId(c), c.via]);
        return `Retiré : ${hit.title}.`;
      }
      const date = a.date ? dayArg(c, a.date) : hit?.target_date ?? fail("Il faut une date (AAAA-MM-JJ).");
      if (hit) {
        await c.db.exec(`update public.countdowns set target_date = $2::date, emoji = $3, yearly = $4, updated_by = $5::uuid, updated_via = $6 where id = $1::uuid`,
          [hit.id, date, a.icone ?? hit.emoji, a.annuel ?? hit.yearly, actorId(c), c.via]);
      } else {
        await c.db.exec(`insert into public.countdowns (title, target_date, emoji, yearly, updated_by, updated_via) values ($1, $2::date, $3, $4, $5::uuid, $6)`,
          [a.titre.trim(), date, a.icone ?? null, a.annuel ?? false, actorId(c), c.via]);
      }
      const n = daysBetween(today(c), date);
      return `${a.titre.trim()} : ${n >= 0 ? `dans ${n} jour${n > 1 ? "s" : ""}` : "date passée"} (${fmtDay(date, { year: "numeric" })}).`;
    },
  }),
];

const partsOf = (c: Ctx, iso: string) => { const d = new Date(iso); const f = new Intl.DateTimeFormat("en-CA", { timeZone: c.tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d); const p = Object.fromEntries(f.map((x) => [x.type, x.value])); return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`; };

// Each birthday with its next date and how many days away it is, soonest first
export function upcomingBirthdays(c: Ctx, rows: Row[]): (Row & { next: string; in: number; age: number | null })[] {
  const t = today(c), y = Number(t.slice(0, 4));
  const dateIn = (year: number, m: number, d: number) => {
    const last = new Date(Date.UTC(year, m, 0)).getUTCDate(); // 29 February in a short year: the 28th
    return `${year}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
  };
  return rows.map((r) => {
    let next = dateIn(y, r.month, r.day);
    if (next < t) next = dateIn(y + 1, r.month, r.day);
    return { ...r, next, in: daysBetween(t, next), age: r.year ? Number(next.slice(0, 4)) - r.year : null };
  }).sort((a, b) => a.in - b.in);
}

export function birthdayLine(c: Ctx, r: Row & { next: string; in: number; age: number | null }): string {
  const what = r.kind === "memorial" ? "🕯 En mémoire de" : r.kind === "anniversary" ? "💞" : "🎂";
  const age = r.age == null ? "" : r.kind === "birthday" ? ` (${r.age} ans)` : r.kind === "anniversary" ? ` (${r.age} ans)` : ` (né en ${r.year})`;
  const soon = r.in === 0 ? "aujourd'hui" : r.in === 1 ? "demain" : `dans ${r.in} jours`;
  return `- ${what} ${r.name}${age} : ${relDay(today(c), r.next) === fmtDay(r.next) ? fmtDay(r.next) : relDay(today(c), r.next)}${r.in > 1 ? ` (${soon})` : ""}`
    + `${r.note ? ` · ${r.note}` : ""}${r.gift_ideas ? ` · 🎁 ${r.gift_ideas}` : ""}`;
}

export { family, list };
