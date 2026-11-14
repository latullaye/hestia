// Shopping lists. In the store: what is needed, grouped by aisle in walking order, big boxes to tick. At home: add an
// item (known ones come back with a tap), tidy the aisles.
import { ArrowDown, ArrowUp, Plus, Settings2, Trash2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { norm } from "@shared/time.ts";
import { Glyph, IconPicker } from "../components/icons";
import { CheckBox, Empty, Field, Sheet, SyncPill, toast } from "../components/ui";
import { plural } from "../lib/domain";
import { useTable } from "../lib/hooks";
import { store } from "../lib/store";
import type { ShoppingItem, ShoppingList, ShoppingSection } from "../lib/types";

const stem = (s: string) => norm(s).split(" ").map((w) => (w.length > 3 ? w.replace(/(s|x)$/, "") : w)).join(" ");
export const buy = (i: ShoppingItem) => store.put("shopping_items", { ...i, needed: false, purchased_at: new Date().toISOString() });
export const need = (i: ShoppingItem) => store.put("shopping_items", { ...i, needed: true });

export function Shopping() {
  const lists = [...useTable("shopping_lists")].sort((a, b) => a.sort_order - b.sort_order);
  const allSections = useTable("shopping_sections"), allItems = useTable("shopping_items");
  const params = useParams(), navigate = useNavigate();
  const list = lists.find((l) => l.id === params.listId) || lists[0];
  const [text, setText] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<ShoppingItem | null>(null);
  const [manage, setManage] = useState(false);
  const [justBought, setJustBought] = useState<string[]>([]);
  useEffect(() => { setJustBought([]); setText(""); }, [list?.id]);

  const sections = useMemo(() => allSections.filter((s) => s.list_id === list?.id).sort((a, b) => a.sort_order - b.sort_order), [allSections, list?.id]);
  const items = useMemo(() => allItems.filter((i) => i.list_id === list?.id), [allItems, list?.id]);
  if (!list) return <div className="page"><div className="top"><h1>Courses</h1></div><Empty>Aucune liste.</Empty></div>;

  const q = stem(text);
  const matches = q ? items.filter((i) => stem(i.name).includes(q)).sort((a, b) => Number(stem(b.name) === q) - Number(stem(a.name) === q) || a.name.localeCompare(b.name)).slice(0, 8) : [];
  const add = () => {
    const name = text.trim();
    if (!name) return;
    const known = items.find((i) => stem(i.name) === q);
    if (known) { if (known.needed) toast(`${known.name} est déjà sur la liste`); else need(known); }
    else store.put("shopping_items", { list_id: list.id, section_id: sections.find((s) => norm(s.name) === "autre")?.id ?? null, name: name[0].toUpperCase() + name.slice(1), note: null, needed: true, purchased_at: null, sort_order: 0 });
    setText("");
  };
  const visible = items.filter((i) => showAll || i.needed || justBought.includes(i.id));
  const groups: { section: ShoppingSection | null; items: ShoppingItem[] }[] = [...sections.map((s) => ({ section: s as ShoppingSection | null, items: visible.filter((i) => i.section_id === s.id) })),
    { section: null, items: visible.filter((i) => !i.section_id || !sections.some((s) => s.id === i.section_id)) }].filter((g) => g.items.length);
  const toggle = (i: ShoppingItem) => {
    if (i.needed) { buy(i); setJustBought((x) => [...x, i.id]); } else { need(i); setJustBought((x) => x.filter((id) => id !== i.id)); }
  };
  const left = items.filter((i) => i.needed).length;

  return (
    <div className="page">
      <div className="top"><h1>Courses</h1><SyncPill /><button className="icon-btn" onClick={() => setManage(true)} aria-label="Organiser la liste"><Settings2 /></button></div>
      <div className="chips">{lists.map((l) => {
        const n = allItems.filter((i) => i.list_id === l.id && i.needed).length;
        return <button key={l.id} className={`chip ${l.id === list.id ? "on" : ""}`} onClick={() => navigate(`/shopping/${l.id}`)}><Glyph name={l.emoji} />{l.name}{n ? ` · ${n}` : ""}</button>;
      })}</div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input className="input grow" placeholder={`Ajouter à ${list.name}…`} value={text} onChange={(e) => setText(e.target.value)} enterKeyHint="done" />
        <button className="btn primary" disabled={!text.trim()}><Plus />Ajouter</button>
      </form>
      {matches.length > 0 && <div className="chips">{matches.map((i) => <button key={i.id} className={`chip small ${i.needed ? "on" : ""}`} onClick={() => { if (!i.needed) need(i); setText(""); }}>{i.needed ? "✓ " : "+ "}{i.name}</button>)}</div>}
      <div className="row"><span className="muted small grow">{left ? `${plural(left, "article")} à acheter` : "Rien à acheter"}</span>
        <button className={`chip small ${showAll ? "on" : ""}`} onClick={() => setShowAll(!showAll)}>Tous les articles</button></div>

      {groups.map((g) => (
        <div key={g.section?.id ?? "none"} className="card flush list">
          <div className="head label">{g.section ? <><Glyph name={g.section.emoji} />{g.section.name}</> : "Sans rayon"}</div>
          {g.items.sort((a, b) => Number(b.needed) - Number(a.needed) || a.name.localeCompare(b.name)).map((i) => (
            <div key={i.id} className="tap" style={{ cursor: "pointer" }} onClick={() => toggle(i)}>
              <CheckBox on={!i.needed} round />
              <span className={`grow ${i.needed ? "" : "strike"}`}>{i.name}{i.note ? <span className="small muted"> · {i.note}</span> : null}</span>
              <button className="btn small" onClick={(e) => { e.stopPropagation(); setEditing(i); }}>…</button>
            </div>
          ))}
        </div>
      ))}
      {!groups.length && <Empty>{showAll ? "Cette liste est vide." : "Tout est acheté. Ajoute un article, ou affiche « Tous les articles » pour en remettre."}</Empty>}
      {justBought.length > 0 && !showAll && <button className="btn" onClick={() => setJustBought([])}><Undo2 />Masquer ce qui est coché</button>}

      {editing && <ItemSheet item={editing} lists={lists} sections={allSections} onClose={() => setEditing(null)} />}
      {manage && <ListSheet list={list} sections={sections} count={lists.length} onClose={() => setManage(false)} />}
    </div>
  );
}

function ItemSheet({ item, lists, sections, onClose }: { item: ShoppingItem; lists: ShoppingList[]; sections: ShoppingSection[]; onClose: () => void }) {
  const [f, setF] = useState({ name: item.name, note: item.note ?? "", list: item.list_id, section: item.section_id ?? "" });
  const mine = sections.filter((s) => s.list_id === f.list).sort((a, b) => a.sort_order - b.sort_order);
  const save = () => {
    if (!f.name.trim()) return;
    store.put("shopping_items", { ...item, name: f.name.trim(), note: f.note.trim() || null, list_id: f.list, section_id: mine.some((s) => s.id === f.section) ? f.section : null });
    onClose();
  };
  return (
    <Sheet title={item.name} onClose={onClose} footer={<>
      <button className="btn danger" onClick={() => { store.remove("shopping_items", item.id); onClose(); }}><Trash2 />Supprimer</button>
      {item.needed && <button className="btn" onClick={() => { store.put("shopping_items", { ...item, needed: false }); onClose(); }}>Pas besoin</button>}
      <button className="btn primary" onClick={save}>Enregistrer</button></>}>
      <Field label="Article"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Précision (quantité, marque…)"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="x12, sans lactose…" /></Field>
      <Field label="Liste"><select className="input" value={f.list} onChange={(e) => setF({ ...f, list: e.target.value, section: "" })}>{lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
      <Field label="Rayon"><select className="input" value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })}><option value="">Sans rayon</option>{mine.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      {item.purchased_at && <p className="small muted">Dernier achat : {new Date(item.purchased_at).toLocaleDateString("fr-CA", { dateStyle: "long" })}{item.purchase_count ? ` · acheté ${item.purchase_count} fois` : ""}</p>}
    </Sheet>
  );
}

