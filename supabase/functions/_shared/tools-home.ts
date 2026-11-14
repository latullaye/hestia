// Tools: meals and dishes, shopping lists, chores, activity log.
import { uuids } from "./db.ts";
import { type Schedule, describeSchedule, scheduleError } from "./schedule.ts";
import {
  type Ctx, type Row, actorId, addDays, dayArg, daysBetween, fail, fmtDay, iconArg, isUuid, list, nameOf, namesOf, norm, people, pick, relDay, today,
  tool, z,
} from "./tools.ts";

// ====================================================================================================================
// Meals
// ====================================================================================================================
const SLOTS: Record<string, string> = { breakfast: "Déjeuner", lunch: "Lunch", dinner: "Souper" };
const KINDS: Record<string, string> = { home: "", leftovers: "restes", restaurant: "resto", takeout: "à emporter", other: "" };
const slotArg = z.enum(["lunch", "souper", "dejeuner"]).describe("lunch (midi), souper (soir) ou dejeuner (matin)");
const slotOf = (s: string) => (s === "souper" ? "dinner" : s === "dejeuner" ? "breakfast" : "lunch");
const kindArg = z.enum(["maison", "restes", "restaurant", "a_emporter", "autre"]);
const kindOf = (s?: string) => ({ maison: "home", restes: "leftovers", restaurant: "restaurant", a_emporter: "takeout", autre: "other" }[s || "maison"] || "home");

export async function mealsBetween(c: Ctx, from: string, to: string): Promise<Row[]> {
  return await c.db.all(
    `select p.id, p.date, p.slot, p.member_ids, p.dish_id, p.kind, p.cook_ids, p.note, coalesce(p.label, d.name) as name
     from public.meal_plan p left join public.dishes d on d.id = p.dish_id
     where p.deleted_at is null and p.date between $1::date and $2::date
     order by p.date, case p.slot when 'breakfast' then 0 when 'lunch' then 1 else 2 end, p.created_at`, [from, to]);
}
export function mealLine(c: Ctx, m: Row): string {
  const bits = [`${SLOTS[m.slot]}${m.member_ids?.length ? ` de ${namesOf(c, m.member_ids)}` : ""} : ${m.name || "?"}`];
  if (KINDS[m.kind]) bits.push(KINDS[m.kind]);
  if (m.cook_ids?.length) bits.push(`cuisiné par ${namesOf(c, m.cook_ids)}`);
  if (m.note) bits.push(m.note);
  return bits.join(" · ");
}
// The dishes cooked at home lately, most recent first (what lunches are often made of)
export async function recentDishes(c: Ctx, days = 10): Promise<Row[]> {
  return await c.db.all(
    `select distinct on (coalesce(p.label, d.name)) coalesce(p.label, d.name) as name, p.dish_id, p.date
     from public.meal_plan p left join public.dishes d on d.id = p.dish_id
     where p.deleted_at is null and p.slot = 'dinner' and p.kind = 'home' and p.date between $1::date and $2::date
       and coalesce(p.label, d.name) is not null
     order by coalesce(p.label, d.name), p.date desc`, [addDays(today(c), -days), today(c)]);
}
async function findDish(c: Ctx, query: string): Promise<Row | null> {
  const rows = await c.db.all(`select id, name, name_key from public.dishes where deleted_at is null`);
  if (isUuid(query)) return rows.find((r) => r.id === query) ?? null;
  const q = norm(query);
  const exact = rows.filter((r) => r.name_key === q);
  if (exact.length) return exact[0];
  const near = rows.filter((r) => r.name_key.includes(q) || q.includes(r.name_key));
  return near.length === 1 ? near[0] : null;
}

