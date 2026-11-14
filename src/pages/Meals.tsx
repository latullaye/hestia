// The week's meals, and the family's dishes with their recipes.
import { ChevronLeft, ChevronRight, Plus, Star, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { norm } from "@shared/time.ts";
import { MealSheet } from "../components/MealSheet";
import { Avatars, Empty, Field, Segmented, Sheet, SyncPill, toast } from "../components/ui";
import { KIND_EMOJI, addDays, cap, dayTitle, fmtDay, mealName, mealsOn } from "../lib/domain";
import { useHousehold, useMembers, useTable, useToday } from "../lib/hooks";
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
  const days = [...Array(7)].map((_, i) => addDays(start, i));
  const cell = (date: string, slot: MealSlot) => {
    const ms = mealsOn(meals, date, slot);
    return (
      <button className="tap" onClick={() => setSheet({ date, slot })}>
        <span className="label" style={{ width: 58 }}>{slot === "lunch" ? "Lunch" : "Souper"}</span>
        <span className="grow col" style={{ gap: 2 }}>
          {ms.length ? ms.map((m) => (
            <span key={m.id} className="meal-line">{KIND_EMOJI[m.kind]} {mealName(m, dishMap) || <span className="muted">Plat à choisir</span>}
              {m.member_ids.length > 0 && <Avatars ids={m.member_ids} members={members} size="sm" />}
              {m.cook_ids.length > 0 && <span className="care">👩‍🍳 <Avatars ids={m.cook_ids} members={members} size="sm" /></span>}
              {m.note && <span className="small muted">{m.note}</span>}</span>
          )) : <span className="muted">—</span>}
        </span>
      </button>
    );
  };
  const shown = dishes.filter((d) => !q || norm(`${d.name} ${d.tags.join(" ")}`).includes(norm(q))).sort((a, b) => Number(a.archived) - Number(b.archived) || Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));
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
        {days.map((d) => (
          <div key={d} className="col" style={{ gap: 6 }}>
            <div className="section-title"><h2>{dayTitle(d, today)}</h2>{dayTitle(d, today) !== cap(fmtDay(d, { weekday: "long", month: "long" })) && <span className="muted small">{fmtDay(d)}</span>}</div>
            <div className="card flush list">{cell(d, "lunch")}{cell(d, "dinner")}</div>
          </div>
        ))}
      </>}
      {tab === "dishes" && <>
        <div className="row"><input className="input grow" placeholder="Chercher un plat" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn primary" onClick={() => setDish("new")}><Plus />Plat</button></div>
        <div className="card flush list">
          {shown.map((d) => (
            <button key={d.id} onClick={() => setDish(d)}>
              <span className={`grow ${d.archived ? "muted" : ""}`}>{d.name} {d.tags.map((t) => <span key={t} className="tag">{t}</span>)}{d.recipe ? <span className="tag accent">Recette</span> : null}{d.archived ? <span className="tag">Archivé</span> : null}</span>
              {d.favorite && <Star size={16} fill="currentColor" style={{ color: "var(--warn)" }} />}
            </button>
          ))}
          {!shown.length && <Empty>Aucun plat pour le moment. Ajoute ceux que vous cuisinez souvent.</Empty>}
        </div>
      </>}
      {sheet && <MealSheet {...sheet} onClose={() => setSheet(null)} />}
      {dish && <DishSheet dish={dish === "new" ? undefined : dish} onClose={() => setDish(null)} />}
    </div>
  );
}

function DishSheet({ dish, onClose }: { dish?: Dish; onClose: () => void }) {
  const [f, setF] = useState({ name: dish?.name ?? "", tags: dish?.tags.join(", ") ?? "", ingredients: dish?.ingredients ?? "", recipe: dish?.recipe ?? "", note: dish?.note ?? "", url: dish?.source_url ?? "", favorite: dish?.favorite ?? false, archived: dish?.archived ?? false });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const save = () => {
    if (!f.name.trim()) return toast("Donne un nom au plat.");
    store.put("dishes", { ...(dish || {}), name: f.name.trim(), tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean), ingredients: f.ingredients.trim() || null, recipe: f.recipe.trim() || null,
      note: f.note.trim() || null, source_url: f.url.trim() || null, favorite: f.favorite, archived: f.archived });
    onClose();
  };
  return (
    <Sheet title={dish ? dish.name : "Nouveau plat"} onClose={onClose} footer={<>
      {dish && <button className="btn danger" onClick={() => { if (confirm("Supprimer ce plat ?")) { store.remove("dishes", dish.id); onClose(); } }}><Trash2 />Supprimer</button>}
      <button className="btn primary" onClick={save}>Enregistrer</button></>}>
      <Field label="Nom"><input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Spaghetti carbonara" autoFocus={!dish} /></Field>
      <Field label="Tags (séparés par des virgules)"><input className="input" value={f.tags} onChange={(e) => set({ tags: e.target.value })} placeholder="rapide, pâtes" /></Field>
      <Field label="Ingrédients"><textarea className="input" value={f.ingredients} onChange={(e) => set({ ingredients: e.target.value })} placeholder={"- 400 g de spaghetti\n- …"} /></Field>
      <Field label="Recette"><textarea className="input" style={{ minHeight: 140 }} value={f.recipe} onChange={(e) => set({ recipe: e.target.value })} placeholder={"1. …"} /></Field>
      <Field label="Lien"><input className="input" value={f.url} onChange={(e) => set({ url: e.target.value })} inputMode="url" /></Field>
      <Field label="Note"><input className="input" value={f.note} onChange={(e) => set({ note: e.target.value })} /></Field>
      <label className="switch"><input type="checkbox" checked={f.favorite} onChange={(e) => set({ favorite: e.target.checked })} />Favori ⭐</label>
      <label className="switch"><input type="checkbox" checked={f.archived} onChange={(e) => set({ archived: e.target.checked })} />Archivé (ne plus le proposer)</label>
    </Sheet>
  );
}
