// Everything that is not a daily screen: birthdays, the activity log, settings, the kiosk view.
import { Cake, ChevronRight, History, Inbox as InboxIcon, MonitorSmartphone, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Empty, Segmented, SyncPill } from "../components/ui";
import { useHousehold, useMembers, useSyncStatus, useTable } from "../lib/hooks";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { inboxOf } from "./Inbox";

export function More() {
  const { me } = useSession();
  const { badge } = inboxOf(useTable("events"), useTable("notifications"), me);
  const links: { to: string; icon: JSX.Element; label: string; count?: number }[] = [
    { to: "/inbox", icon: <InboxIcon />, label: "Boîte de réception", count: badge },
    { to: "/birthdays", icon: <Cake />, label: "Anniversaires de l'année" }, { to: "/journal", icon: <History />, label: "Journal et statistiques" },
    { to: "/kiosk", icon: <MonitorSmartphone />, label: "Vue kiosque" }, { to: "/settings", icon: <Settings />, label: "Réglages" },
  ];
  return (
    <div className="page">
      <div className="top"><h1>{me ? me.name : "Plus"}</h1><SyncPill /></div>
      <div className="card flush list">{links.map((l) => <Link key={l.to} to={l.to} style={{ textDecoration: "none", color: "inherit" }}><span className="muted row">{l.icon}</span><span className="grow">{l.label}</span>{!!l.count && <span className="tag warn">{l.count}</span>}<ChevronRight size={18} className="muted" /></Link>)}</div>
    </div>
  );
}

const ACTIONS: Record<string, string> = {
  create: "a ajouté", update: "a modifié", delete: "a supprimé", restore: "a rétabli", purchased: "a acheté", needed: "a mis à acheter", unneeded: "a retiré de la liste",
  done: "a fait", reopened: "a remis à faire", skipped: "a passé", approval_requested: "a demandé l'accord pour", approved: "a approuvé", declined: "a refusé", cancelled: "a annulé",
};
const VIA: Record<string, string> = { app: "app", kiosk: "kiosque", intercom: "interphone", mcp: "Claude", gcal: "Google Agenda", system: "Hestia" };
const DOMAINS: Record<string, string[] | null> = { all: null, shopping: ["shopping_items"], chores: ["chore_occurrences", "chores"], meals: ["meal_plan", "dishes"], events: ["events", "event_comments"] };
type Log = { id: number; at: string; actor_id: string | null; via: string; action: string; entity_type: string; label: string | null };
type Top = { item: string; list: string; n: number; last: string };

// Who did what. Read from the server (it is not kept on the device): needs network.
export function Journal() {
  const { tz } = useHousehold(), members = useMembers(), status = useSyncStatus();
  const [domain, setDomain] = useState("all");
  const [rows, setRows] = useState<Log[] | null>(null);
  const [top, setTop] = useState<Top[]>([]);
  useEffect(() => {
    if (status.demo) { setRows([]); return; }
    let stop = false;
    setRows(null);
    (async () => {
      let q = supabase.from("activity_log").select("id, at, actor_id, via, action, entity_type, label").order("at", { ascending: false }).limit(150);
      if (DOMAINS[domain]) q = q.in("entity_type", DOMAINS[domain]!);
      const { data } = await q;
      if (!stop) setRows((data as Log[]) || []);
      if (domain === "shopping") {
        const since = new Date(Date.now() - 90 * 864e5).toISOString();
        const { data: p } = await supabase.from("purchases").select("item, list, at").gte("at", since).order("at", { ascending: false }).limit(2000);
        const by = new Map<string, Top>();
        for (const r of (p as { item: string; list: string; at: string }[]) || []) { const k = `${r.list}|${r.item}`; const t = by.get(k) || { item: r.item, list: r.list, n: 0, last: r.at }; t.n++; by.set(k, t); }
        if (!stop) setTop([...by.values()].sort((a, b) => b.n - a.n).slice(0, 12));
      }
    })();
    return () => { stop = true; };
  }, [domain, status.demo, status.lastSync]);
  const stamp = (iso: string) => new Date(iso).toLocaleString("fr-CA", { timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="page">
      <div className="top"><h1>Journal</h1><SyncPill /></div>
      <Segmented value={domain} onChange={setDomain} options={[{ value: "all", label: "Tout" }, { value: "shopping", label: "Courses" }, { value: "chores", label: "Tâches" }, { value: "meals", label: "Repas" }, { value: "events", label: "Agenda" }]} />
      {domain === "shopping" && top.length > 0 && (
        <div className="card"><span className="label">Les plus achetés (90 jours)</span>
          <div className="chips">{top.map((t) => <span key={t.list + t.item} className="chip small">{t.item} · {t.n}×</span>)}</div></div>
      )}
      <div className="card flush list">
        {rows === null && <div className="muted">Chargement…</div>}
        {rows?.map((r) => (
          <div key={r.id}><span className="grow"><b>{r.actor_id ? members.name(r.actor_id) : VIA[r.via] || "Hestia"}</b> {ACTIONS[r.action] || r.action} {r.label ? <>« {r.label} »</> : null}
            <div className="tiny muted">{stamp(r.at)} · via {VIA[r.via] || r.via}</div></span></div>
        ))}
        {rows?.length === 0 && <Empty>{status.demo ? "Le journal n'existe pas en démonstration." : status.online ? "Rien pour le moment." : "Le journal a besoin du réseau."}</Empty>}
      </div>
    </div>
  );
}
