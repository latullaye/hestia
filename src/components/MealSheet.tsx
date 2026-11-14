// What is eaten at one meal: pick among the family's dishes, the recently cooked ones (leftovers for lunch), or type
// anything (a one-off dish, a restaurant). Also says who cooks.
import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { norm } from "@shared/time.ts";
import { KIND_ICON, KIND_LABEL, SLOT_LABEL, cap, fmtDay, mealName, mealsOn, recentDishes } from "../lib/domain";
import { useHousehold, useMembers, useTable, useToday } from "../lib/hooks";
import { store } from "../lib/store";
import type { Meal, MealKind, MealSlot } from "../lib/types";
import { Glyph } from "./icons";
import { Field, MemberChips, Segmented, Sheet, toast } from "./ui";

export function MealSheet({ date, slot, onClose }: { date: string; slot: MealSlot; onClose: () => void }) {
  const { tz } = useHousehold(), today = useToday(tz), members = useMembers();
  const meals = useTable("meal_plan"), dishes = useTable("dishes");
  const dishMap = useMemo(() => new Map(dishes.map((d) => [d.id, d])), [dishes]);
  const entries = mealsOn(meals, date, slot);
  const [editing, setEditing] = useState<Meal | null>(entries.length === 1 ? entries[0] : null);
  const [adding, setAdding] = useState(entries.length === 0);
  const blank = { text: "", dishId: null as string | null, kind: "home" as MealKind, who: [] as string[], cooks: [] as string[], note: "" };
  const [f, setF] = useState(() => (editing ? { text: mealName(editing, dishMap), dishId: editing.dish_id, kind: editing.kind, who: editing.member_ids, cooks: editing.cook_ids, note: editing.note || "" } : blank));
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const open = (m: Meal | null) => {
    setEditing(m); setAdding(!m);
    setF(m ? { text: mealName(m, dishMap), dishId: m.dish_id, kind: m.kind, who: m.member_ids, cooks: m.cook_ids, note: m.note || "" } : blank);
  };
  const recent = recentDishes(meals, dishMap, today);
  const q = norm(f.text);
  const suggestions = dishes.filter((d) => !d.archived && (!q || norm(d.name).includes(q))).sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name)).slice(0, q ? 12 : 30);
  const choose = (name: string, dishId: string | null, kind?: MealKind) => set({ text: name, dishId, ...(kind ? { kind } : {}) });

  const save = () => {
    const text = f.text.trim();
    if (!text && !f.cooks.length) return toast("Choisis un plat, ou qui cuisine.");
    const dish = f.dishId ? dishMap.get(f.dishId) : dishes.find((d) => norm(d.name) === norm(text));
    const exact = dish && norm(dish.name) === norm(text);
    store.put("meal_plan", { ...(editing || {}), date, slot, member_ids: f.who, dish_id: exact ? dish!.id : null, label: exact ? null : text || null, kind: f.kind, cook_ids: f.cooks, note: f.note.trim() || null });
    onClose();
  };
  const form = editing || adding;
  return (
    <Sheet title={`${SLOT_LABEL[slot]} · ${cap(fmtDay(date, { weekday: "long" }))}`} onClose={onClose}
      footer={form ? <>{editing && <button className="btn danger" onClick={() => { store.remove("meal_plan", editing.id); onClose(); }}><Trash2 />Retirer</button>}<button className="btn primary" onClick={save}>Enregistrer</button></> : undefined}>
      {entries.length > 1 && (
        <div className="card flush list">
          {entries.map((m) => (
            <button key={m.id} onClick={() => open(m)} style={editing?.id === m.id ? { background: "var(--accent-soft)" } : undefined}>
              <span className="grow"><b>{mealName(m, dishMap) || "Plat à choisir"}</b> <span className="muted small">{members.names(m.member_ids, "Tout le monde")}</span></span>
            </button>
          ))}
        </div>
      )}
      {!form && <button className="btn" onClick={() => open(null)}>+ Ajouter un autre plat</button>}
      {form && <>
        <Field label="Qu'est-ce qu'on mange ?">
          <input className="input" value={f.text} onChange={(e) => set({ text: e.target.value, dishId: null })} placeholder="Un plat de la liste, ou n'importe quoi" />
        </Field>
        {slot !== "dinner" && recent.length > 0 && (
          <Field label="Restes des derniers jours">
            <div className="chips">{recent.map((r) => <button key={r.name} className={`chip small ${f.text === r.name && f.kind === "leftovers" ? "on" : ""}`} onClick={() => choose(r.name, r.dish_id, "leftovers")}><Glyph name="recycle" />{r.name}</button>)}</div>
          </Field>
        )}
        {suggestions.length > 0 && (
          <Field label={q ? "Dans nos plats" : "Nos plats"}>
            <div className="chips">{suggestions.map((d) => <button key={d.id} className={`chip small ${f.dishId === d.id ? "on" : ""}`} onClick={() => choose(d.name, d.id)}>{d.favorite && <Glyph name="star" />}{d.name}</button>)}</div>
          </Field>
        )}
        <Field label="Type"><Segmented value={f.kind} onChange={(kind) => set({ kind })} options={(["home", "leftovers", "restaurant", "takeout"] as MealKind[]).map((k) => ({ value: k, label: <><Glyph name={KIND_ICON[k]} />{KIND_LABEL[k]}</> }))} /></Field>
        <Field label="Pour qui"><MemberChips value={f.who} options={members.adults} none="Tout le monde" onChange={(who) => set({ who })} /></Field>
        {f.kind === "home" && <Field label="Qui cuisine"><MemberChips value={f.cooks} options={members.adults} onChange={(cooks) => set({ cooks })} /></Field>}
        <Field label="Note"><input className="input" value={f.note} onChange={(e) => set({ note: e.target.value })} /></Field>
      </>}
    </Sheet>
  );
}
