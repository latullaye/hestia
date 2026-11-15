// "Mes notifications": what reaches this person's phones (all their devices), topic by topic, with quiet hours and their
// own reminder lead. Saved on the member (members.notify_prefs) and applied by the notify function before each push.
// The inbox keeps everything: a muted topic still shows there.
import { NOTIFY_TOPICS, type NotifyPrefs, wantsTopic } from "@shared/notify-prefs.ts";
import { useHousehold, useTable } from "../lib/hooks";
import { store } from "../lib/store";
import { Segmented } from "./ui";

const LEADS = [15, 30, 60, 120];
const leadLabel = (m: number) => (m < 60 ? `${m} min` : `${m / 60} h`);
const GROUPS = [...new Set(NOTIFY_TOPICS.map((t) => t.group))];

function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return <input type="checkbox" role="switch" className="toggle" aria-label={label} checked={on} onChange={(e) => onChange(e.target.checked)} />;
}

export function NotifyPrefsCard({ memberId }: { memberId: string }) {
  const me = useTable("members").find((m) => m.id === memberId);
  const household = useHousehold();
  if (!me) return null;
  const prefs: NotifyPrefs = me.notify_prefs || {};
  const save = (patch: Partial<NotifyPrefs>) => store.put("members", { ...me, notify_prefs: { ...prefs, ...patch } });
  const setTopic = (id: string, on: boolean) => save({ off: on ? (prefs.off || []).filter((x) => x !== id) : [...new Set([...(prefs.off || []), id])] });
  const houseLead = Number(household.reminders.event_minutes_before ?? 60) || 60;
  const lead = prefs.event_before || houseLead;
  const leads = LEADS.includes(lead) ? LEADS : [...LEADS, lead].sort((a, b) => a - b);
  const quiet = prefs.quiet;

  return (
    <div className="card col prefs">
      {GROUPS.map((g) => (
        <div key={g} className="col" style={{ gap: 0 }}>
          <span className="pref-group">{g}</span>
          {NOTIFY_TOPICS.filter((t) => t.group === g).map((t) => {
            const on = wantsTopic(prefs, t.id);
            return (
              <div key={t.id} className="pref">
                <label className="pref-row">
                  <span className="grow col" style={{ gap: 1 }}><span>{t.label}</span><span className="small muted">{t.hint}</span></span>
                  <Toggle on={on} label={t.label} onChange={(v) => setTopic(t.id, v)} />
                </label>
                {t.id === "event_reminder" && on && (
                  <Segmented value={String(lead)} onChange={(v) => save({ event_before: Number(v) === houseLead ? null : Number(v) })}
                    options={leads.map((m) => ({ value: String(m), label: leadLabel(m) }))} />
                )}
              </div>
            );
          })}
        </div>
      ))}

      <div className="col" style={{ gap: 0 }}>
        <span className="pref-group">Ne pas déranger</span>
        <div className="pref">
          <label className="pref-row">
            <span className="grow col" style={{ gap: 1 }}><span>Heures calmes</span><span className="small muted">Ce qui arrive pendant ces heures t'est envoyé à la fin.</span></span>
            <Toggle on={!!quiet} label="Heures calmes" onChange={(v) => save({ quiet: v ? { from: "22:00", to: "07:00" } : null })} />
          </label>
          {quiet && (
            <div className="row" style={{ gap: 8 }}>
              <span className="small muted">De</span>
              <input className="input" type="time" value={quiet.from} onChange={(e) => e.target.value && save({ quiet: { ...quiet, from: e.target.value } })} />
              <span className="small muted">à</span>
              <input className="input" type="time" value={quiet.to} onChange={(e) => e.target.value && save({ quiet: { ...quiet, to: e.target.value } })} />
            </div>
          )}
        </div>
      </div>
      <span className="tiny muted">Pour tous tes appareils. Tout reste dans la boîte de réception, même ce que tu ne reçois pas sur le téléphone.</span>
    </div>
  );
}
