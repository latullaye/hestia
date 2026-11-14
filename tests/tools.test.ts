// The tools of the MCP server and the intercom, run against the throwaway database of scripts/test-db.sh
// (npm run test:tools). The family is the fictional one of scripts/test-db.sql.
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadMembers, makeDb, type Db } from "../supabase/functions/_shared/db.ts";
import { anthropicTools, instructions, runTool, tools, type Ctx } from "../supabase/functions/_shared/registry.ts";
import { addDays, partsIn } from "../supabase/functions/_shared/time.ts";

const host = process.env.HESTIA_TEST_PG_HOST, port = Number(process.env.HESTIA_TEST_PG_PORT);
const sql = postgres({ host, port, database: "hestia", username: "postgres", prepare: false, onnotice: () => {} });
let db: Db, c: Ctx, sam: Ctx, kiosk: Ctx;
const tz = "America/Toronto";
const today = partsIn(Date.now(), tz).day;
const run = async (ctx: Ctx, name: string, args: unknown = {}) => {
  const r = await runTool(name, args, ctx);
  return r;
};
const ok = async (ctx: Ctx, name: string, args: unknown = {}) => {
  const r = await run(ctx, name, args);
  expect(r.error, r.text).toBe(false);
  return r.text;
};

beforeAll(async () => {
  db = makeDb(sql);
  const members = await loadMembers(db);
  const base = { db, tz, now: () => Date.now(), members };
  c = { ...base, actor: members.find((m) => m.name === "Alex")!, via: "mcp" };
  sam = { ...base, actor: members.find((m) => m.name === "Sam")!, via: "intercom" };
  kiosk = { ...base, actor: null, via: "intercom" };
});
afterAll(() => sql.end());

describe("registry", () => {
  it("has unique, well-formed tools", () => {
    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
    for (const t of anthropicTools()) {
      expect(t.name).toMatch(/^[a-z_]{3,64}$/);
      expect(t.input_schema.type).toBe("object");
    }
  });
  it("gives instructions with the members and the lists", async () => {
    const text = await instructions(c);
    expect(text).toContain("Alex");
    expect(text).toContain("Épicerie");
    expect(text).toContain("toujours accompagné");
  });
  it("rejects bad arguments and unknown tools without throwing", async () => {
    expect((await run(c, "nope")).error).toBe(true);
    expect((await run(c, "evenement_ajouter", { titre: "x" })).error).toBe(true);
  });
});

