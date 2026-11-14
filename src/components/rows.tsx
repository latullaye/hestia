// Rows used by several screens: an event, a chore to tick.
import { useMemo } from "react";
import { isLate, startTime, timeRange, uncared } from "../lib/domain";
import type { Members } from "../lib/hooks";
import type { CalEvent, Occurrence } from "../lib/types";
import { Glyph } from "./icons";
import { Avatars, CheckBox } from "./ui";

export function EventRow({ event: e, tz, members, onOpen }: { event: CalEvent; tz: string; members: Members; onOpen: (id: string) => void }) {
  const alone = uncared(e, members.all);
  return (
    <button className={`event ${e.status} ${e.kind}`} onClick={() => onOpen(e.id)}>
      <span className="time">{e.all_day ? "Journée" : <>{startTime(e, tz)}{e.ends_at && <small>{timeRange(e, tz).split(" – ")[1]}</small>}</>}</span>
      <span className="bar" />
      <span className="grow col" style={{ gap: 3 }}>
        <span className="title">{e.status === "pending" && <Glyph name="hourglass" />}{e.title}</span>
        <span className="row wrap" style={{ gap: 6 }}>
          <Avatars ids={e.participant_ids} members={members} size="sm" />
          {e.caregiver_ids.length > 0 && <span className="care">avec <Avatars ids={e.caregiver_ids} members={members} size="sm" /></span>}
          {alone.length > 0 && <span className="tag warn">Qui accompagne {alone.map((m) => m.name).join(", ")} ?</span>}
          {e.status === "pending" && <span className="tag warn">Accord de {members.names(e.approver_ids, "?")}</span>}
          {e.status === "declined" && <span className="tag danger">Refusé</span>}
          {e.location && <span className="small muted ellipsis" style={{ maxWidth: 220 }}>{e.location.split("\n")[0].split(",")[0]}</span>}
        </span>
      </span>
    </button>
  );
}

const MOMENT: Record<string, string> = { morning: "Matin", afternoon: "Après-midi", evening: "Soir", anytime: "" };
export function ChoreRow({ occurrence: o, today, members, onToggle, onOpen }: { occurrence: Occurrence; today: string; members: Members; onToggle: (o: Occurrence) => void; onOpen?: (o: Occurrence) => void }) {
  const late = useMemo(() => isLate(o, today), [o, today]);
  return (
    <div className="tap" style={{ cursor: "pointer" }} onClick={() => onToggle(o)}>
      <CheckBox on={o.status === "done"} />
      <span className={`grow ${o.status === "done" ? "strike" : ""}`}>
        <Glyph name={o.emoji} />{o.title}
        <span className="row wrap small muted" style={{ gap: 6 }}>
          {MOMENT[o.time_of_day] && <span>{MOMENT[o.time_of_day]}</span>}
          {late && <span className="tag warn">En retard</span>}
          {!o.chore_id && <span className="tag accent">Ponctuelle</span>}
          {o.status === "done" && o.done_by && <span>Fait par {members.name(o.done_by)}</span>}
          {o.note && <span>{o.note}</span>}
        </span>
      </span>
      <Avatars ids={o.assignee_ids} members={members} />
      {onOpen && !o.chore_id && <button className="btn small" onClick={(e) => { e.stopPropagation(); onOpen(o); }}>…</button>}
    </div>
  );
}
export { startTime };
