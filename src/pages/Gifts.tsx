// Gifts: the birthdays and Christmas of the coming two months, what is planned and bought for each person, and their ideas.
// What is planned for someone who uses Hestia is hidden from them; what they write for themselves is a wish the others see.
import { ChevronRight, ExternalLink, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Glyph } from "../components/icons";
import { CheckBox, Empty, Field, Segmented, Sheet, SyncPill, toast } from "../components/ui";
import { cap, fmtDay, inDays, plural } from "../lib/domain";
import { AHEAD_DAYS, KIND_LABEL, OCCASION_LABEL, type Due, addGift, birthdayIn, dueSoon, giftView, isWish, planIdea, toggleBought, yearOptions } from "../lib/gifts";
import { useHousehold, useMembers, useTable, useToday } from "../lib/hooks";
import { useSession } from "../lib/session";
import { store } from "../lib/store";
import type { Gift, GiftKind, GiftPerson, Occasion } from "../lib/types";

type View = ReturnType<typeof giftView>;

export function Gifts() {
  const { tz } = useHousehold(), today = useToday(tz), { me } = useSession();
  const people = [...useTable("gift_people")].sort((a, b) => a.name.localeCompare(b.name));
  const gifts = useTable("gifts"), birthdays = useTable("birthdays");
  const bdays = useMemo(() => new Map(birthdays.map((b) => [b.id, b])), [birthdays]);
  const view = giftView(gifts, people, me?.id ?? null);
  const due = dueSoon(people, bdays, today);
  const [person, setPerson] = useState<GiftPerson | "new" | null>(null);
  const [gift, setGift] = useState<Gift | null>(null);
  const byId = new Map(people.map((p) => [p.id, p]));

  return (
    <div className="page">
      <div className="top"><h1 className="grow">Cadeaux</h1><SyncPill /></div>

      <div className="section-title"><h2>Dans les {AHEAD_DAYS / 30} prochains mois</h2></div>
      {due.map((d) => (
        <div key={d.key} className="card flush list">
          <div className="head row" style={{ gap: 8 }}>
            <Glyph name={d.occasion === "christmas" ? "tree-pine" : "cake"} />
            <b className="grow">{d.occasion === "christmas" ? "Noël" : `Anniversaire de ${d.people[0].name}`}</b>
            <span className="small muted">{cap(fmtDay(d.date, { weekday: "short", month: "short" }))}</span>
            <span className={`tag ${d.in <= 14 ? "warn" : ""}`}>{inDays(d.in)}</span>
          </div>
          {d.people.map((p) => <OccasionBlock key={p.id} due={d} person={p} view={view} me={me?.id ?? null} many={d.people.length > 1} onOpen={setGift} />)}
        </div>
      ))}
      {!due.length && <Empty>Aucun anniversaire ni Noël à préparer dans les {AHEAD_DAYS} prochains jours.</Empty>}

      <div className="section-title"><h2 className="grow">Personnes</h2><button className="btn small" onClick={() => setPerson("new")}><Plus />Personne</button></div>
      <div className="card flush list">
        {people.map((p) => {
          const date = p.for_birthday ? birthdayIn(p, bdays, today) : null, ideas = view.ideas(p.id).length;
          return (
            <button key={p.id} onClick={() => setPerson(p)}>
              <span className="grow col" style={{ gap: 2 }}>
                <b>{p.name}{view.isMine(p) ? " (toi)" : ""}</b>
                <span className="small muted">{[date && `Anniversaire ${fmtDay(date, { weekday: undefined, month: "short" })}`, p.for_birthday && !date && "Anniversaire (date inconnue)", p.for_christmas && "Noël"].filter(Boolean).join(" · ") || "Aucune occasion"}</span>
              </span>
              {ideas > 0 && <span className="tag">{plural(ideas, view.isMine(p) ? "envie" : "idée")}</span>}
              <ChevronRight size={18} className="muted" />
            </button>
          );
        })}
        {!people.length && <div className="muted">Ajoute les personnes à qui vous offrez des cadeaux.</div>}
      </div>
      <p className="tiny muted">Ce que vous prévoyez pour quelqu'un qui utilise Hestia lui est caché. Ce qu'une personne écrit pour elle-même
        (ses envies) est vu par les autres, et ce qu'ils en font reste caché.</p>

      {person && <PersonSheet person={person === "new" ? null : person} view={view} me={me?.id ?? null} onGift={setGift} onClose={() => setPerson(null)} />}
      {gift && byId.get(gift.person_id) && <GiftSheet gift={gift} person={byId.get(gift.person_id)!} me={me?.id ?? null} today={today} onClose={() => setGift(null)} />}
    </div>
  );
}

