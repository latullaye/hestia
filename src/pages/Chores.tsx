// Chores: what is to do (today and the coming days), and the rules that make them come back.
import { Plus } from "lucide-react";
import { useState } from "react";
import { describeSchedule } from "@shared/schedule.ts";
import { RuleSheet, TaskSheet, toggleOccurrence } from "../components/ChoreSheets";
import { Glyph } from "../components/icons";
import { ChoreRow } from "../components/rows";
import { Avatars, Empty, Segmented, SyncPill } from "../components/ui";
import { addDays, cap, dayTitle, fmtDay, occurrencesOn } from "../lib/domain";
import { useHousehold, useMembers, useTable, useToday } from "../lib/hooks";
import { useSession } from "../lib/session";
import type { Chore, Occurrence } from "../lib/types";

export function Chores() {
  const { tz } = useHousehold(), today = useToday(tz), members = useMembers(), { me, acting, isKiosk } = useSession();
  const occurrences = useTable("chore_occurrences"), chores = useTable("chores");
  const [tab, setTab] = useState<"todo" | "rules">("todo");
  const [who, setWho] = useState<"all" | "me">("all");
  const [rule, setRule] = useState<Chore | "new" | null>(null);
  const [task, setTask] = useState<Occurrence | "new" | null>(null);
  const actor = isKiosk ? acting : me;
  const mine = (o: Occurrence) => who === "all" || !o.assignee_ids.length || (actor && o.assignee_ids.includes(actor.id));
  const days = [...Array(8)].map((_, i) => addDays(today, i));
  const toggle = (o: Occurrence) => toggleOccurrence(o, actor?.id ?? null);
  const rules = [...chores].sort((a, b) => Number(b.active) - Number(a.active) || a.title.localeCompare(b.title));
  return (
    <div className="page">
      <div className="top"><h1>Tâches</h1><SyncPill /></div>
      <Segmented value={tab} onChange={setTab} options={[{ value: "todo", label: "À faire" }, { value: "rules", label: `Tâches régulières (${chores.filter((c) => c.active).length})` }]} />
      {tab === "todo" && <>
        <div className="row"><div className="grow" style={{ maxWidth: 260 }}><Segmented value={who} onChange={setWho} options={[{ value: "all", label: "Tout le monde" }, { value: "me", label: "Moi" }]} /></div>
          <button className="btn primary right" onClick={() => setTask("new")}><Plus />Tâche ponctuelle</button></div>
        {days.map((d) => {
          const rows = occurrencesOn(occurrences, d, tz, today).filter(mine);
          if (!rows.length && d !== today) return null;
          return (
            <div key={d} className="col" style={{ gap: 6 }}>
              <div className="section-title"><h2>{dayTitle(d, today)}</h2>{dayTitle(d, today) !== cap(fmtDay(d, { weekday: "long", month: "long" })) && <span className="muted small">{fmtDay(d)}</span>}</div>
              <div className="card flush list">
                {rows.map((o) => <ChoreRow key={o.id} occurrence={o} today={today} members={members} onToggle={d === today ? toggle : () => {}} onOpen={setTask} />)}
                {!rows.length && <div className="muted">Rien à faire.</div>}
              </div>
            </div>
          );
        })}
      </>}
      {tab === "rules" && <>
        <button className="btn primary" onClick={() => setRule("new")}><Plus />Nouvelle tâche régulière</button>
        <div className="card flush list">
          {rules.map((c) => (
            <button key={c.id} onClick={() => setRule(c)}>
              <span className={`grow ${c.active ? "" : "muted"}`}><b><Glyph name={c.emoji} />{c.title}</b>
                <div className="small muted">{cap(describeSchedule(c.schedule, c.time_of_day))}{c.assignment === "rotate" ? " · à tour de rôle" : ""}{c.active ? "" : " · en pause"}</div></span>
              <Avatars ids={c.assignee_ids} members={members} />
            </button>
          ))}
          {!rules.length && <Empty>Aucune tâche régulière. Crée la première : « Vider la litière, tous les soirs ».</Empty>}
        </div>
      </>}
      {rule && <RuleSheet chore={rule === "new" ? undefined : rule} onClose={() => setRule(null)} />}
      {task && <TaskSheet task={task === "new" ? undefined : task} onClose={() => setTask(null)} />}
    </div>
  );
}
