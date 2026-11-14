// What is eaten at one meal. A meal can hold several dishes (a main and a dessert, or one dish per person).
// A dish is found by typing: the family's dishes that match show up as one types, and what is typed can also be kept
// as is (a one-off dish, a restaurant). "Restes" proposes what was cooked in the week before the meal.
import { Check, ChevronRight, Plus, Star, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { courseNames } from "@shared/dishes.ts";
import { norm } from "@shared/time.ts";
import { KIND_ICON, KIND_LABEL, SLOT_LABEL, cap, cookedBefore, fmtDay, mealName, mealsOn } from "../lib/domain";
import { useHousehold, useMembers, useTable } from "../lib/hooks";
import { store } from "../lib/store";
import type { Meal, MealKind, MealSlot } from "../lib/types";
import { Glyph } from "./icons";
import { Avatars, Field, MemberChips, Segmented, Sheet, toast } from "./ui";

const RESULTS = 8, CHIPS = 24;
type Form = { text: string; dishId: string | null; kind: MealKind; who: string[]; cooks: string[]; note: string; keep: boolean };
const BLANK: Form = { text: "", dishId: null, kind: "home", who: [], cooks: [], note: "", keep: false };

export function MealSheet({ date, slot, onClose }: { date: string; slot: MealSlot; onClose: () => void }) {
  useHousehold();
  const members = useMembers();
  const meals = useTable("meal_plan"), dishes = useTable("dishes");
  const dishMap = useMemo(() => new Map(dishes.map((d) => [d.id, d])), [dishes]);
  const entries = mealsOn(meals, date, slot);
  // null: the list of what is planned; "new" or a meal: the form
  const [editing, setEditing] = useState<Meal | "new" | null>(entries.length ? null : "new");
  const [f, setF] = useState<Form>(BLANK);
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));
  const open = (m: Meal | "new") => {
    setEditing(m);
    setF(m === "new" ? BLANK : { text: mealName(m, dishMap), dishId: m.dish_id, kind: m.kind, who: m.member_ids, cooks: m.cook_ids, note: m.note || "", keep: false });
  };

  const q = norm(f.text), leftovers = f.kind === "leftovers";
  const known = dishes.filter((d) => !d.archived).sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));
  const exact = known.find((d) => norm(d.name) === q);
  const picked = !!f.dishId && !!exact && exact.id === f.dishId; // a dish was chosen and the text was not changed since
  const cooked = cookedBefore(meals, dishMap, date, slot).filter((r) => !q || norm(r.name).includes(q));
  // Names starting with what is typed come first, then the ones containing it
  const matches = q ? known.filter((d) => norm(d.name).includes(q)).sort((a, b) => Number(norm(b.name).startsWith(q)) - Number(norm(a.name).startsWith(q))).slice(0, RESULTS) : [];

  const save = (another: boolean) => {
    const text = f.text.trim();
    if (!text && !f.cooks.length) return toast("Choisis un plat, ou qui cuisine.");
    let dish = f.dishId ? dishMap.get(f.dishId) : exact;
    if (dish && norm(dish.name) !== norm(text)) dish = undefined;
    if (!dish && text && f.keep) dish = store.put("dishes", { name: text, tags: [], courses: [], ingredients: null, recipe: null, source: null, source_url: null, note: null, favorite: false, archived: false });
    store.put("meal_plan", { ...(editing && editing !== "new" ? editing : {}), date, slot, member_ids: f.who, dish_id: dish ? dish.id : null, label: dish ? null : text || null, kind: f.kind, cook_ids: f.kind === "home" ? f.cooks : [], note: f.note.trim() || null });
    if (another) open("new"); else onClose();
  };

  const title = `${SLOT_LABEL[slot]} · ${cap(fmtDay(date, { weekday: "long" }))}`;
  if (!editing) return (
    <Sheet title={title} onClose={onClose} footer={<button className="btn primary" onClick={onClose}>Terminé</button>}>
      <div className="card flush list">
        {entries.map((m) => (
          <div key={m.id} className="row" style={{ padding: 0 }}>
            <button className="tap grow row" style={{ padding: "11px 14px", gap: 10 }} onClick={() => open(m)}>
              <span className="grow col" style={{ gap: 2 }}>
                <b className="meal-line"><Glyph name={KIND_ICON[m.kind]} />{mealName(m, dishMap) || "Plat à choisir"}</b>
                <span className="small muted row" style={{ gap: 6 }}>{m.member_ids.length ? members.names(m.member_ids) : "Tout le monde"}
                  {m.cook_ids.length > 0 && <span className="care"><Glyph name="chef-hat" /><Avatars ids={m.cook_ids} members={members} size="sm" /></span>}
                  {m.note && <span>· {m.note}</span>}</span>
              </span>
              <ChevronRight size={18} className="muted" />
            </button>
            <button className="icon-btn plain" style={{ marginRight: 6 }} aria-label="Retirer" onClick={() => store.remove("meal_plan", m.id)}><Trash2 /></button>
          </div>
        ))}
      </div>
      <button className="btn" onClick={() => open("new")}><Plus />Ajouter un plat</button>
      <p className="tiny muted">Plusieurs plats au même repas : une entrée, un plat principal, un dessert, ou un plat par personne.</p>
    </Sheet>
  );

  return (
    <Sheet title={title} onClose={entries.length && editing === "new" ? () => setEditing(null) : onClose} footer={<>
      {editing !== "new" && <button className="btn danger" onClick={() => { store.remove("meal_plan", editing.id); if (entries.length > 1) setEditing(null); else onClose(); }}><Trash2 />Retirer</button>}
      <button className="btn" onClick={() => save(true)}><Plus />Autre plat</button>
      <button className="btn primary" onClick={() => save(false)}>Enregistrer</button></>}>
      <Field label="Type"><Segmented value={f.kind} onChange={(kind) => set({ kind })} options={(["home", "leftovers", "restaurant", "takeout"] as MealKind[]).map((k) => ({ value: k, label: <><Glyph name={KIND_ICON[k]} />{KIND_LABEL[k]}</> }))} /></Field>
      <Field label="Qu'est-ce qu'on mange ?">
        <input className="input" value={f.text} autoFocus={editing === "new"} onChange={(e) => set({ text: e.target.value, dishId: null })}
          placeholder={leftovers ? "Les restes de quoi ?" : f.kind === "home" ? "Cherche un plat, ou écris-en un nouveau" : "Nom du resto ou du plat"} />
      </Field>

      {leftovers && !picked && (cooked.length > 0 ? (
        <Field label="Cuisinés dans la semaine">
          <div className="card flush list results">
            {cooked.map((r) => (
              <button key={r.name} onClick={() => set({ text: r.name, dishId: r.dish_id })} className={norm(r.name) === q ? "on" : ""}>
                <span className="grow"><Glyph name="recycle" />{r.name}</span><span className="tiny muted">{cap(fmtDay(r.date, { weekday: "long" }))}</span>
              </button>
            ))}
          </div>
        </Field>
      ) : !q && <p className="small muted">Rien de cuisiné à la maison dans la semaine : écris de quoi sont les restes.</p>)}

      {!leftovers && q && !picked && (
        <div className="card flush list results">
          {matches.map((d) => (
            <button key={d.id} onClick={() => set({ text: d.name, dishId: d.id })}>
              <span className="grow">{d.name} {courseNames(d.courses).map((c) => <span key={c} className="tag">{c}</span>)}</span>
              {d.favorite && <Star size={15} style={{ color: "var(--accent)" }} />}
            </button>
          ))}
          {!exact && <div className="muted small">{matches.length ? "Ou garde" : "Pas dans nos plats : garde"} « {f.text.trim()} » tel quel.</div>}
        </div>
      )}
      {picked && <p className="small muted row" style={{ gap: 6 }}><Check size={15} />Plat de notre liste{courseNames(exact!.courses).length ? ` · ${courseNames(exact!.courses).join(", ")}` : ""}</p>}
      {!leftovers && !q && f.kind === "home" && known.length > 0 && (
        <Field label="Nos plats">
          <div className="chips">{known.slice(0, CHIPS).map((d) => <button key={d.id} className="chip small" onClick={() => set({ text: d.name, dishId: d.id })}>{d.favorite && <Glyph name="star" />}{d.name}</button>)}</div>
        </Field>
      )}
      {f.kind === "home" && q && !exact && (
        <label className="switch"><input type="checkbox" checked={f.keep} onChange={(e) => set({ keep: e.target.checked })} />L'ajouter à nos plats</label>
      )}

      <Field label="Pour qui"><MemberChips value={f.who} options={members.adults} none="Tout le monde" onChange={(who) => set({ who })} /></Field>
      {f.kind === "home" && <Field label="Qui cuisine"><MemberChips value={f.cooks} options={members.adults} onChange={(cooks) => set({ cooks })} /></Field>}
      <Field label="Note"><input className="input" value={f.note} onChange={(e) => set({ note: e.target.value })} /></Field>
    </Sheet>
  );
}
