// The week's meals, and the family's dishes with their recipes.
import { ChevronLeft, ChevronRight, Plus, Star, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { COURSES, COURSE_KEYS, type Course, courseNames } from "@shared/dishes.ts";
import { norm } from "@shared/time.ts";
import { Glyph } from "../components/icons";
import { MealSheet } from "../components/MealSheet";
import { Avatars, Empty, Field, Segmented, Sheet, SyncPill, toast } from "../components/ui";
import { KIND_ICON, SLOT_LABEL, addDays, cap, dayTitle, fmtDay, mealName, mealsOn } from "../lib/domain";
import { useHousehold, useMembers, useTable, useToday } from "../lib/hooks";
import { useMealDrag } from "../lib/mealDrag";
import { store } from "../lib/store";
import type { Dish, MealSlot } from "../lib/types";

export function Meals() {
  const { tz } = useHousehold(), today = useToday(tz), members = useMembers();
  const meals = useTable("meal_plan"), dishes = useTable("dishes");
  const dishMap = useMemo(() => new Map(dishes.map((d) => [d.id, d])), [dishes]);
  const [tab, setTab] = useState<"week" | "dishes">("week");
  const [start, setStart] = useState(today);
  const [sheet, setSheet] = useState<{ date: string; slot: MealSlot } | null>(null);
  const [dish, setDish] = useState<Dish | "new" | null>(null);
  const [q, setQ] = useState("");
  const [course, setCourse] = useState<Course | "all">("all");
  const drag = useMealDrag();
  const courses = COURSE_KEYS.filter((k) => dishes.some((d) => !d.archived && d.courses.includes(k)));
  const days = [...Array(7)].map((_, i) => addDays(start, i));
  const cell = (date: string, slot: MealSlot) => {
    const ms = mealsOn(meals, date, slot);
    return (
      <button className="tap" {...drag.target(date, slot)} onClick={() => { if (!drag.justDropped()) setSheet({ date, slot }); }}>
        <span className="label" style={{ width: 58 }}>{SLOT_LABEL[slot]}</span>
        <span className="grow col" style={{ gap: 2 }}>
          {ms.length ? ms.map((m) => (
            <span key={m.id} {...drag.item(m, mealName(m, dishMap) || "Plat")} className={`meal-line ${drag.item(m, "").className}`}><Glyph name={KIND_ICON[m.kind]} />{mealName(m, dishMap) || <span className="muted">Plat à choisir</span>}
              {m.member_ids.length > 0 && <Avatars ids={m.member_ids} members={members} size="sm" />}
              {m.cook_ids.length > 0 && <span className="care"><Glyph name="chef-hat" /><Avatars ids={m.cook_ids} members={members} size="sm" /></span>}
              {m.note && <span className="small muted">{m.note}</span>}</span>
          )) : <span className="muted">—</span>}
        </span>
      </button>
    );
  };
  const inCourse = (d: Dish) => course === "all" || d.courses.includes(course);
  const shown = dishes.filter((d) => inCourse(d) && (!q || norm(`${d.name} ${d.tags.join(" ")} ${d.source || ""} ${d.ingredients || ""}`).includes(norm(q)))).sort((a, b) => Number(a.archived) - Number(b.archived) || Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));
  return (
    <div className="page">
      <div className="top"><h1>Repas</h1><SyncPill /></div>
      <Segmented value={tab} onChange={setTab} options={[{ value: "week", label: "Semaine" }, { value: "dishes", label: `Nos plats (${dishes.filter((d) => !d.archived).length})` }]} />
      {tab === "week" && <>
        <div className="row">
          <button className="icon-btn" onClick={() => setStart(addDays(start, -7))} aria-label="Avant"><ChevronLeft /></button>
          <span className="grow" style={{ textAlign: "center" }}>{fmtDay(days[0], { weekday: undefined })} – {fmtDay(days[6], { weekday: undefined })}</span>
          {start !== today && <button className="btn small" onClick={() => setStart(today)}>Aujourd'hui</button>}
          <button className="icon-btn" onClick={() => setStart(addDays(start, 7))} aria-label="Après"><ChevronRight /></button>
        </div>
        <p className="tiny muted" style={{ textAlign: "center", margin: 0 }}>Pour déplacer un plat : glisse-le vers un autre repas (au doigt, garde-le appuyé un instant).</p>
        {days.map((d) => (
          <div key={d} className="col" style={{ gap: 6 }}>
            <div className="section-title"><h2>{dayTitle(d, today)}</h2>{dayTitle(d, today) !== cap(fmtDay(d, { weekday: "long", month: "long" })) && <span className="muted small">{fmtDay(d)}</span>}</div>
            <div className="card flush list">{cell(d, "lunch")}{cell(d, "dinner")}</div>
          </div>
        ))}
      </>}
      {tab === "dishes" && <>
        {courses.length > 0 && <div className="chips">
          <button className={`chip small ${course === "all" ? "on" : ""}`} onClick={() => setCourse("all")}>Tout</button>
          {courses.map((k) => <button key={k} className={`chip small ${course === k ? "on" : ""}`} onClick={() => setCourse(k)}>{COURSES[k]}</button>)}
        </div>}
        <div className="row"><input className="input grow" placeholder="Chercher un plat, un ingrédient" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn primary" onClick={() => setDish("new")}><Plus />Plat</button></div>
        <div className="card flush list">
          {shown.map((d) => (
            <button key={d.id} onClick={() => setDish(d)}>
              <span className={`grow ${d.archived ? "muted" : ""}`}>{d.name} {courseNames(d.courses).map((t) => <span key={t} className="tag accent">{t}</span>)}{d.tags.map((t) => <span key={t} className="tag">{t}</span>)}{d.recipe ? <span className="tag">Recette</span> : null}{d.archived ? <span className="tag">Archivé</span> : null}</span>
              {d.favorite && <Star size={16} style={{ color: "var(--accent)" }} />}
            </button>
          ))}
          {!shown.length && <Empty>Aucun plat pour le moment. Ajoute ceux que vous cuisinez souvent.</Empty>}
        </div>
      </>}
      {sheet && <MealSheet {...sheet} onClose={() => setSheet(null)} />}
      {drag.ghost}
      {dish && <DishSheet dish={dish === "new" ? undefined : dish} onClose={() => setDish(null)} />}
    </div>
  );
}

function DishSheet({ dish, onClose }: { dish?: Dish; onClose: () => void }) {
  const [f, setF] = useState({ name: dish?.name ?? "", tags: dish?.tags.join(", ") ?? "", courses: dish?.courses ?? [] as string[], source: dish?.source ?? "", ingredients: dish?.ingredients ?? "", recipe: dish?.recipe ?? "", note: dish?.note ?? "", url: dish?.source_url ?? "", favorite: dish?.favorite ?? false, archived: dish?.archived ?? false });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const save = () => {
    if (!f.name.trim()) return toast("Donne un nom au plat.");
    store.put("dishes", { ...(dish || {}), name: f.name.trim(), tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean), courses: f.courses, source: f.source.trim() || null, ingredients: f.ingredients.trim() || null, recipe: f.recipe.trim() || null,
      note: f.note.trim() || null, source_url: f.url.trim() || null, favorite: f.favorite, archived: f.archived });
    onClose();
  };
  return (
    <Sheet title={dish ? dish.name : "Nouveau plat"} onClose={onClose} footer={<>
      {dish && <button className="btn danger" onClick={() => { if (confirm("Supprimer ce plat ?")) { store.remove("dishes", dish.id); onClose(); } }}><Trash2 />Supprimer</button>}
      <button className="btn primary" onClick={save}>Enregistrer</button></>}>
      <Field label="Nom"><input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Spaghetti carbonara" autoFocus={!dish} /></Field>
      <Field label="Se sert comme">
        <div className="chips">{COURSE_KEYS.map((k) => <button key={k} className={`chip small ${f.courses.includes(k) ? "on" : ""}`} onClick={() => set({ courses: f.courses.includes(k) ? f.courses.filter((x) => x !== k) : [...f.courses, k] })}>{COURSES[k]}</button>)}</div>
      </Field>
      <Field label="Tags (séparés par des virgules)"><input className="input" value={f.tags} onChange={(e) => set({ tags: e.target.value })} placeholder="rapide, pâtes" /></Field>
      <Field label="Ingrédients"><textarea className="input" value={f.ingredients} onChange={(e) => set({ ingredients: e.target.value })} placeholder={"- 400 g de spaghetti\n- …"} /></Field>
      <Field label="Recette"><textarea className="input" style={{ minHeight: 140 }} value={f.recipe} onChange={(e) => set({ recipe: e.target.value })} placeholder={"1. …"} /></Field>
      <Field label="Source"><input className="input" value={f.source} onChange={(e) => set({ source: e.target.value })} placeholder="Une personne, un livre" /></Field>
      <Field label="Lien"><input className="input" value={f.url} onChange={(e) => set({ url: e.target.value })} inputMode="url" /></Field>
      <Field label="Note"><input className="input" value={f.note} onChange={(e) => set({ note: e.target.value })} /></Field>
      <label className="switch"><input type="checkbox" checked={f.favorite} onChange={(e) => set({ favorite: e.target.checked })} />Favori</label>
      <label className="switch"><input type="checkbox" checked={f.archived} onChange={(e) => set({ archived: e.target.checked })} />Archivé (ne plus le proposer)</label>
    </Sheet>
  );
}
