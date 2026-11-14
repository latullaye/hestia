// Chores: the editor of a recurring rule (who, how often, when) and the sheet of a one-off task.
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { MONTHS, WEEKDAYS, describeSchedule, nextDays, openUntil, scheduleError, type Schedule } from "@shared/schedule.ts";
import { cap, fmtDay } from "../lib/domain";
import { useHousehold, useMembers, useToday } from "../lib/hooks";
import { useSession } from "../lib/session";
import { store } from "../lib/store";
import type { Chore, Occurrence, TimeOfDay } from "../lib/types";
import { IconPicker } from "./icons";
import { Field, MemberChips, Segmented, Sheet, toast } from "./ui";

const TIMES: { value: TimeOfDay; label: string }[] = [{ value: "morning", label: "Matin" }, { value: "afternoon", label: "Après-midi" }, { value: "evening", label: "Soir" }, { value: "anytime", label: "Peu importe" }];
type Kind = "daily" | "weekly" | "monthly-days" | "monthly-nth" | "yearly-months" | "yearly-date";
const kindOf = (s: Schedule): Kind => s.type === "monthly" ? (s.nth != null ? "monthly-nth" : "monthly-days") : s.type === "yearly" ? (s.day != null ? "yearly-date" : "yearly-months") : s.type;
const toggle = (xs: number[], x: number) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x].sort((a, b) => a - b));

