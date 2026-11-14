// The year's birthdays at a glance: the coming ones first, then month by month; remembrance dates apart.
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { MONTHS } from "@shared/schedule.ts";
import { Glyph } from "../components/icons";
import { Empty, Field, Segmented, Sheet, SyncPill, toast } from "../components/ui";
import { BIRTHDAY_ICON, cap, fmtDay, inDays, upcomingBirthdays } from "../lib/domain";
import { useHousehold, useTable, useToday } from "../lib/hooks";
import { store } from "../lib/store";
import type { Birthday } from "../lib/types";

export function Birthdays() {
  const { tz } = useHousehold(), today = useToday(tz);
  const birthdays = useTable("birthdays");
  const [edit, setEdit] = useState<Birthday | "new" | null>(null);
  const all = upcomingBirthdays(birthdays, today);
  const soon = all.filter((b) => b.in <= 30 && b.kind !== "memorial");
  const [, m0, d0] = today.split("-").map(Number);
  const year = Number(today.slice(0, 4));
  const memorial = all.filter((b) => b.kind === "memorial");
  return (
    <div className="page wide">
      <div className="top"><h1>Anniversaires {year}</h1><SyncPill /><button className="btn primary" onClick={() => setEdit("new")}><Plus />Ajouter</button></div>
      {soon.length > 0 && (
        <div className="card flush list">
          <div className="head label">Dans les 30 prochains jours</div>
          {soon.map((b) => (
            <button key={b.id} onClick={() => setEdit(b)}>
              <span className="grow"><Glyph name={BIRTHDAY_ICON[b.kind]} /><b>{b.name}</b>{b.age != null ? ` · ${b.age} ans` : ""}<div className="small muted">{cap(fmtDay(b.next, { weekday: "long", month: "long" }))}{b.gift_ideas ? <> · <Glyph name="gift" />{b.gift_ideas}</> : ""}{b.note ? ` · ${b.note}` : ""}</div></span>
              <span className={`tag ${b.in <= 7 ? "warn" : ""}`}>{inDays(b.in)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="months">
        {MONTHS.map((name, i) => {
          const rows = birthdays.filter((b) => b.month === i + 1 && b.kind !== "memorial").sort((a, b) => a.day - b.day || a.name.localeCompare(b.name));
          return (
            <div key={name} className={`card month-card ${i + 1 === m0 ? "now" : ""}`}>
              <h3>{cap(name)} <span className="muted small">{rows.length || ""}</span></h3>
              {rows.map((b) => (
                <button key={b.id} className={`bday ${i + 1 < m0 || (i + 1 === m0 && b.day < d0) ? "past" : ""}`} onClick={() => setEdit(b)}>
                  <span className="d">{b.day}</span><span className="grow">{b.kind === "anniversary" && <Glyph name="heart" />}{b.name}{b.year ? <span className="muted small"> · {year - b.year} ans</span> : null}</span>
                </button>
              ))}
              {!rows.length && <span className="muted small">—</span>}
            </div>
          );
        })}
      </div>
      {memorial.length > 0 && (
        <div className="card flush list">
          <div className="head label"><Glyph name="flame" />En mémoire</div>
          {memorial.map((b) => <button key={b.id} onClick={() => setEdit(b)}><span className="grow">{b.name}{b.year ? ` (${b.year})` : ""}<div className="small muted">{b.day} {MONTHS[b.month - 1]}{b.note ? ` · ${b.note}` : ""}</div></span></button>)}
        </div>
      )}
      {!birthdays.length && <Empty>Aucun anniversaire pour le moment. Ceux du calendrier Google « Family » arrivent tout seuls une fois le calendrier relié.</Empty>}
      {edit && <BirthdaySheet birthday={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function BirthdaySheet({ birthday: b, onClose }: { birthday?: Birthday; onClose: () => void }) {
  const [f, setF] = useState({ name: b?.name ?? "", day: b?.day ?? 1, month: b?.month ?? 1, year: b?.year ? String(b.year) : "", kind: b?.kind ?? "birthday", note: b?.note ?? "", gifts: b?.gift_ideas ?? "" });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const save = () => {
    if (!f.name.trim()) return toast("Donne un nom.");
    const year = Number(f.year);
    store.put("birthdays", { ...(b || {}), name: f.name.trim(), day: f.day, month: f.month, year: year >= 1900 && year <= 2100 ? year : null, kind: f.kind, note: f.note.trim() || null, gift_ideas: f.gifts.trim() || null });
    onClose();
  };
  return (
    <Sheet title={b ? b.name : "Nouvel anniversaire"} onClose={onClose} footer={<>
      {b && <button className="btn danger" onClick={() => { if (confirm("Supprimer cet anniversaire ?")) { store.remove("birthdays", b.id); onClose(); } }}><Trash2 />Supprimer</button>}
      <button className="btn primary" onClick={save}>Enregistrer</button></>}>
      <Field label="Nom"><input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} autoFocus={!b} /></Field>
      <div className="row">
        <Field label="Jour"><select className="input" value={f.day} onChange={(e) => set({ day: Number(e.target.value) })}>{[...Array(31)].map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></Field>
        <div className="grow"><Field label="Mois"><select className="input" value={f.month} onChange={(e) => set({ month: Number(e.target.value) })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></Field></div>
        <Field label="Année (si connue)"><input className="input" style={{ width: 110 }} inputMode="numeric" value={f.year} onChange={(e) => set({ year: e.target.value })} placeholder="1990" /></Field>
      </div>
      <Field label="Type"><Segmented value={f.kind} onChange={(kind) => set({ kind })} options={[{ value: "birthday", label: <><Glyph name="cake" />Naissance</> }, { value: "anniversary", label: <><Glyph name="heart" />Couple, famille</> }, { value: "memorial", label: <><Glyph name="flame" />En mémoire</> }]} /></Field>
      <Field label="Idées de cadeaux"><textarea className="input" value={f.gifts} onChange={(e) => set({ gifts: e.target.value })} /></Field>
      <Field label="Note"><input className="input" value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="Lien de parenté, etc." /></Field>
    </Sheet>
  );
}
