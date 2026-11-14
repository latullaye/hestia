// Settings: this device (notifications, theme), the household (members, weather, reminders, countdowns) and the links
// to the outside (Google Calendar, Claude).
import { Copy, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Glyph, IconPicker } from "../components/icons";
import { Avatar, Field, Segmented, Sheet, SyncPill, toast } from "../components/ui";
import { APP_VERSION, BUILD_TIME, FUNCTIONS_URL } from "../config";
import { disablePush, enablePush, isIOS, isStandalone, pushState, type PushState } from "../lib/device";
import { countdownsFrom, fmtDay } from "../lib/domain";
import { useHousehold, useMembers, useSyncStatus, useTable, useToday } from "../lib/hooks";
import { useSession } from "../lib/session";
import { store } from "../lib/store";
import { callFunction, supabase } from "../lib/supabase";
import type { Countdown, Member } from "../lib/types";

export const applyTheme = () => {
  const t = localStorage.getItem("hestia-theme");
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
};
const COLORS = ["#2f6f73", "#b9765a", "#b89a4e", "#7d6a94", "#6f9a7a", "#a86b6b", "#5f84ad", "#6b7a78"];

export function Settings() {
  const { me, isAdult, demo, email, signOut } = useSession();
  const household = useHousehold(), members = useMembers(), status = useSyncStatus(), today = useToday(household.tz);
  const countdowns = useTable("countdowns");
  const [push, setPush] = useState<PushState>("off");
  const [theme, setTheme] = useState(localStorage.getItem("hestia-theme") || "auto");
  const [member, setMember] = useState<Member | null>(null);
  const [countdown, setCountdown] = useState<Countdown | "new" | null>(null);
  const [gcal, setGcal] = useState<{ configured: boolean; last?: any } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [tokens, setTokens] = useState<{ id: string; label: string | null; created_at: string; last_used_at: string | null; member_id: string }[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);
  const [place, setPlace] = useState(household.weather);
  const [rem, setRem] = useState({ morning: household.reminders.morning ?? "07:30", evening: household.reminders.evening ?? "20:00", before: String(household.reminders.event_minutes_before ?? 60) });

  const loadTokens = async () => { const { data } = await supabase.rpc("list_mcp_tokens"); setTokens((data as any[]) || []); };
  useEffect(() => {
    void pushState().then(setPush);
    if (demo) return;
    callFunction("gcal-sync", undefined, "GET").then(setGcal).catch(() => setGcal(null));
    if (isAdult) void loadTokens();
  }, [demo, isAdult]);

  const togglePush = async () => {
    try {
      if (push === "on") { await disablePush(); setPush("off"); return; }
      const s = await enablePush(me!.id);
      setPush(s);
      toast(s === "on" ? "Notifications activées" : s === "denied" ? "Notifications refusées dans les réglages du téléphone" : "Notifications non disponibles ici");
    } catch (e) { toast(`Impossible : ${(e as Error).message}`); }
  };
  const syncGcal = async () => {
    setSyncing(true);
    try { const r = await callFunction("gcal-sync", {}); setGcal({ configured: r.configured, last: r }); await store.sync(); toast(r.configured ? "Calendrier synchronisé" : "Google Agenda n'est pas encore relié"); }
    catch (e) { toast(`Erreur : ${(e as Error).message}`); }
    setSyncing(false);
  };
  const createToken = async () => {
    const { data, error } = await supabase.rpc("create_mcp_token", { p_label: `Claude · ${new Date().toLocaleDateString("fr-CA")}` });
    if (error) return toast(error.message);
    setFresh(`${FUNCTIONS_URL}/mcp?cle=${data}`);
    void loadTokens();
  };
  const saveHousehold = () => {
    const current = store.byId("settings", "household");
    store.put("settings", { id: "household", value: { ...(current?.value || {}), weather: { label: place.label, latitude: Number(place.latitude), longitude: Number(place.longitude) } } });
    store.put("settings", { id: "reminders", value: { morning: rem.morning, evening: rem.evening, event_minutes_before: Number(rem.before) || 0 } });
    localStorage.removeItem("hestia-weather");
    toast("Enregistré");
  };

  return (
    <div className="page">
      <div className="top"><h1>Réglages</h1><SyncPill /></div>

      <span className="label">Cet appareil</span>
      <div className="card col">
        <div className="row"><Avatar member={me} size="lg" /><div className="grow"><b>{me?.name}</b><div className="small muted">{demo ? "Démonstration" : email}</div></div>
          {!demo && <button className="btn small" onClick={() => { if (confirm("Se déconnecter de cet appareil ?")) void signOut(); }}>Se déconnecter</button>}</div>
        <div className="row"><span className="grow"><b>Notifications</b><div className="small muted">
          {push === "unsupported" ? (isIOS() && !isStandalone() ? "Sur iPhone, installe d'abord Hestia sur l'écran d'accueil." : "Pas disponibles dans ce navigateur.")
            : push === "denied" ? "Refusées : à rétablir dans les réglages du téléphone." : push === "on" ? "Activées sur cet appareil." : "Désactivées sur cet appareil."}</div></span>
          {push !== "unsupported" && push !== "denied" && !demo && <button className={`btn small ${push === "on" ? "" : "primary"}`} onClick={togglePush}>{push === "on" ? "Désactiver" : "Activer"}</button>}</div>
        {push === "on" && <button className="btn small" onClick={() => callFunction("notify", { task: "test" }).then((r) => toast(r.sent ? "Notification envoyée" : "Aucun appareil joint")).catch((e) => toast(e.message))}>Envoyer une notification de test</button>}
        <Field label="Apparence"><Segmented value={theme} onChange={(t) => { setTheme(t); if (t === "auto") localStorage.removeItem("hestia-theme"); else localStorage.setItem("hestia-theme", t); applyTheme(); }}
          options={[{ value: "auto", label: "Comme l'appareil" }, { value: "light", label: "Clair" }, { value: "dark", label: "Sombre" }]} /></Field>
      </div>

      <span className="label">La famille</span>
      <div className="card flush list">
        {members.all.map((m) => (
          <button key={m.id} onClick={() => isAdult && setMember(m)}><Avatar member={m} /><span className="grow">{m.name}
            <span className="small muted"> · {m.role === "adult" ? "adulte" : m.role === "child" ? (m.needs_caregiver ? "enfant, toujours accompagné" : "enfant") : "appareil partagé"}{m.auth_user_id ? "" : m.role === "child" ? "" : " · sans compte"}</span></span></button>
        ))}
      </div>

      {isAdult && <>
        <span className="label">La maison</span>
        <div className="card col">
          <div className="row"><div className="grow"><Field label="Météo : lieu"><input className="input" value={place.label} onChange={(e) => setPlace({ ...place, label: e.target.value })} /></Field></div>
            <Field label="Latitude"><input className="input" style={{ width: 100 }} inputMode="decimal" value={place.latitude} onChange={(e) => setPlace({ ...place, latitude: e.target.value as any })} /></Field>
            <Field label="Longitude"><input className="input" style={{ width: 100 }} inputMode="decimal" value={place.longitude} onChange={(e) => setPlace({ ...place, longitude: e.target.value as any })} /></Field></div>
          <div className="row"><Field label="Résumé du matin"><input className="input" type="time" value={rem.morning} onChange={(e) => setRem({ ...rem, morning: e.target.value })} /></Field>
            <Field label="Rappel du soir"><input className="input" type="time" value={rem.evening} onChange={(e) => setRem({ ...rem, evening: e.target.value })} /></Field>
            <Field label="Avant un événement (min)"><input className="input" style={{ width: 110 }} inputMode="numeric" value={rem.before} onChange={(e) => setRem({ ...rem, before: e.target.value })} /></Field></div>
          <button className="btn primary" onClick={saveHousehold}>Enregistrer</button>
        </div>

        <span className="label">Décomptes</span>
        <div className="card flush list">
          {countdowns.map((c) => { const x = countdownsFrom([c], today)[0]; return <button key={c.id} onClick={() => setCountdown(c)}><span className="grow"><Glyph name={c.emoji} />{c.title}<span className="small muted"> · {fmtDay(x?.date ?? c.target_date, { year: "numeric" })}{c.yearly ? " · chaque année" : ""}</span></span>{x && <span className="tag accent">{x.in} j</span>}</button>; })}
          <button onClick={() => setCountdown("new")}><Plus size={18} /><span className="grow">Ajouter un décompte</span></button>
        </div>

        <span className="label">Google Agenda « Family »</span>
        <div className="card col">
          <span>{gcal === null ? (demo ? "Non disponible en démonstration." : "État inconnu (hors ligne ?).") : gcal.configured ? "Relié. Les événements sont synchronisés toutes les 10 minutes." : "Pas encore relié : voir docs/SETUP.md, « Google Agenda »."}</span>
          {gcal?.last && <span className="small muted">Dernière synchro : {new Date(gcal.last.at).toLocaleString("fr-CA", { timeZone: household.tz, dateStyle: "medium", timeStyle: "short" })}
            {gcal.last.errors?.length ? ` · ${gcal.last.errors.length} erreur(s) : ${gcal.last.errors[0]}` : " · sans erreur"}</span>}
          {!demo && <button className="btn" disabled={syncing} onClick={syncGcal}><RefreshCw />{syncing ? "Synchronisation…" : "Synchroniser maintenant"}</button>}
        </div>

        <span className="label">Connecteur Claude (MCP)</span>
        <div className="card col">
          <span className="small muted">Pour parler à Hestia depuis Claude (« ajoute des œufs à l'épicerie », « qu'est-ce qu'on mange jeudi ? »). Chaque adulte crée son adresse : elle dit qui demande. Voir docs/MCP.md.</span>
          {tokens.filter((t) => t.member_id === me?.id).map((t) => <div key={t.id} className="row"><span className="grow small">{t.label}<span className="muted"> · {t.last_used_at ? `utilisé le ${new Date(t.last_used_at).toLocaleDateString("fr-CA")}` : "jamais utilisé"}</span></span>
            <button className="icon-btn plain" aria-label="Révoquer" onClick={async () => { if (confirm("Révoquer cette adresse ? Le connecteur qui l'utilise cessera de fonctionner.")) { await supabase.rpc("revoke_mcp_token", { p_id: t.id }); void loadTokens(); } }}><Trash2 /></button></div>)}
          {!demo && <button className="btn" onClick={createToken}><Plus />Créer une adresse de connecteur</button>}
        </div>
      </>}

      <span className="label">À propos</span>
      <div className="card col small">
        <span>Hestia {APP_VERSION} · construite le {new Date(BUILD_TIME).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" })}</span>
        <span className="muted">{status.lastSync ? `Dernière synchronisation : ${new Date(status.lastSync).toLocaleTimeString("fr-CA", { timeStyle: "short" })}` : "Jamais synchronisé"}{status.pending ? ` · ${status.pending} modification(s) en attente` : ""}{status.error ? ` · ${status.error}` : ""}</span>
        <button className="btn small" onClick={async () => { const regs = await navigator.serviceWorker?.getRegistrations(); await Promise.all((regs || []).map((r) => r.update())); location.reload(); }}>Chercher une mise à jour</button>
      </div>

      {member && <MemberSheet member={member} onClose={() => setMember(null)} />}
      {countdown && <CountdownSheet countdown={countdown === "new" ? undefined : countdown} onClose={() => setCountdown(null)} />}
      {fresh && (
        <Sheet title="Adresse du connecteur" onClose={() => setFresh(null)}>
          <p>Copie cette adresse maintenant : elle ne sera plus affichée. Elle donne accès aux données de la famille, ne la partage pas.</p>
          <textarea className="input" readOnly value={fresh} style={{ minHeight: 110, fontSize: "0.85rem" }} onFocus={(e) => e.target.select()} />
          <button className="btn primary" onClick={() => navigator.clipboard.writeText(fresh).then(() => toast("Copiée"))}><Copy />Copier</button>
          <p className="small muted">Dans Claude : Paramètres › Connecteurs › Ajouter un connecteur personnalisé, colle l'adresse, sans authentification.</p>
        </Sheet>
      )}
    </div>
  );
}

function MemberSheet({ member: m, onClose }: { member: Member; onClose: () => void }) {
  const [f, setF] = useState({ name: m.name, color: m.color, aliases: m.aliases.join(", "), needs: m.needs_caregiver });
  const save = () => {
    if (!f.name.trim()) return;
    store.put("members", { ...m, name: f.name.trim(), color: f.color, aliases: f.aliases.split(",").map((a) => a.trim()).filter(Boolean), needs_caregiver: f.needs });
    onClose();
  };
  return (
    <Sheet title={m.name} onClose={onClose} footer={<button className="btn primary" onClick={save}>Enregistrer</button>}>
      <Field label="Prénom"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Couleur"><div className="chips">{COLORS.map((c) => <button key={c} className="avatar lg" style={{ ["--c" as any]: c, outline: f.color === c ? "3px solid var(--ink)" : "none" }} onClick={() => setF({ ...f, color: c })} aria-label={c} />)}</div></Field>
      <Field label="Autres noms (surnoms, séparés par des virgules)" hint="Servent à reconnaître la personne dans les titres de Google Agenda et à l'interphone."><input className="input" value={f.aliases} onChange={(e) => setF({ ...f, aliases: e.target.value })} /></Field>
      {m.role === "child" && <label className="switch"><input type="checkbox" checked={f.needs} onChange={(e) => setF({ ...f, needs: e.target.checked })} />Toujours accompagné d'un adulte</label>}
    </Sheet>
  );
}

function CountdownSheet({ countdown: c, onClose }: { countdown?: Countdown; onClose: () => void }) {
  const [f, setF] = useState({ title: c?.title ?? "", emoji: c?.emoji ?? "", date: c?.target_date ?? "", yearly: c?.yearly ?? false, kiosk: c?.show_on_kiosk ?? true });
  const save = () => {
    if (!f.title.trim() || !f.date) return toast("Il faut un titre et une date.");
    store.put("countdowns", { ...(c || {}), title: f.title.trim(), emoji: f.emoji.trim() || null, target_date: f.date, yearly: f.yearly, show_on_kiosk: f.kiosk });
    onClose();
  };
  return (
    <Sheet title={c ? c.title : "Nouveau décompte"} onClose={onClose} footer={<>
      {c && <button className="btn danger" onClick={() => { store.remove("countdowns", c.id); onClose(); }}><Trash2 />Supprimer</button>}<button className="btn primary" onClick={save}>Enregistrer</button></>}>
      <Field label="Titre"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Vacances" /></Field>
      <Field label="Icône"><IconPicker value={f.emoji} onChange={(k) => setF({ ...f, emoji: k ?? "" })} /></Field>
      <Field label="Date"><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      <label className="switch"><input type="checkbox" checked={f.yearly} onChange={(e) => setF({ ...f, yearly: e.target.checked })} />Revient chaque année</label>
      <label className="switch"><input type="checkbox" checked={f.kiosk} onChange={(e) => setF({ ...f, kiosk: e.target.checked })} />Afficher sur le kiosque</label>
    </Sheet>
  );
}
