// What each person chooses to be notified about (members.notify_prefs), read by the app (Réglages) and by the notify
// function before a push goes out. The inbox keeps every notification whatever is chosen here: only the push to the
// phone is skipped or held.
//
//   off           topics the person does not want pushed
//   quiet         "do not disturb" hours, local time; may run past midnight (22:00 → 07:00). A push due then is held,
//                 and sent when the quiet hours end (the notify function retries held pushes every 15 minutes)
//   event_before  how long before an event the reminder comes, in minutes (null: the household's setting)

export type NotifyPrefs = { off?: string[]; quiet?: { from: string; to: string } | null; event_before?: number | null };

export type Topic = { id: string; group: string; label: string; hint: string };

export const NOTIFY_TOPICS: Topic[] = [
  { id: "approval_request", group: "Demandes", label: "Demandes d'approbation", hint: "Quand on te demande ton accord pour une sortie." },
  { id: "approval_decision", group: "Demandes", label: "Réponses à mes demandes", hint: "Approuvé ou refusé." },
  { id: "event_reminder", group: "Agenda", label: "Rappel avant un événement", hint: "Pour ce qui te concerne, ce délai avant." },
  { id: "comment", group: "Agenda", label: "Commentaires", hint: "Sur un événement qui te concerne." },
  { id: "digest", group: "Agenda", label: "Résumé du matin", hint: "La journée en quelques lignes." },
  { id: "task_assigned", group: "Tâches", label: "Nouvelle tâche pour moi", hint: "Quand quelqu'un t'en confie une." },
  { id: "chores_evening", group: "Tâches", label: "Tâches du soir", hint: "Ce qui reste à faire en fin de journée." },
  { id: "arrival", group: "Maison", label: "Quelqu'un rentre", hint: "L'heure d'arrivée, et ses changements." },
  { id: "stay", group: "Maison", label: "Séjours et vacances", hint: "Un départ prévu, confirmé ou annulé." },
];

// The topic of a notification row. The two kinds of "reminder" are told apart by where they lead.
export function topicOf(kind: string, url: string | null | undefined): string {
  if (kind === "reminder") return (url || "").startsWith("#/event/") ? "event_reminder" : "chores_evening";
  return kind;
}

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const mins = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

// True if this local time (HH:MM) falls in the quiet hours; the end is excluded, so the held pushes go out at that time
export function inQuiet(prefs: NotifyPrefs | null | undefined, hm: string): boolean {
  const q = prefs?.quiet;
  if (!q || !HM.test(q.from) || !HM.test(q.to) || q.from === q.to) return false;
  const t = mins(hm), a = mins(q.from), b = mins(q.to);
  return a < b ? t >= a && t < b : t >= a || t < b;
}

export const wantsTopic = (prefs: NotifyPrefs | null | undefined, topic: string) => !(prefs?.off || []).includes(topic);

// What to do with a push: send it now, hold it until the quiet hours end, or skip it (it stays in the inbox)
export function decide(prefs: NotifyPrefs | null | undefined, kind: string, url: string | null | undefined, hm: string): "send" | "hold" | "skip" {
  if (!wantsTopic(prefs, topicOf(kind, url))) return "skip";
  return inQuiet(prefs, hm) ? "hold" : "send";
}

// The reminder lead for this person, in minutes (0: no reminder)
export function eventLead(prefs: NotifyPrefs | null | undefined, household: number): number {
  if (!wantsTopic(prefs, "event_reminder")) return 0;
  const own = prefs?.event_before;
  return typeof own === "number" && own > 0 ? own : household;
}