const mealTools = [
  tool({
    name: "repas",
    title: "Repas prévus",
    description: "Les repas (lunchs et soupers) sur une période (par défaut : d'hier à dans 7 jours), avec qui cuisine, puis les derniers plats cuisinés (utiles pour les lunchs : on mange souvent les restes).",
    shape: { du: z.string().optional().describe("AAAA-MM-JJ"), au: z.string().optional().describe("AAAA-MM-JJ") },
    write: false,
    run: async ({ du, au }, c) => {
      const from = dayArg(c, du, addDays(today(c), -1)), to = dayArg(c, au, addDays(from, 8));
      const [meals, recent] = [await mealsBetween(c, from, to), await recentDishes(c)];
      const days = [...new Set(meals.map((m) => m.date))];
      const out = days.map((d) => `**${relDay(today(c), d)}${relDay(today(c), d) === fmtDay(d) ? "" : ` (${fmtDay(d)})`}**\n${meals.filter((m) => m.date === d).map((m) => `- ${mealLine(c, m)}`).join("\n")}`);
      if (!out.length) out.push(`Aucun repas prévu du ${fmtDay(from)} au ${fmtDay(to)}.`);
      if (recent.length) out.push(`Derniers plats cuisinés : ${recent.sort((a, b) => (a.date < b.date ? 1 : -1)).map((r) => `${r.name} (${relDay(today(c), r.date)})`).join(", ")}.`);
      return out.join("\n\n");
    },
  }),

  tool({
    name: "plats",
    title: "Plats et recettes",
    description: "Sans argument : la liste des plats que la famille cuisine (les favoris d'abord). Avec « plat » (id ou nom) : sa fiche complète, ingrédients et recette. « recherche » filtre par mots (nom, tags, ingrédients).",
    shape: { plat: z.string().optional(), recherche: z.string().optional() },
    write: false,
    run: async ({ plat, recherche }, c) => {
      if (plat) {
        const d = await findDish(c, plat) ?? fail(`Plat introuvable : « ${plat} ».`);
        const full = (await c.db.one(`select * from public.dishes where id = $1::uuid`, [d.id]))!;
        const last = await c.db.one(`select max(date) as d, count(*) as n from public.meal_plan where dish_id = $1::uuid and deleted_at is null and date <= $2::date`, [d.id, today(c)]);
        return [`# ${full.name}${full.favorite ? " ⭐" : ""}`, full.tags?.length ? `Tags : ${full.tags.join(", ")}` : "",
          last?.d ? `Cuisiné ${last.n} fois, la dernière ${relDay(today(c), last.d)}.` : "Jamais planifié.",
          full.ingredients ? `## Ingrédients\n${full.ingredients}` : "", full.recipe ? `## Recette\n${full.recipe}` : "",
          full.note ? `Note : ${full.note}` : "", full.source_url ? `Source : ${full.source_url}` : "", `[${full.id}]`].filter(Boolean).join("\n\n");
      }
      let rows = await c.db.all(`select id, name, tags, favorite, ingredients, (recipe is not null and recipe <> '') as has_recipe from public.dishes
        where deleted_at is null and not archived order by favorite desc, name`);
      if (recherche) { const w = norm(recherche).split(" "); rows = rows.filter((r) => w.every((x) => norm(`${r.name} ${(r.tags || []).join(" ")} ${r.ingredients || ""}`).includes(x))); }
      if (!rows.length) return recherche ? `Aucun plat pour « ${recherche} ».` : "Aucun plat enregistré pour le moment.";
      return rows.map((r) => `- ${r.name}${r.favorite ? " ⭐" : ""}${r.tags?.length ? ` (${r.tags.join(", ")})` : ""}${r.has_recipe ? " · recette" : ""}`).join("\n");
    },
  }),

  tool({
    name: "plat_enregistrer",
    title: "Ajouter ou modifier un plat",
    description: "Ajoute un plat à ceux que la famille cuisine, ou complète celui qui porte ce nom : ingrédients et recette en Markdown, tags, note, lien. « archive: true » le sort des choix sans effacer son historique.",
    shape: {
      nom: z.string().min(1),
      nouveau_nom: z.string().optional(),
      ingredients: z.string().optional().describe("liste Markdown"),
      recette: z.string().optional().describe("étapes en Markdown"),
      tags: z.array(z.string()).optional().describe("ex. rapide, végé, pâtes"),
      note: z.string().optional(),
      url: z.string().optional(),
      favori: z.boolean().optional(),
      archive: z.boolean().optional(),
    },
    write: true,
    run: async (a, c) => {
      const d = await findDish(c, a.nom);
      const tags = a.tags ? JSON.stringify(a.tags) : null;
      if (d) {
        await c.db.exec(
          `update public.dishes set name = coalesce($2, name), ingredients = coalesce($3, ingredients), recipe = coalesce($4, recipe),
             tags = case when $5::text is null then tags else array(select jsonb_array_elements_text($5::text::jsonb)) end,
             note = coalesce($6, note), source_url = coalesce($7, source_url), favorite = coalesce($8::boolean, favorite),
             archived = coalesce($9::boolean, archived), updated_by = $10::uuid, updated_via = $11
           where id = $1::uuid`,
          [d.id, a.nouveau_nom?.trim() || null, a.ingredients ?? null, a.recette ?? null, tags, a.note ?? null, a.url ?? null, a.favori ?? null, a.archive ?? null, actorId(c), c.via]);
        return `Plat mis à jour : ${a.nouveau_nom?.trim() || d.name}.`;
      }
      await c.db.exec(
        `insert into public.dishes (name, ingredients, recipe, tags, note, source_url, favorite, archived, updated_by, updated_via)
         values ($1, $2, $3, coalesce(array(select jsonb_array_elements_text($4::text::jsonb)), '{}'), $5, $6, $7, $8, $9::uuid, $10)`,
        [(a.nouveau_nom || a.nom).trim(), a.ingredients ?? null, a.recette ?? null, tags ?? "[]", a.note ?? null, a.url ?? null, a.favori ?? false, a.archive ?? false, actorId(c), c.via]);
      return `Plat ajouté : ${(a.nouveau_nom || a.nom).trim()}.`;
    },
  }),

  tool({
    name: "repas_planifier",
    title: "Planifier un repas",
    description: "Indique ce qu'on mange à un repas : « quoi » est le nom d'un plat de la liste (il est reconnu), ou un texte libre (plat du jour, nom du restaurant). Remplace ce qui était prévu pour ce repas et ces personnes, sauf « ajouter: true ». « pour » : prénoms (vide = tout le monde ; les lunchs sont souvent par personne). « cuisine_par » : qui cuisine (prénoms, ou « nous deux »). On peut aussi ne donner que « cuisine_par » pour décider qui cuisine un soir sans changer le plat. type : maison, restes (d'un plat récent), restaurant, a_emporter.",
    shape: {
      date: z.string().describe("AAAA-MM-JJ (ou aujourd'hui, demain)"),
      moment: slotArg,
      quoi: z.string().optional().describe("nom du plat, ou texte libre"),
      type: kindArg.optional(),
      pour: z.array(z.string()).optional(),
      cuisine_par: z.array(z.string()).optional(),
      note: z.string().optional(),
      ajouter: z.boolean().optional().describe("garde ce qui est déjà prévu et ajoute ce plat"),
    },
    write: true,
    run: async (a, c) => {
      const date = dayArg(c, a.date), slot = slotOf(a.moment), who = people(c, a.pour);
      const cooks = a.cuisine_par ? (a.cuisine_par.some((x) => ["tous", "tout le monde"].includes(norm(x))) ? c.members.filter((m) => m.role === "adult").map((m) => m.id) : people(c, a.cuisine_par, "cuisinier")) : null;
      const existing = (await mealsBetween(c, date, date)).filter((m) => m.slot === slot
        && (!m.member_ids.length || !who.length || m.member_ids.some((id: string) => who.includes(id))));
      if (!a.quoi?.trim()) {
        // Only who cooks (or a note) changes
        if (!cooks && a.note == null && !a.type) fail("Précise « quoi » (le plat), ou « cuisine_par ».");
        if (!existing.length) {
          await c.db.exec(`insert into public.meal_plan (date, slot, member_ids, label, kind, cook_ids, note, updated_by, updated_via)
            values ($1::date, $2, $3::text::uuid[], null, $4, $5::text::uuid[], $6, $7::uuid, $8)`,
            [date, slot, uuids(who), kindOf(a.type), uuids(cooks || []), a.note ?? null, actorId(c), c.via]);
          return `${SLOTS[slot]} de ${relDay(today(c), date)} : ${cooks?.length ? `${namesOf(c, cooks)} cuisine` : "noté"} (plat à choisir).`;
        }
        for (const m of existing) {
          await c.db.exec(`update public.meal_plan set cook_ids = coalesce($2::text::uuid[], cook_ids), note = coalesce($3, note), kind = coalesce($4, kind),
            updated_by = $5::uuid, updated_via = $6 where id = $1::uuid`, [m.id, cooks ? uuids(cooks) : null, a.note ?? null, a.type ? kindOf(a.type) : null, actorId(c), c.via]);
        }
        return `${SLOTS[slot]} de ${relDay(today(c), date)} (${existing.map((m) => m.name || "plat à choisir").join(", ")}) : ${cooks?.length ? `${namesOf(c, cooks)} cuisine` : "mis à jour"}.`;
      }
      const dish = await findDish(c, a.quoi);
      const keepCooks = cooks ?? (existing[0]?.cook_ids || []);
      if (!a.ajouter) {
        for (const m of existing) {
          await c.db.exec(`update public.meal_plan set deleted_at = now(), updated_by = $2::uuid, updated_via = $3 where id = $1::uuid`, [m.id, actorId(c), c.via]);
        }
      }
      await c.db.exec(
        `insert into public.meal_plan (date, slot, member_ids, dish_id, label, kind, cook_ids, note, updated_by, updated_via)
         values ($1::date, $2, $3::text::uuid[], $4::uuid, $5, $6, $7::text::uuid[], $8, $9::uuid, $10)`,
        [date, slot, uuids(who), dish?.id ?? null, dish ? null : a.quoi.trim(), kindOf(a.type), uuids(keepCooks), a.note ?? null, actorId(c), c.via]);
      const what = dish ? dish.name : `${a.quoi.trim()} (hors liste)`;
      return `${SLOTS[slot]} de ${relDay(today(c), date)}${who.length ? ` pour ${namesOf(c, who)}` : ""} : ${what}`
        + `${KINDS[kindOf(a.type)] ? ` · ${KINDS[kindOf(a.type)]}` : ""}${keepCooks.length ? ` · cuisiné par ${namesOf(c, keepCooks)}` : ""}.`
        + `${!a.ajouter && existing.some((m) => m.name) ? ` (remplace : ${existing.filter((m) => m.name).map((m) => m.name).join(", ")})` : ""}`;
    },
  }),

  tool({
    name: "repas_retirer",
    title: "Retirer un repas prévu",
    description: "Retire ce qui était prévu pour un repas (pour tout le monde, ou seulement pour les personnes de « pour »).",
    shape: { date: z.string(), moment: slotArg, pour: z.array(z.string()).optional() },
    write: true,
    run: async (a, c) => {
      const date = dayArg(c, a.date), slot = slotOf(a.moment), who = people(c, a.pour);
      const rows = (await mealsBetween(c, date, date)).filter((m) => m.slot === slot && (!who.length || !m.member_ids.length || m.member_ids.some((id: string) => who.includes(id))));
      if (!rows.length) return `Rien n'était prévu pour le ${SLOTS[slot].toLowerCase()} de ${relDay(today(c), date)}.`;
      for (const m of rows) await c.db.exec(`update public.meal_plan set deleted_at = now(), updated_by = $2::uuid, updated_via = $3 where id = $1::uuid`, [m.id, actorId(c), c.via]);
      return `Retiré du ${SLOTS[slot].toLowerCase()} de ${relDay(today(c), date)} : ${rows.map((m) => m.name || "(sans plat)").join(", ")}.`;
    },
  }),
];