export function RuleSheet({ chore, onClose }: { chore?: Chore; onClose: () => void }) {
  const { tz } = useHousehold(), today = useToday(tz), members = useMembers();
  const s0 = chore?.schedule ?? ({ type: "weekly", weekdays: [6] } as Schedule);
  const [title, setTitle] = useState(chore?.title ?? "");
  const [emoji, setEmoji] = useState(chore?.emoji ?? "");
  const [who, setWho] = useState(chore?.assignee_ids ?? []);
  const [rotate, setRotate] = useState(chore?.assignment === "rotate");
  const [time, setTime] = useState<TimeOfDay>(chore?.time_of_day ?? "anytime");
  const [active, setActive] = useState(chore?.active ?? true);
  const [kind, setKind] = useState<Kind>(kindOf(s0));
  const [every, setEvery] = useState(("every" in s0 && s0.every) || 1);
  const [weekdays, setWeekdays] = useState(s0.type === "weekly" ? s0.weekdays : [6]);
  const [days, setDays] = useState(s0.type === "monthly" && s0.days ? s0.days : [1]);
  const [nth, setNth] = useState(s0.type === "monthly" && s0.nth != null ? s0.nth : 1);
  const [weekday, setWeekday] = useState(s0.type === "monthly" && s0.weekday != null ? s0.weekday : 6);
  const [months, setMonths] = useState(s0.type === "yearly" ? s0.months ?? (s0.month ? [s0.month] : [5]) : [5]);
  const [day, setDay] = useState(s0.type === "yearly" && s0.day != null ? s0.day : 1);
  const [grace, setGrace] = useState(s0.grace_days ?? 0);

  const g = grace > 0 ? { grace_days: grace } : {}, e = every > 1 ? { every } : {};
  const schedule: Schedule = kind === "daily" ? { type: "daily", ...e, ...g } : kind === "weekly" ? { type: "weekly", weekdays, ...e, ...g }
    : kind === "monthly-days" ? { type: "monthly", days, ...e, ...g } : kind === "monthly-nth" ? { type: "monthly", nth, weekday, ...e, ...g }
    : kind === "yearly-months" ? { type: "yearly", months } : { type: "yearly", month: months[0] ?? 1, day, ...g };
  const error = !title.trim() ? "Donne un titre." : scheduleError(schedule);
  const start = chore?.start_date ?? today;
  const preview = error ? [] : nextDays(schedule, start, today, 4);

  const save = () => {
    if (error) return toast(cap(error));
    store.put("chores", { ...(chore || { start_date: today, sort_order: 0, description: null, end_date: null }), title: title.trim(), emoji: emoji.trim() || null, assignee_ids: who,
      assignment: rotate && who.length > 1 ? "rotate" : "fixed", schedule, time_of_day: time, active });
    toast(chore ? "Règle mise à jour" : "Règle créée");
    onClose();
  };
  const unit = kind === "daily" ? "jours" : kind === "weekly" ? "semaines" : "mois";
  return (
    <Sheet title={chore ? "Modifier la tâche" : "Nouvelle tâche régulière"} onClose={onClose} footer={<>
      {chore && <button className="btn danger" onClick={() => { if (confirm("Supprimer cette règle ? Ce qui a déjà été fait reste au journal.")) { store.remove("chores", chore.id); onClose(); } }}><Trash2 />Supprimer</button>}
      <button className="btn primary" onClick={save}>Enregistrer</button></>}>
      <div className="row">
        <div className="grow"><Field label="Tâche"><input className="input" value={title} onChange={(ev) => setTitle(ev.target.value)} placeholder="Vider la litière" autoFocus={!chore} /></Field></div>
      </div>
      <Field label="Icône"><IconPicker value={emoji} onChange={(k) => setEmoji(k ?? "")} /></Field>
      <Field label="Qui"><MemberChips value={who} options={members.family.filter((m) => !m.needs_caregiver)} none="Qui veut" onChange={setWho} /></Field>
      {who.length > 1 && <label className="switch"><input type="checkbox" checked={rotate} onChange={(ev) => setRotate(ev.target.checked)} />À tour de rôle (sinon : ensemble)</label>}
      <Field label="Fréquence">
        <select className="input" value={kind} onChange={(ev) => setKind(ev.target.value as Kind)}>
          <option value="daily">Tous les jours (ou tous les N jours)</option>
          <option value="weekly">Certains jours de la semaine</option>
          <option value="monthly-days">Certains jours du mois</option>
          <option value="monthly-nth">Un jour précis du mois (1er samedi…)</option>
          <option value="yearly-months">Une fois dans l'année, dans le courant d'un mois</option>
          <option value="yearly-date">Une fois par an, à une date</option>
        </select>
      </Field>
      {kind === "weekly" && <div className="chips">{WEEKDAYS.map((w, i) => <button key={w} className={`chip small ${weekdays.includes(i + 1) ? "on" : ""}`} onClick={() => setWeekdays(toggle(weekdays, i + 1))}>{w.slice(0, 3)}.</button>)}</div>}
      {kind === "monthly-days" && <div className="chips">{[...Array(31)].map((_, i) => <button key={i} className={`chip small ${days.includes(i + 1) ? "on" : ""}`} onClick={() => setDays(toggle(days, i + 1))}>{i + 1}</button>)}
        <button className={`chip small ${days.includes(-1) ? "on" : ""}`} onClick={() => setDays(toggle(days, -1))}>Dernier jour</button></div>}
      {kind === "monthly-nth" && <div className="row">
        <select className="input" value={nth} onChange={(ev) => setNth(Number(ev.target.value))}>{[[1, "1er"], [2, "2e"], [3, "3e"], [4, "4e"], [-1, "Dernier"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select className="input" value={weekday} onChange={(ev) => setWeekday(Number(ev.target.value))}>{WEEKDAYS.map((w, i) => <option key={w} value={i + 1}>{w}</option>)}</select>
      </div>}
      {kind === "yearly-months" && <div className="chips">{MONTHS.map((m, i) => <button key={m} className={`chip small ${months.includes(i + 1) ? "on" : ""}`} onClick={() => setMonths(toggle(months, i + 1))}>{m}</button>)}</div>}
      {kind === "yearly-date" && <div className="row">
        <select className="input" value={day} onChange={(ev) => setDay(Number(ev.target.value))}>{[...Array(31)].map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select>
        <select className="input" value={months[0] ?? 1} onChange={(ev) => setMonths([Number(ev.target.value)])}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
      </div>}
      {!kind.startsWith("yearly") && <div className="row">
        <Field label={`Tous les… (${unit})`}><input className="input" type="number" min={1} max={52} value={every} onChange={(ev) => setEvery(Math.max(1, Number(ev.target.value) || 1))} /></Field>
        <Field label="Si ce n'est pas fait, reporter de… (jours)"><input className="input" type="number" min={0} max={31} value={grace} onChange={(ev) => setGrace(Math.max(0, Number(ev.target.value) || 0))} /></Field>
      </div>}
      <Field label="Moment de la journée"><Segmented value={time} onChange={setTime} options={TIMES} /></Field>
      <label className="switch"><input type="checkbox" checked={active} onChange={(ev) => setActive(ev.target.checked)} />Active</label>
      <div className="card accent">
        <b>{error ? cap(error) : cap(describeSchedule(schedule, time))}</b>
        {preview.length > 0 && <div className="small muted">Prochaines fois : {preview.map((d) => `${fmtDay(d)}${openUntil(schedule, d) !== d ? ` (jusqu'au ${fmtDay(openUntil(schedule, d), { weekday: undefined })})` : ""}`).join(" · ")}</div>}
      </div>
    </Sheet>
  );
}

// A one-off task, for oneself or given to someone
export function TaskSheet({ task, onClose }: { task?: Occurrence; onClose: () => void }) {
  const { tz } = useHousehold(), today = useToday(tz), members = useMembers(), { me, acting, isKiosk } = useSession();
  const actor = isKiosk ? acting : me;
  const [title, setTitle] = useState(task?.title ?? "");
  const [who, setWho] = useState(task?.assignee_ids ?? (actor ? [actor.id] : []));
  const [date, setDate] = useState(task?.due_date ?? today);
  const [note, setNote] = useState(task?.note ?? "");
  const save = () => {
    if (!title.trim()) return toast("Donne un titre.");
    store.put("chore_occurrences", { ...(task || { chore_id: null, emoji: null, due_until: null, time_of_day: "anytime", status: "todo", done_by: null, done_at: null }),
      title: title.trim(), assignee_ids: who, due_date: date, note: note.trim() || null });
    onClose();
  };
  return (
    <Sheet title={task ? "Tâche" : "Nouvelle tâche ponctuelle"} onClose={onClose} footer={<>
      {task && <button className="btn danger" onClick={() => { store.remove("chore_occurrences", task.id); onClose(); }}><Trash2 />Supprimer</button>}
      <button className="btn primary" onClick={save}>Enregistrer</button></>}>
      <Field label="À faire"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Appeler le plombier" autoFocus={!task} /></Field>
      <Field label="Pour qui" hint="La personne est prévenue par une notification."><MemberChips value={who} options={members.family.filter((m) => !m.needs_caregiver)} none="Qui veut" onChange={setWho} /></Field>
      <Field label="À partir du"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Note"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <p className="small muted">Elle reste affichée jusqu'à ce qu'elle soit faite.</p>
    </Sheet>
  );
}

// Ticking a chore: done by the person acting (on the kiosk: the one picked, else the assignee when there is only one)
export function toggleOccurrence(o: Occurrence, actorId: string | null) {
  const done = o.status === "done";
  store.put("chore_occurrences", { ...o, status: done ? "todo" : "done", done_by: done ? null : actorId ?? (o.assignee_ids.length === 1 ? o.assignee_ids[0] : null), done_at: done ? null : new Date().toISOString() });
}