describe("shopping", () => {
  it("adds a new item in the right aisle, and flips a known one back to needed", async () => {
    let text = await ok(kiosk, "courses_ajouter", { articles: [{ nom: "lait d'avoine", rayon: "Boissons", note: "x2" }, { nom: "oeuf" }] });
    expect(text).toContain("Lait d'avoine (x2) → Épicerie, Boissons (nouveau)");
    expect(text).toContain("Œufs → Épicerie"); // known (bought in the SQL tests), singular matches plural
    text = await ok(c, "courses", {});
    expect(text).toMatch(/Boissons : Lait d'avoine \(x2\)/);
    expect(await ok(c, "courses_ajouter", { articles: [{ nom: "Œufs" }] })).toContain("déjà sur la liste");
  });
  it("checks items off and logs who bought them", async () => {
    expect(await ok(sam, "courses_cocher", { articles: ["oeufs", "tofu"] })).toBe("Acheté : Œufs. Pas sur la liste : tofu.");
    const text = await ok(c, "courses_historique", { article: "œufs" });
    expect(text).toContain("acheté 2 fois");
    expect(text).toContain("Sam");
    const log = await db.one(`select via, action, actor_id from public.activity_log where entity_type = 'shopping_items' order by id desc limit 1`);
    expect(log).toMatchObject({ via: "intercom", action: "purchased", actor_id: sam.actor!.id });
  });
  it("creates a list with ordered aisles", async () => {
    const text = await ok(c, "courses_liste_enregistrer", { nom: "Marché", icone: "shopping-basket", rayons: ["Fromager", "Maraîcher"] });
    expect(text).toContain("Fromager, Maraîcher");
    expect(await ok(c, "courses_ajouter", { articles: [{ nom: "Comté", rayon: "fromager" }], liste: "marché" })).toContain("Marché, Fromager");
  });
});

describe("meals", () => {
  it("plans a dinner from the dish list, with who cooks", async () => {
    await ok(c, "plat_enregistrer", { nom: "Spaghetti carbonara", tags: ["pâtes", "rapide"], recette: "1. Cuire les pâtes.\n2. …", favori: true });
    const text = await ok(c, "repas_planifier", { date: "demain", moment: "souper", quoi: "carbonara", cuisine_par: ["moi"] });
    expect(text).toContain("Spaghetti carbonara");
    expect(text).toContain("cuisiné par Alex");
    expect(await ok(c, "plats", { plat: "carbonara" })).toContain("## Recette");
  });
  it("records what a dish is served as and where it comes from", async () => {
    await ok(c, "plat_enregistrer", { nom: "Mousse au chocolat", service: ["dessert"], source: "Carnet de famille" });
    await ok(c, "plat_enregistrer", { nom: "Spaghetti carbonara", service: ["main"] });
    const card = await ok(c, "plats", { plat: "mousse" });
    expect(card).toContain("Service : Dessert");
    expect(card).toContain("Source : Carnet de famille");
    const desserts = await ok(c, "plats", { service: "dessert" });
    expect(desserts).toContain("Mousse au chocolat (Dessert)");
    expect(desserts).not.toContain("carbonara");
    expect(await ok(c, "plats", { plat: "carbonara" })).toContain("Tags : pâtes, rapide"); // untouched by the second call
  });
  it("replaces what was planned, keeps who cooks, and accepts free text", async () => {
    const text = await ok(sam, "repas_planifier", { date: "demain", moment: "souper", quoi: "Chez Lola", type: "restaurant" });
    expect(text).toContain("Chez Lola (hors liste) · resto · cuisiné par Alex");
    expect(text).toContain("remplace : Spaghetti carbonara");
    const meals = await db.all(`select label from public.meal_plan where date = $1::date and slot = 'dinner' and deleted_at is null`, [addDays(today, 1)]);
    expect(meals).toHaveLength(1);
  });
  it("plans a lunch per person and changes only the cook", async () => {
    await ok(c, "repas_planifier", { date: today, moment: "lunch", quoi: "Spaghetti carbonara", type: "restes", pour: ["moi"] });
    await ok(c, "repas_planifier", { date: today, moment: "diner", quoi: "Salade", pour: ["Sam"] });
    const text = await ok(c, "repas", { du: today, au: today });
    expect(text).toContain("Dîner de Alex : Spaghetti carbonara · restes");
    expect(text).toContain("Dîner de Sam : Salade");
    expect(await ok(c, "repas_planifier", { date: today, moment: "souper", cuisine_par: ["nous deux"] })).toContain("Alex, Sam cuisine");
    expect(await ok(c, "repas_retirer", { date: today, moment: "lunch", pour: ["Sam"] })).toContain("Salade");
  });
});

describe("events", () => {
  it("refuses an event for the baby without a caregiver", async () => {
    const r = await run(c, "evenement_ajouter", { titre: "Bébés nageurs", debut: `${addDays(today, 3)} 10:00`, pour: ["Bébé"] });
    expect(r.error).toBe(true);
    expect(r.text).toContain("ne peut pas y aller seul");
    const text = await ok(c, "evenement_ajouter", { titre: "Bébés nageurs", debut: `${addDays(today, 3)} 10:00`, fin: "10:45", pour: ["Bébé"], accompagne_par: ["Sam"] });
    expect(text).toContain("pour Bébé · accompagné par Sam");
    expect(text).toMatch(/10 h–10 h 45/);
  });
  it("runs the approval flow", async () => {
    let text = await ok(c, "evenement_ajouter", { titre: "Soirée jeux", debut: `${addDays(today, 5)} 19:00`, fin: "23:00", pour: ["moi"], approbation: ["Sam"] });
    expect(text).toContain("⏳ en attente de l'accord de Sam");
    expect((await run(c, "evenement_decider", { evenement: "soirée jeux", decision: "approuver" })).text).toContain("C'est à Sam de décider");
    text = await ok(sam, "evenement_decider", { evenement: "soirée jeux", decision: "approuver", commentaire: "Profites-en" });
    expect(text).toContain("Approuvé");
    const n = await db.one(`select title, body from public.notifications where kind = 'approval_decision' order by created_at desc limit 1`);
    expect(n!.body).toContain("Profites-en");
    expect(await ok(c, "agenda", { texte: "jeux" })).not.toContain("⏳");
  });
  it("moves, comments and cancels", async () => {
    expect(await ok(c, "evenement_modifier", { evenement: "soirée jeux", debut: `${addDays(today, 6)} 20:00` })).toMatch(/20 h–21 h/);
    expect(await ok(sam, "evenement_commenter", { evenement: "soirée jeux", texte: "Je garde le petit" })).toContain("Sam : Je garde le petit");
    expect(await ok(c, "evenement_modifier", { evenement: "soirée jeux", annuler: true })).toContain("Annulé");
    expect((await run(c, "evenement_modifier", { evenement: "soirée jeux", lieu: "x" })).error).toBe(true);
  });
  it("adds an all-day event", async () => {
    expect(await ok(c, "evenement_ajouter", { titre: "Visite des grands-parents", debut: addDays(today, 10), fin: addDays(today, 12) })).toContain("(journée)");
  });
});

describe("chores", () => {
  it("lists and ticks today's chores", async () => {
    const text = await ok(c, "taches", {});
    expect(text).toContain("Cuisine");
    expect(await ok(sam, "tache_cocher", { tache: "cuisine" })).toContain("Fait : Cuisine (Sam)");
    expect(await ok(c, "taches", {})).toContain("✅ Cuisine");
    expect(await ok(sam, "tache_cocher", { tache: "cuisine", etat: "a_faire" })).toContain("Remis à faire");
  });
  it("creates rules from plain frequencies", async () => {
    let text = await ok(c, "tache_regle_enregistrer", { titre: "Sortir les poubelles", icone: "trash", pour: ["Alex"], frequence: { type: "weekly", jours_semaine: [3] }, moment: "soir" });
    expect(text).toContain("le mercredi soir");
    text = await ok(c, "tache_regle_enregistrer", { titre: "Laver les vitres", pour: ["Alex"], frequence: { type: "yearly", mois: [5] } });
    expect(text).toContain("en mai, chaque année");
    text = await ok(c, "tache_regle_enregistrer", { regle: "poubelles", frequence: { type: "weekly", jours_semaine: [6], report_jours: 1 }, moment: "journee" });
    expect(text).toContain("le samedi (sinon le lendemain)");
    expect((await run(c, "tache_regle_enregistrer", { titre: "x", frequence: { type: "weekly" } })).text).toContain("Fréquence invalide");
    expect((await run(c, "tache_regle_enregistrer", { titre: "y", icone: "🧹", frequence: { type: "daily" } })).error).toBe(true); // a name of the set, not an emoji
    expect((await db.one(`select emoji from public.chores where title = 'Sortir les poubelles'`))!.emoji).toBe("trash");
    expect(await ok(c, "taches_regles", {})).toContain("Laver les vitres");
    const n = await db.one(`select count(*)::int as n from public.chore_occurrences o join public.chores r on r.id = o.chore_id
      where r.title = 'Sortir les poubelles' and o.deleted_at is null and extract(isodow from o.due_date) <> 6`);
    expect(n!.n).toBe(0);
  });
  it("adds a one-off task for someone else, who is notified", async () => {
    expect(await ok(sam, "tache_ajouter", { titre: "Réparer la poignée", pour: ["Alex"] })).toContain("pour Alex");
    const n = await db.one(`select body from public.notifications where kind = 'task_assigned' order by created_at desc limit 1`);
    expect(n!.body).toContain("Sam : Réparer la poignée");
    expect(await ok(c, "tache_cocher", { tache: "poignée" })).toContain("Fait");
  });
});

describe("birthdays, countdowns, overview, log", () => {
  it("adds and completes a birthday", async () => {
    const in5 = addDays(today, 5);
    await ok(c, "anniversaire_enregistrer", { nom: "Mamie Jo", jour: Number(in5.slice(8)), mois: Number(in5.slice(5, 7)) });
    await ok(c, "anniversaire_enregistrer", { nom: "mamie jo", annee: 1950, idees_cadeaux: "un livre" });
    const text = await ok(c, "anniversaires", { jours: 10 });
    expect(text).toMatch(/Mamie Jo \(\d+ ans\)/);
    expect(text).toContain("🎁 un livre");
  });
  it("manages countdowns", async () => {
    expect(await ok(c, "decompte_enregistrer", { titre: "Vacances", date: addDays(today, 30), icone: "umbrella" })).toContain("dans 30 jours");
  });
  it("gives the overview", async () => {
    const text = await ok(kiosk, "hestia_aujourdhui");
    for (const part of ["## Événements", "## Repas", "## Tâches du jour", "## Courses", "## Anniversaires", "## Décomptes", "Noël", "Bébés nageurs"]) expect(text).toContain(part);
  });
  it("reads the activity log", async () => {
    const text = await ok(c, "journal", { domaine: "courses", action: "purchased" });
    expect(text).toContain("a acheté « Œufs »");
    expect(text).toContain("via intercom");
  });
});