// One person, at one occasion: what is planned (to tick once bought), their open ideas, and a line to add a present
function OccasionBlock({ due, person, view, me, many, onOpen }: { due: Due; person: GiftPerson; view: View; me: string | null; many: boolean; onOpen: (g: Gift) => void }) {
  const planned = view.planned(person.id, due.occasion, due.year), ideas = view.ideas(person.id), mine = view.isMine(person);
  const bought = planned.filter((g) => g.bought_at).length;
  return (
    <div className="gift-occasion">
      {many && (
        <div className="row" style={{ gap: 8 }}>
          <b className="grow">{person.name}</b>
          {!mine && <span className={`tag ${!planned.length ? "warn" : bought === planned.length ? "accent" : ""}`}>{!planned.length ? "Rien de prévu" : bought === planned.length ? "Prêt" : `${bought} sur ${planned.length} acheté${bought > 1 ? "s" : ""}`}</span>}
        </div>
      )}
      {mine ? (
        <p className="small muted">Ce qu'on te prépare t'est caché. Tes envies : {ideas.length ? ideas.map((g) => g.title).join(", ") : "aucune pour l'instant"}.</p>
      ) : due.occasion === "christmas" ? (["main", "stocking"] as GiftKind[]).map((k) => (
        <div key={k} className="gift-kind">
          <span className="label">{KIND_LABEL[k]}</span>
          {planned.filter((g) => (g.kind ?? "main") === k).map((g) => <GiftLine key={g.id} gift={g} person={person} me={me} onOpen={onOpen} />)}
          {k === "main" && ideas.length > 0 && <IdeaChips ideas={ideas} person={person} me={me} due={due} kind={k} />}
          <AddLine placeholder={k === "main" ? `Gros cadeau pour ${person.name}` : "Pour son bas de Noël"} onAdd={(t) => addGift(person, t, me, due.occasion, due.year, k)} />
        </div>
      )) : <>
        {planned.map((g) => <GiftLine key={g.id} gift={g} person={person} me={me} onOpen={onOpen} />)}
        {!many && !planned.length && <p className="small" style={{ color: "var(--warn)" }}>Rien de prévu pour l'instant.</p>}
        {ideas.length > 0 && <IdeaChips ideas={ideas} person={person} me={me} due={due} kind={null} />}
        <AddLine placeholder={`Un cadeau pour ${person.name}`} onAdd={(t) => addGift(person, t, me, due.occasion, due.year)} />
      </>}
    </div>
  );
}

function GiftLine({ gift: g, person, me, onOpen }: { gift: Gift; person: GiftPerson; me: string | null; onOpen: (g: Gift) => void }) {
  return (
    <div className="gift-line">
      <button className="tap" onClick={() => toggleBought(g, person, me)} aria-label={g.bought_at ? "Pas encore acheté" : "Acheté"}><CheckBox on={!!g.bought_at} round /></button>
      <button className="grow gift-title" onClick={() => onOpen(g)}><span className={g.bought_at ? "strike" : ""}>{g.title}</span>{g.note && <span className="small muted"> · {g.note}</span>}</button>
      {g.url && <a className="icon-btn plain" href={g.url} target="_blank" rel="noreferrer" aria-label="Ouvrir le lien"><ExternalLink /></a>}
    </div>
  );
}

function IdeaChips({ ideas, person, me, due, kind }: { ideas: Gift[]; person: GiftPerson; me: string | null; due: Due; kind: GiftKind | null }) {
  return (
    <div className="chips">{ideas.map((g) => (
      <button key={g.id} className="chip small" onClick={() => { planIdea(g, person, me, due.occasion, due.year, false, kind); toast(`${g.title} : prévu`); }}>
        <Plus size={14} />{g.title}{isWish(g, person) ? <span className="muted"> · envie</span> : null}</button>
    ))}</div>
  );
}

function AddLine({ placeholder, onAdd }: { placeholder: string; onAdd: (title: string) => void }) {
  const [text, setText] = useState("");
  return (
    <form className="row" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { onAdd(text.trim()); setText(""); } }}>
      <input className="input grow" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} enterKeyHint="done" />
      <button className="btn" disabled={!text.trim()}><Plus />Ajouter</button>
    </form>
  );
}