// The list itself: its name, its aisles in the order of the store, a new list
function ListSheet({ list, sections, count, onClose }: { list: ShoppingList; sections: ShoppingSection[]; count: number; onClose: () => void }) {
  const [name, setName] = useState(list.name), [emoji, setEmoji] = useState(list.emoji ?? "");
  const [section, setSection] = useState(""), [newList, setNewList] = useState("");
  const move = (i: number, by: number) => {
    const order = [...sections];
    const [s] = order.splice(i, 1);
    order.splice(i + by, 0, s);
    order.forEach((x, k) => { if (x.sort_order !== k + 1) store.put("shopping_sections", { ...x, sort_order: k + 1 }); });
  };
  return (
    <Sheet title="Organiser la liste" onClose={() => { if (name.trim() && (name !== list.name || emoji !== (list.emoji ?? ""))) store.put("shopping_lists", { ...list, name: name.trim(), emoji: emoji.trim() || null }); onClose(); }}>
      <Field label="Nom de la liste"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Icône"><IconPicker value={emoji} onChange={(k) => setEmoji(k ?? "")} /></Field>
      <span className="label">Rayons, dans l'ordre du magasin</span>
      <div className="card flush list">
        {sections.map((s, i) => (
          <div key={s.id}><span className="grow"><Glyph name={s.emoji} />{s.name}</span>
            <button className="icon-btn plain" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Monter"><ArrowUp /></button>
            <button className="icon-btn plain" disabled={i === sections.length - 1} onClick={() => move(i, 1)} aria-label="Descendre"><ArrowDown /></button>
            <button className="icon-btn plain" onClick={() => { if (confirm(`Retirer le rayon « ${s.name} » ? Ses articles passent « Sans rayon ».`)) store.remove("shopping_sections", s.id); }} aria-label="Retirer"><Trash2 /></button></div>
        ))}
        {!sections.length && <div className="muted">Pas de rayon : les articles sont en une seule liste.</div>}
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (section.trim()) { store.put("shopping_sections", { list_id: list.id, name: section.trim(), emoji: null, sort_order: sections.length + 1 }); setSection(""); } }}>
        <input className="input grow" placeholder="Nouveau rayon" value={section} onChange={(e) => setSection(e.target.value)} /><button className="btn" disabled={!section.trim()}>Ajouter</button></form>
      <span className="label">Autre liste</span>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (newList.trim()) { store.put("shopping_lists", { name: newList.trim(), emoji: "receipt", sort_order: count + 1, show_on_kiosk: true }); setNewList(""); toast("Liste créée"); } }}>
        <input className="input grow" placeholder="Nouvelle liste (Marché, Animalerie…)" value={newList} onChange={(e) => setNewList(e.target.value)} /><button className="btn" disabled={!newList.trim()}>Créer</button></form>
      <button className="btn danger" onClick={() => { if (confirm(`Supprimer la liste « ${list.name} » et ses articles ?`)) { store.remove("shopping_lists", list.id); onClose(); } }}><Trash2 />Supprimer cette liste</button>
    </Sheet>
  );
}