// ====================================================================================================================
// Shopping
// ====================================================================================================================
export async function shoppingLists(c: Ctx): Promise<Row[]> {
  return await c.db.all(`select id, name, emoji, sort_order from public.shopping_lists where deleted_at is null order by sort_order, name`);
}
export async function shoppingSections(c: Ctx): Promise<Row[]> {
  return await c.db.all(`select id, list_id, name, emoji, sort_order from public.shopping_sections where deleted_at is null order by sort_order, name`);
}
function findList(lists: Row[], name?: string | null): Row {
  if (!lists.length) fail("Aucune liste de courses.");
  if (!name) return lists[0];
  const q = norm(name);
  return lists.find((l) => norm(l.name) === q) || lists.find((l) => norm(l.name).includes(q) || q.includes(norm(l.name)))
    || fail(`Liste inconnue : « ${name} ». Listes : ${lists.map((l) => l.name).join(", ")}.`);
}
// Singular and plural give the same key ("oeuf" and "oeufs")
const stem = (key: string) => key.split(" ").map((w) => (w.length > 3 ? w.replace(/(s|x)$/, "") : w)).join(" ");

const shoppingTools = [
  tool({
    name: "courses",
    title: "Listes de courses",
    description: "Ce qu'il faut acheter, par liste (Épicerie, Costco…) et par rayon. « liste » : une seule liste. « tout: true » : aussi les articles habituels qui ne sont pas à acheter en ce moment.",
    shape: { liste: z.string().optional(), tout: z.boolean().optional() },
    write: false,
    run: async ({ liste, tout }, c) => {
      const lists = await shoppingLists(c), sections = await shoppingSections(c);
      const only = liste ? findList(lists, liste) : null;
      const items = await c.db.all(`select id, list_id, section_id, name, note, needed, purchased_at from public.shopping_items
        where deleted_at is null ${tout ? "" : "and needed"} order by needed desc, name`);
      const out: string[] = [];
      for (const l of lists.filter((x) => !only || x.id === only.id)) {
        const mine = items.filter((i) => i.list_id === l.id);
        if (!mine.length) { if (only) out.push(`**${l.name}** : rien à acheter.`); continue; }
        const lines: string[] = [];
        const groups = [...sections.filter((s) => s.list_id === l.id), { id: null, name: "Sans rayon" }];
        for (const s of groups) {
          const inSection = mine.filter((i) => i.section_id === s.id);
          if (inSection.length) lines.push(`${s.name} : ${inSection.map((i) => `${i.name}${i.note ? ` (${i.note})` : ""}${i.needed ? "" : " ✓"}`).join(", ")}`.trim());
        }
        out.push(`**${l.name}** (${mine.filter((i) => i.needed).length} à acheter)\n${lines.map((x) => `- ${x}`).join("\n")}`);
      }
      return out.length ? out.join("\n\n") : "Rien à acheter. 🎉";
    },
  }),

  tool({
    name: "courses_ajouter",
    title: "Ajouter aux courses",
    description: "Ajoute des articles à acheter. Un article déjà connu est simplement remis « à acheter » dans sa liste et son rayon habituels ; un nouvel article va dans la liste demandée (défaut : Épicerie) et le rayon indiqué (choisis le rayon le plus logique parmi ceux de la liste). « note » : quantité, marque, précision.",
    shape: {
      articles: z.array(z.object({
        nom: z.string().min(1).describe("nom court, avec une majuscule (« Œufs »)"),
        note: z.string().optional().describe("quantité ou précision (« x12 », « sans lactose »)"),
        rayon: z.string().optional().describe("nom du rayon pour un nouvel article"),
      })).min(1),
      liste: z.string().optional().describe("Épicerie, Costco, Pharmacie… (défaut : là où l'article est habituellement, sinon Épicerie)"),
    },
    write: true,
    run: async ({ articles, liste }, c) => {
      const lists = await shoppingLists(c), sections = await shoppingSections(c);
      const wanted = liste ? findList(lists, liste) : null;
      const all = await c.db.all(`select id, list_id, section_id, name, name_key, note, needed, purchased_at from public.shopping_items where deleted_at is null`);
      const out: string[] = [];
      for (const a of articles) {
        const key = stem(norm(a.nom));
        const same = all.filter((i) => stem(i.name_key) === key && (!wanted || i.list_id === wanted.id))
          .sort((x, y) => String(y.purchased_at || "").localeCompare(String(x.purchased_at || "")));
        const hit = same.find((i) => i.list_id === (wanted || lists[0]).id) || (wanted ? null : same[0]);
        if (hit) {
          const l = lists.find((x) => x.id === hit.list_id)!;
          if (hit.needed && (a.note ?? hit.note) === hit.note) { out.push(`${hit.name} : déjà sur la liste ${l.name}`); continue; }
          await c.db.exec(`update public.shopping_items set needed = true, note = $2, updated_by = $3::uuid, updated_via = $4 where id = $1::uuid`,
            [hit.id, a.note ?? hit.note, actorId(c), c.via]);
          hit.needed = true;
          out.push(`${hit.name}${a.note ? ` (${a.note})` : ""} → ${l.name}`);
          continue;
        }
        const l = wanted || lists[0];
        const mine = sections.filter((s) => s.list_id === l.id);
        const q = norm(a.rayon || "");
        const section = (q && (mine.find((s) => norm(s.name) === q) || mine.find((s) => norm(s.name).includes(q) || q.includes(norm(s.name)))))
          || mine.find((s) => norm(s.name) === "autre") || null;
        const name = a.nom.trim()[0].toUpperCase() + a.nom.trim().slice(1);
        const [row] = await c.db.exec(`insert into public.shopping_items (list_id, section_id, name, note, needed, updated_by, updated_via)
          values ($1::uuid, $2::uuid, $3, $4, true, $5::uuid, $6) returning id`, [l.id, section?.id ?? null, name, a.note ?? null, actorId(c), c.via]);
        all.push({ id: row.id, list_id: l.id, section_id: section?.id ?? null, name, name_key: norm(name), note: a.note ?? null, needed: true, purchased_at: null });
        out.push(`${name}${a.note ? ` (${a.note})` : ""} → ${l.name}${section ? `, ${section.name}` : ""} (nouveau)`);
      }
      return `À acheter : ${out.join(" ; ")}.`;
    },
  }),

  tool({
    name: "courses_cocher",
    title: "Cocher ou retirer des articles",
    description: "« achete » : l'article vient d'être acheté (noté au journal avec qui et quand, il sort de la liste). « retirer » : finalement pas besoin (sans achat). Les articles sont trouvés par leur nom parmi ceux à acheter.",
    shape: {
      articles: z.array(z.string().min(1)).min(1),
      action: z.enum(["achete", "retirer"]).optional().describe("défaut : achete"),
      liste: z.string().optional(),
    },
    write: true,
    run: async ({ articles, action, liste }, c) => {
      const lists = await shoppingLists(c), only = liste ? findList(lists, liste) : null;
      const needed = await c.db.all(`select id, list_id, name, name_key from public.shopping_items where deleted_at is null and needed`);
      const done: string[] = [], missing: string[] = [];
      for (const raw of articles) {
        const key = stem(norm(raw));
        const pool = needed.filter((i) => !only || i.list_id === only.id);
        const hits = pool.filter((i) => stem(i.name_key) === key);
        const near = hits.length ? hits : pool.filter((i) => stem(i.name_key).includes(key) || key.includes(stem(i.name_key)));
        if (!near.length) { missing.push(raw); continue; }
        for (const i of near) {
          await c.db.exec(
            `update public.shopping_items set needed = false, purchased_at = case when $2 then now() else purchased_at end,
               updated_by = $3::uuid, updated_via = $4 where id = $1::uuid`, [i.id, action !== "retirer", actorId(c), c.via]);
          done.push(i.name);
        }
      }
      return [done.length ? `${action === "retirer" ? "Retiré" : "Acheté"} : ${done.join(", ")}.` : "", missing.length ? `Pas sur la liste : ${missing.join(", ")}.` : ""].filter(Boolean).join(" ");
    },
  }),

  tool({
    name: "courses_historique",
    title: "Historique des achats",
    description: "Avec « article » : chaque fois qu'il a été acheté (date, par qui) et le rythme moyen entre deux achats. Sans : les articles les plus achetés sur la période (défaut : 90 jours).",
    shape: { article: z.string().optional(), jours: z.number().int().min(1).max(1500).optional() },
    write: false,
    run: async ({ article, jours }, c) => {
      const since = addDays(today(c), -(jours ?? (article ? 730 : 90)));
      if (!article) {
        const rows = await c.db.all(`select item, list, count(*)::int as n, max(at) as last from public.purchases where at >= $1::date group by item, list order by n desc, item limit 40`, [since]);
        if (!rows.length) return "Aucun achat noté sur cette période.";
        return `Achats depuis le ${fmtDay(since, { year: "numeric" })} :\n${rows.map((r) => `- ${r.item} (${r.list}) : ${r.n} fois, dernier achat ${relDay(today(c), partsDay(c, r.last))}`).join("\n")}`;
      }
      const key = stem(norm(article));
      const rows = (await c.db.all(`select item, name_key, list, actor, via, at from public.purchases where at >= $1::date order by at`, [since]))
        .filter((r) => stem(r.name_key) === key || stem(r.name_key).includes(key));
      if (!rows.length) return `Aucun achat de « ${article} » noté depuis le ${fmtDay(since, { year: "numeric" })}.`;
      const days = rows.map((r) => partsDay(c, r.at));
      const gaps = days.slice(1).map((d, i) => daysBetween(days[i], d)).filter((g) => g > 0);
      const avg = gaps.length ? Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length) : null;
      return `${rows[0].item} : acheté ${rows.length} fois${avg ? `, en moyenne tous les ${avg} jours` : ""}.\n`
        + rows.slice(-25).map((r, i) => `- ${fmtDay(days[rows.length > 25 ? rows.length - 25 + i : i], { year: "numeric" })} · ${r.actor || "?"} · ${r.list}`).join("\n");
    },
  }),

  tool({
    name: "courses_liste_enregistrer",
    title: "Créer ou organiser une liste de courses",
    description: "Crée une liste (ou retrouve celle qui porte ce nom) et, avec « rayons », fixe ses rayons dans l'ordre où on les parcourt en magasin (les rayons absents de la liste donnée sont gardés, à la suite).",
    shape: { nom: z.string().min(1), icone: iconArg.optional(), rayons: z.array(z.string().min(1)).optional() },
    write: true,
    run: async ({ nom, icone, rayons }, c) => {
      const lists = await shoppingLists(c);
      let l = lists.find((x) => norm(x.name) === norm(nom));
      if (!l) {
        const [row] = await c.db.exec(`insert into public.shopping_lists (name, emoji, sort_order, updated_by, updated_via) values ($1, $2, $3, $4::uuid, $5) returning id`,
          [nom.trim(), icone ?? null, lists.length + 1, actorId(c), c.via]);
        l = { id: row.id, name: nom.trim() };
      } else if (icone) {
        await c.db.exec(`update public.shopping_lists set emoji = $2, updated_by = $3::uuid, updated_via = $4 where id = $1::uuid`, [l.id, icone, actorId(c), c.via]);
      }
      if (rayons?.length) {
        const mine = (await shoppingSections(c)).filter((s) => s.list_id === l!.id);
        let order = 1;
        for (const r of rayons) {
          const hit = mine.find((s) => norm(s.name) === norm(r));
          if (hit) await c.db.exec(`update public.shopping_sections set sort_order = $2, updated_by = $3::uuid, updated_via = $4 where id = $1::uuid`, [hit.id, order, actorId(c), c.via]);
          else await c.db.exec(`insert into public.shopping_sections (list_id, name, sort_order, updated_by, updated_via) values ($1::uuid, $2, $3, $4::uuid, $5)`, [l.id, r.trim(), order, actorId(c), c.via]);
          order++;
        }
        for (const s of mine.filter((x) => !rayons.some((r) => norm(r) === norm(x.name)))) {
          await c.db.exec(`update public.shopping_sections set sort_order = $2, updated_by = $3::uuid, updated_via = $4 where id = $1::uuid`, [s.id, order++, actorId(c), c.via]);
        }
      }
      const sections = (await shoppingSections(c)).filter((s) => s.list_id === l.id);
      return `Liste ${l.name} : ${sections.length ? `rayons, dans l'ordre : ${sections.map((s) => s.name).join(", ")}` : "sans rayon"}.`;
    },
  }),
];
const partsDay = (c: Ctx, iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: c.tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

// ====================================================================================================================
// Chores
// ====================================================================================================================
const MOMENTS: Record<string, string> = { morning: "matin", afternoon: "après-midi", evening: "soir", anytime: "" };
const momentArg = z.enum(["matin", "apres_midi", "soir", "journee"]);
const momentOf = (s?: string) => ({ matin: "morning", apres_midi: "afternoon", soir: "evening", journee: "anytime" }[s || "journee"] || "anytime");

// What is to do on a day: due that day, or still open from before
export async function occurrencesFor(c: Ctx, day: string, includeDone = true): Promise<Row[]> {
  return await c.db.all(
    `select id, chore_id, title, emoji, due_date, due_until, time_of_day, assignee_ids, status, done_by, done_at, note
     from public.chore_occurrences
     where deleted_at is null and status <> 'skipped'
       and ((status = 'todo' and due_date <= $1::date and (due_until is null or due_until >= $1::date))
         or (${includeDone ? "status = 'done' and (done_at at time zone $2)::date = $1::date" : "false"}))
     order by case time_of_day when 'morning' then 0 when 'afternoon' then 1 when 'anytime' then 2 else 3 end, title`, [day, c.tz]);
}
export function occurrenceLine(c: Ctx, o: Row, day: string): string {
  const late = o.status === "todo" && o.due_date < day ? ` (depuis ${relDay(day, o.due_date)})` : "";
  return `- ${o.status === "done" ? "✅" : "⬜"} ${o.title}${MOMENTS[o.time_of_day] ? ` · ${MOMENTS[o.time_of_day]}` : ""}`
    + ` · ${namesOf(c, o.assignee_ids, "qui veut")}${late}${o.status === "done" ? ` · fait par ${nameOf(c, o.done_by)}` : ""} [${o.id}]`;
}

const frequence = z.object({
  type: z.enum(["daily", "weekly", "monthly", "yearly"]).describe("daily : tous les N jours ; weekly : jours de la semaine ; monthly : jours du mois ou nième jour de semaine ; yearly : un ou des mois entiers, ou une date"),
  tous_les: z.number().int().min(1).max(52).optional().describe("tous les N jours, semaines ou mois (défaut 1)"),
  jours_semaine: z.array(z.number().int().min(1).max(7)).optional().describe("weekly : 1 = lundi … 7 = dimanche"),
  jours_du_mois: z.array(z.number().int().min(-1).max(31)).optional().describe("monthly : 1 à 31, -1 = dernier jour"),
  nieme: z.number().int().min(-1).max(4).optional().describe("monthly : 1er (1) … 4e, ou dernier (-1), avec jour_semaine"),
  jour_semaine: z.number().int().min(1).max(7).optional(),
  mois: z.array(z.number().int().min(1).max(12)).optional().describe("yearly : à faire dans le courant de ces mois (ex. [5] = en mai)"),
  jour: z.number().int().min(1).max(31).optional().describe("yearly, avec un seul mois : une date précise"),
  report_jours: z.number().int().min(0).max(31).optional().describe("si ce n'est pas fait, reste à faire N jours de plus (samedi, sinon dimanche : 1)"),
});
function toSchedule(f: z.infer<typeof frequence>): Schedule {
  const grace = f.report_jours ? { grace_days: f.report_jours } : {};
  const every = f.tous_les && f.tous_les > 1 ? { every: f.tous_les } : {};
  const s: Schedule = f.type === "daily" ? { type: "daily", ...every, ...grace }
    : f.type === "weekly" ? { type: "weekly", weekdays: f.jours_semaine || [], ...every, ...grace }
    : f.type === "monthly" ? (f.nieme != null ? { type: "monthly", nth: f.nieme, weekday: f.jour_semaine, ...every, ...grace } : { type: "monthly", days: f.jours_du_mois || [], ...every, ...grace })
    : (f.jour != null ? { type: "yearly", month: f.mois?.[0], day: f.jour, ...grace } : { type: "yearly", months: f.mois || [] });
  const err = scheduleError(s);
  if (err) fail(`Fréquence invalide : ${err}.`);
  return s;
}

const choreTools = [
  tool({
    name: "taches",
    title: "Tâches ménagères du jour",
    description: "Les tâches à faire un jour donné (défaut : aujourd'hui) : celles du jour, celles encore ouvertes des jours d'avant, et celles déjà faites ce jour-là. « qui » : seulement celles d'une personne. « jours » : la suite, jour par jour (ex. 7).",
    shape: { jour: z.string().optional().describe("AAAA-MM-JJ"), qui: z.string().optional(), jours: z.number().int().min(1).max(31).optional() },
    write: false,
    run: async ({ jour, qui, jours }, c) => {
      const first = dayArg(c, jour), who = qui ? people(c, [qui])[0] : null, out: string[] = [];
      for (let i = 0; i < (jours ?? 1); i++) {
        const day = addDays(first, i);
        let rows = i === 0 ? await occurrencesFor(c, day)
          : await c.db.all(`select id, chore_id, title, emoji, due_date, due_until, time_of_day, assignee_ids, status, done_by from public.chore_occurrences
              where deleted_at is null and status = 'todo' and due_date = $1::date order by title`, [day]);
        if (who) rows = rows.filter((o) => !o.assignee_ids.length || o.assignee_ids.includes(who));
        out.push(`**${relDay(today(c), day)}${relDay(today(c), day) === fmtDay(day) ? "" : ` (${fmtDay(day)})`}**\n${rows.length ? rows.map((o) => occurrenceLine(c, o, day)).join("\n") : "- rien"}`);
      }
      return out.join("\n\n");
    },
  }),

  tool({
    name: "tache_cocher",
    title: "Cocher une tâche",
    description: "Marque une tâche comme faite (« fait »), la remet à faire (« a_faire ») ou la passe pour cette fois (« passer »). La tâche est trouvée par son id ou par des mots de son titre parmi celles d'aujourd'hui (ou du « jour » donné). « par » : qui l'a faite, si ce n'est pas la personne qui parle.",
    shape: {
      tache: z.string().describe("id ou mots du titre"),
      etat: z.enum(["fait", "a_faire", "passer"]).optional().describe("défaut : fait"),
      par: z.string().optional(),
      jour: z.string().optional(),
    },
    write: true,
    run: async (a, c) => {
      const day = dayArg(c, a.jour);
      const rows = isUuid(a.tache)
        ? await c.db.all(`select id, title, status, assignee_ids from public.chore_occurrences where id = $1::uuid and deleted_at is null`, [a.tache])
        : await occurrencesFor(c, day);
      const o = pick(rows, a.tache, (r) => r.title, "tâche");
      const by = a.par ? people(c, [a.par])[0] : actorId(c) ?? (o.assignee_ids.length === 1 ? o.assignee_ids[0] : null);
      const status = a.etat === "a_faire" ? "todo" : a.etat === "passer" ? "skipped" : "done";
      await c.db.exec(`update public.chore_occurrences set status = $2, done_by = case when $2 = 'done' then $3::uuid end, done_at = case when $2 = 'done' then now() end,
        updated_by = $3::uuid, updated_via = $4 where id = $1::uuid`, [o.id, status, by, c.via]);
      return status === "done" ? `Fait : ${o.title}${by ? ` (${nameOf(c, by)})` : ""}. ✅` : status === "skipped" ? `Passé pour cette fois : ${o.title}.` : `Remis à faire : ${o.title}.`;
    },
  }),

  tool({
    name: "tache_ajouter",
    title: "Ajouter une tâche ponctuelle",
    description: "Ajoute une tâche à faire une fois, pour quelqu'un (défaut : la personne qui parle ; « tous » : qui veut). Elle reste affichée jusqu'à ce qu'elle soit faite. Si elle est donnée à quelqu'un d'autre, il reçoit une notification. Pour une tâche qui revient, utilise tache_regle_enregistrer.",
    shape: {
      titre: z.string().min(1),
      pour: z.array(z.string()).optional(),
      date: z.string().optional().describe("AAAA-MM-JJ (défaut : aujourd'hui)"),
      moment: momentArg.optional(),
      note: z.string().optional(),
    },
    write: true,
    run: async (a, c) => {
      const who = a.pour ? people(c, a.pour) : c.actor ? [c.actor.id] : [];
      const day = dayArg(c, a.date);
      await c.db.exec(`insert into public.chore_occurrences (title, due_date, time_of_day, assignee_ids, note, created_by, updated_by, updated_via)
        values ($1, $2::date, $3, $4::text::uuid[], $5, $6::uuid, $6::uuid, $7)`, [a.titre.trim(), day, momentOf(a.moment), uuids(who), a.note ?? null, actorId(c), c.via]);
      return `Tâche ajoutée pour ${namesOf(c, who, "qui veut")} : ${a.titre.trim()} (${relDay(today(c), day)}).`;
    },
  }),

  tool({
    name: "taches_regles",
    title: "Règles des tâches ménagères",
    description: "Les tâches qui reviennent : qui, à quel rythme, à quel moment de la journée, avec leurs id.",
    shape: {},
    write: false,
    run: async (_a, c) => {
      const rows = await c.db.all(`select id, title, emoji, assignee_ids, assignment, schedule, time_of_day, active, start_date, end_date from public.chores where deleted_at is null order by active desc, sort_order, title`);
      if (!rows.length) return "Aucune tâche régulière pour le moment.";
      return rows.map((r) => `- **${r.title}** : ${describeSchedule(r.schedule, r.time_of_day)} · ${namesOf(c, r.assignee_ids, "qui veut")}`
        + `${r.assignment === "rotate" ? " (à tour de rôle)" : ""}${r.active ? "" : " · en pause"} [${r.id}]`).join("\n");
    },
  }),

  tool({
    name: "tache_regle_enregistrer",
    title: "Créer ou modifier une tâche régulière",
    description: "Crée une tâche ménagère qui revient, ou modifie celle désignée par « regle » (id ou titre). Exemples de « frequence » : tous les soirs = {type: daily} avec moment soir ; le mercredi soir = {type: weekly, jours_semaine: [3]} ; le samedi, sinon le dimanche = {type: weekly, jours_semaine: [6], report_jours: 1} ; en mai = {type: yearly, mois: [5]} ; le 1er du mois = {type: monthly, jours_du_mois: [1]}. « tour_de_role: true » : les personnes de « pour » la font chacune leur tour. « actif: false » met en pause, « supprimer: true » retire la règle (ce qui est déjà fait reste au journal).",
    shape: {
      regle: z.string().optional().describe("id ou titre d'une règle existante à modifier"),
      titre: z.string().optional(),
      icone: iconArg.optional(),
      description: z.string().optional(),
      pour: z.array(z.string()).optional().describe("prénoms ; vide ou « tous » = qui veut"),
      tour_de_role: z.boolean().optional(),
      frequence: frequence.optional(),
      moment: momentArg.optional(),
      debut: z.string().optional().describe("AAAA-MM-JJ"),
      fin: z.string().optional().describe("AAAA-MM-JJ"),
      actif: z.boolean().optional(),
      supprimer: z.boolean().optional(),
    },
    write: true,
    run: async (a, c) => {
      const rows = await c.db.all(`select id, title, emoji, description, assignee_ids, assignment, schedule, time_of_day, active, start_date, end_date from public.chores where deleted_at is null`);
      const hit = a.regle ? pick(rows, a.regle, (r) => r.title, "règle") : rows.find((r) => a.titre && norm(r.title) === norm(a.titre)) || null;
      if (a.supprimer) {
        if (!hit) fail("Quelle règle supprimer ? Donne « regle ».");
        await c.db.exec(`update public.chores set deleted_at = now(), updated_by = $2::uuid, updated_via = $3 where id = $1::uuid`, [hit!.id, actorId(c), c.via]);
        return `Règle supprimée : ${hit!.title}.`;
      }
      const schedule = a.frequence ? toSchedule(a.frequence) : hit?.schedule;
      const who = a.pour ? people(c, a.pour) : hit?.assignee_ids ?? [];
      const moment = a.moment ? momentOf(a.moment) : hit?.time_of_day ?? "anytime";
      const assignment = a.tour_de_role == null ? hit?.assignment ?? "fixed" : a.tour_de_role ? "rotate" : "fixed";
      if (hit) {
        await c.db.exec(
          `update public.chores set title = $2, emoji = $3, description = $4, assignee_ids = $5::text::uuid[], assignment = $6, schedule = $7::text::jsonb,
             time_of_day = $8, start_date = coalesce($9::date, start_date), end_date = coalesce($10::date, end_date), active = $11,
             updated_by = $12::uuid, updated_via = $13 where id = $1::uuid`,
          [hit.id, a.titre?.trim() || hit.title, a.icone ?? hit.emoji, a.description ?? hit.description, uuids(who), assignment, JSON.stringify(schedule), moment,
            a.debut ? dayArg(c, a.debut) : null, a.fin ? dayArg(c, a.fin) : null, a.actif ?? hit.active, actorId(c), c.via]);
        return `Règle mise à jour : ${a.titre?.trim() || hit.title}, ${describeSchedule(schedule, moment)}, ${namesOf(c, who, "qui veut")}${assignment === "rotate" ? " à tour de rôle" : ""}${(a.actif ?? hit.active) ? "" : " (en pause)"}.`;
      }
      if (!a.titre?.trim()) fail("Il faut un titre.");
      if (!schedule) fail("Il faut une fréquence.");
      await c.db.exec(
        `insert into public.chores (title, emoji, description, assignee_ids, assignment, schedule, time_of_day, start_date, end_date, active, updated_by, updated_via)
         values ($1, $2, $3, $4::text::uuid[], $5, $6::text::jsonb, $7, coalesce($8::date, $9::date), $10::date, $11, $12::uuid, $13)`,
        [a.titre!.trim(), a.icone ?? null, a.description ?? null, uuids(who), assignment, JSON.stringify(schedule), moment,
          a.debut ? dayArg(c, a.debut) : null, today(c), a.fin ? dayArg(c, a.fin) : null, a.actif ?? true, actorId(c), c.via]);
      return `Règle créée : ${a.titre!.trim()}, ${describeSchedule(schedule, moment)}, ${namesOf(c, who, "qui veut")}${assignment === "rotate" ? " à tour de rôle" : ""}.`;
    },
  }),
];

// ====================================================================================================================
// Activity log
// ====================================================================================================================
const ACTIONS: Record<string, string> = {
  create: "a ajouté", update: "a modifié", delete: "a supprimé", restore: "a rétabli", purchased: "a acheté", needed: "a mis à acheter",
  unneeded: "a retiré de la liste", done: "a fait", reopened: "a remis à faire", skipped: "a passé", approval_requested: "a demandé l'accord pour",
  approved: "a approuvé", declined: "a refusé", cancelled: "a annulé",
};
const ENTITIES: Record<string, string> = {
  shopping_items: "courses", shopping_lists: "liste", shopping_sections: "rayon", events: "événement", event_comments: "commentaire", meal_plan: "repas",
  dishes: "plat", chores: "règle de tâche", chore_occurrences: "tâche", birthdays: "anniversaire", countdowns: "décompte", members: "membre", settings: "réglage",
};
const logTools = [
  tool({
    name: "journal",
    title: "Journal d'activité",
    description: "Qui a fait quoi, quand et d'où (app, kiosque, interphone, Claude, Google Agenda). Filtres : « domaine » (courses, taches, repas, evenements, plats, anniversaires), « action » (purchased, done, create, update, delete, approved…), « qui » (prénom), « texte » (mots du nom), « jours » (défaut 7).",
    shape: {
      domaine: z.enum(["courses", "taches", "repas", "evenements", "plats", "anniversaires"]).optional(),
      action: z.string().optional(),
      qui: z.string().optional(),
      texte: z.string().optional(),
      jours: z.number().int().min(1).max(1500).optional(),
      limite: z.number().int().min(1).max(200).optional(),
    },
    write: false,
    run: async (a, c) => {
      const domains: Record<string, string[]> = { courses: ["shopping_items"], taches: ["chore_occurrences", "chores"], repas: ["meal_plan"], evenements: ["events", "event_comments"],
        plats: ["dishes"], anniversaires: ["birthdays"] };
      const types = domains[a.domaine || ""] || null;
      const who = a.qui ? people(c, [a.qui])[0] : null;
      const rows = await c.db.all(
        `select l.at, l.actor_id, l.via, l.action, l.entity_type, l.label, l.data from public.activity_log l
         where l.at >= $1::date and ($2::text is null or l.entity_type = any (string_to_array($2::text, ',')))
           and ($3::text is null or l.action = $3) and ($4::uuid is null or l.actor_id = $4::uuid)
         order by l.at desc limit 1000`, [addDays(today(c), -(a.jours ?? 7)), types ? types.join(",") : null, a.action || null, who]);
      const w = a.texte ? norm(a.texte).split(" ") : null;
      const kept = rows.filter((r) => !w || w.every((x) => norm(r.label || "").includes(x))).slice(0, a.limite ?? 50);
      if (!kept.length) return "Rien au journal pour ces critères.";
      const stamp = (iso: string) => new Intl.DateTimeFormat("fr-CA", { timeZone: c.tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
      return kept.map((r) => `- ${stamp(r.at)} · ${r.actor_id ? nameOf(c, r.actor_id) : r.via === "gcal" ? "Google Agenda" : "Hestia"} ${ACTIONS[r.action] || r.action}`
        + ` ${r.label ? `« ${r.label} »` : ""} (${ENTITIES[r.entity_type] || r.entity_type}, via ${r.via})`).join("\n");
    },
  }),
];

export const homeTools = [...mealTools, ...shoppingTools, ...choreTools, ...logTools];
export { list };