function PersonSheet({ person, view, me, onGift, onClose }: { person: GiftPerson | null; view: View; me: string | null; onGift: (g: Gift) => void; onClose: () => void }) {
  const members = useMembers(), birthdays = [...useTable("birthdays")].sort((a, b) => a.name.localeCompare(b.name));
  const [f, setF] = useState({ name: person?.name ?? "", birthday: person?.birthday_id ?? "", member: person?.member_id ?? "", forBirthday: person?.for_birthday ?? true, forChristmas: person?.for_christmas ?? true, note: person?.note ?? "" });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const mine = !!person && !!me && person.member_id === me;
  const save = () => {
    if (!f.name.trim()) return toast("Donne un nom.");
    store.put("gift_people", { ...(person || {}), name: f.name.trim(), birthday_id: f.birthday || null, member_id: f.member || null, for_birthday: f.forBirthday, for_christmas: f.forChristmas, note: f.note.trim() || null });
    onClose();
  };
  const ideas = person ? view.ideas(person.id) : [], history = person && !mine ? view.history(person.id) : [];
  return (
    <Sheet title={person ? person.name : "Nouvelle personne"} onClose={onClose} footer={<>
      {person && <button className="btn danger" onClick={() => { if (confirm(`Retirer ${person.name} des cadeaux ?`)) { store.remove("gift_people", person.id); onClose(); } }}><Trash2 />Retirer</button>}
      <button className="btn primary" onClick={save}>Enregistrer</button></>}>
      <Field label="Nom"><input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} autoFocus={!person} /></Field>
      <span className="label">Cadeaux pour</span>
      <label className="switch"><input type="checkbox" checked={f.forBirthday} onChange={(e) => set({ forBirthday: e.target.checked })} />Son anniversaire</label>
      <label className="switch"><input type="checkbox" checked={f.forChristmas} onChange={(e) => set({ forChristmas: e.target.checked })} />Noël</label>
      {f.forBirthday && (
        <Field label="Date d'anniversaire (de la liste des anniversaires)">
          <select className="input" value={f.birthday} onChange={(e) => set({ birthday: e.target.value })}>
            <option value="">À choisir</option>
            {birthdays.filter((b) => b.kind === "birthday").map((b) => <option key={b.id} value={b.id}>{b.name} · {b.day}/{b.month}</option>)}
          </select>
        </Field>
      )}
      <Field label="Utilise Hestia" hint="Ce que les autres prévoient pour cette personne lui sera caché.">
        <select className="input" value={f.member} onChange={(e) => set({ member: e.target.value })}>
          <option value="">Non</option>
          {members.adults.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>
      <Field label="Note"><input className="input" value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="Tailles, goûts…" /></Field>

      {person && <>
        <span className="label">{mine ? "Tes envies (les autres les voient)" : "Idées"}</span>
        {ideas.length > 0 && <div className="card flush list">{ideas.map((g) => (
          <button key={g.id} onClick={() => onGift(g)}><span className="grow">{g.title}{g.note && <span className="small muted"> · {g.note}</span>}{isWish(g, person) && !mine ? <span className="tag" style={{ marginLeft: 6 }}>envie</span> : null}</span><ChevronRight size={18} className="muted" /></button>
        ))}</div>}
        <AddLine placeholder={mine ? "Une envie" : "Une idée de cadeau"} onAdd={(t) => addGift(person, t, me)} />
        {history.length > 0 && <>
          <span className="label">Prévus et offerts</span>
          <div className="card flush list">{history.map((g) => (
            <button key={g.id} onClick={() => onGift(g)}><span className="grow">{g.title}</span>
              <span className="small muted">{g.occasion ? `${OCCASION_LABEL[g.occasion]} ${g.year}${g.occasion === "christmas" && g.kind === "stocking" ? " · bas" : ""}` : ""}</span>{g.bought_at && <span className="tag accent">Acheté</span>}</button>
          ))}</div>
        </>}
        {mine && <p className="tiny muted">Ce que les autres te préparent n'apparaît pas ici.</p>}
      </>}
      {!person && <p className="tiny muted">Hors de Hestia (cousins, parents…), tout le monde voit tout. Pour un membre de la famille, choisis-le dans « Utilise Hestia ».</p>}
      {person && !person.birthday_id && f.forBirthday && <p className="tiny muted">Sans date, son anniversaire n'apparaît pas dans les échéances. Ajoute-le dans <b>Anniversaires</b> au besoin.</p>}
    </Sheet>
  );
}

function GiftSheet({ gift, person, me, today, onClose }: { gift: Gift; person: GiftPerson; me: string | null; today: string; onClose: () => void }) {
  const years = yearOptions(today);
  const options: { value: string; label: string }[] = [{ value: "", label: "Idée, sans date" },
    ...years.flatMap((y) => (["birthday", "christmas"] as Occasion[]).map((o) => ({ value: `${o}:${y}`, label: `${OCCASION_LABEL[o]} ${y}` })))];
  const [f, setF] = useState({ title: gift.title, note: gift.note ?? "", url: gift.url ?? "", when: gift.occasion ? `${gift.occasion}:${gift.year}` : "", kind: (gift.kind ?? "main") as GiftKind });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const theirWish = isWish(gift, person) && person.member_id !== me;
  const save = () => {
    if (!f.title.trim()) return toast("Donne un nom au cadeau.");
    const [occasion, year] = f.when ? [f.when.split(":")[0] as Occasion, Number(f.when.split(":")[1])] : [null, null];
    // Someone else's wish is never changed: planning it makes a hidden copy
    const kind = occasion === "christmas" ? f.kind : null;
    if (theirWish) { if (occasion) planIdea(gift, person, me, occasion, year, false, kind); onClose(); return; }
    store.put("gifts", { ...gift, title: f.title.trim(), note: f.note.trim() || null, url: f.url.trim() || null, occasion, year, kind });
    onClose();
  };
  return (
    <Sheet title={gift.title} onClose={onClose} footer={<>
      {!theirWish && <button className="btn danger" onClick={() => { store.remove("gifts", gift.id); onClose(); }}><Trash2 />Supprimer</button>}
      <button className="btn primary" onClick={save}>{theirWish ? "Prévoir" : "Enregistrer"}</button></>}>
      {theirWish && <p className="small muted">Une envie de {person.name}. Elle reste telle quelle ; ce que tu prévois ici lui est caché.</p>}
      <Field label="Cadeau"><input className="input" value={f.title} disabled={theirWish} onChange={(e) => set({ title: e.target.value })} /></Field>
      <Field label="Précision"><input className="input" value={f.note} disabled={theirWish} onChange={(e) => set({ note: e.target.value })} placeholder="Taille, couleur, magasin…" /></Field>
      <Field label="Lien"><input className="input" value={f.url} disabled={theirWish} onChange={(e) => set({ url: e.target.value })} inputMode="url" placeholder="https://…" /></Field>
      {!(person.member_id === me) && (
        <Field label="Pour quand">
          <select className="input" value={f.when} onChange={(e) => set({ when: e.target.value })}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        </Field>
      )}
      {f.when.startsWith("christmas") && (
        <Segmented value={f.kind} onChange={(kind) => set({ kind })} options={(["main", "stocking"] as GiftKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
      )}
      {gift.bought_at && <p className="small muted">Acheté le {new Date(gift.bought_at).toLocaleDateString("fr-CA", { dateStyle: "long" })}.</p>}
    </Sheet>
  );
}
