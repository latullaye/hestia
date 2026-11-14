// Small building blocks shared by every screen.
import { Check, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useSyncStatus, type Members } from "../lib/hooks";
import type { Member } from "../lib/types";

export function Sheet({ title, onClose, children, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheet-head"><h2>{title}</h2><button className="icon-btn plain" onClick={onClose} aria-label="Fermer"><X /></button></div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Avatar({ member, size, title }: { member: Member | undefined | null; size?: "sm" | "lg"; title?: string }) {
  if (!member) return <span className={`avatar ghost ${size || ""}`} title={title}>?</span>;
  return <span className={`avatar ${size || ""}`} style={{ ["--c" as any]: member.color }} title={title ?? member.name}>{member.name[0]}</span>;
}
export function Avatars({ ids, members, size }: { ids: string[]; members: Members; size?: "sm" | "lg" }) {
  if (!ids.length) return null;
  return <span className="avatars">{ids.map((id) => <Avatar key={id} member={members.byId.get(id)} size={size} />)}</span>;
}

// Pick one or several people. "none": the label of the empty choice ("Toute la famille", "Qui veut")
export function MemberChips({ value, onChange, options, none, single }: { value: string[]; onChange: (ids: string[]) => void; options: Member[]; none?: string; single?: boolean }) {
  const toggle = (id: string) => onChange(single ? (value.includes(id) ? [] : [id]) : value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="chips">
      {none && <button type="button" className={`chip ${value.length ? "" : "on"}`} onClick={() => onChange([])}>{none}</button>}
      {options.map((m) => (
        <button type="button" key={m.id} className={`chip ${value.includes(m.id) ? "on" : ""}`} onClick={() => toggle(m.id)}>
          <Avatar member={m} size="sm" />{m.name}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return <div className="seg">{options.map((o) => <button type="button" key={o.value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>{o.label}</button>)}</div>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <div className="field"><span className="label">{label}</span>{children}{hint && <span className="tiny muted">{hint}</span>}</div>;
}

export function CheckBox({ on, round }: { on: boolean; round?: boolean }) {
  return <span className={`check ${on ? "on" : ""} ${round ? "round" : ""}`}><Check /></span>;
}

export function SyncPill() {
  const s = useSyncStatus();
  if (s.demo) return <span className="sync-pill wait">Démo</span>;
  const cls = !s.online ? "off" : s.pending ? "wait" : s.syncing ? "sync" : "";
  const text = !s.online ? (s.pending ? `Hors ligne · ${s.pending} en attente` : "Hors ligne") : s.pending ? `${s.pending} en attente` : s.error ? "Erreur de synchro" : "À jour";
  return <span className={`sync-pill ${cls} ${s.error && s.online ? "off" : ""}`} title={s.error || ""}>{text}</span>;
}

// ---------- Toasts: toast("Ajouté") from anywhere ----------
let show: (text: string) => void = () => {};
export const toast = (text: string) => show(text);
export function Toaster() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    show = (s) => { setText(s); clearTimeout(t); t = setTimeout(() => setText(null), 2600); };
    return () => clearTimeout(t);
  }, []);
  return text ? <div className="toast" role="status">{text}</div> : null;
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;
