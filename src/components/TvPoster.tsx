// Réglages › Télé: the days ahead as a picture on the TV's ambient screen (supabase/functions/poster). Two things to set
// once: Google Photos linked (Hestia makes its two albums), and the key the GitHub workflow uses to draw the picture.
import { Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { callFunction } from "../lib/supabase";
import { toast } from "./ui";

type Status = { client: boolean; linked: boolean; key: boolean; album: boolean; at: string | null };
const when = (iso: string) => new Date(iso).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" });

export function TvPosterCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const load = () => callFunction<Status>("poster/status", undefined, "GET").then(setStatus).catch(() => setStatus(null));
  useEffect(() => { void load(); }, []);
  // Back from Google's consent
  useEffect(() => {
    const r = params.get("photos");
    if (!r) return;
    toast(r === "ok" ? "Google Photos est relié" : r === "expire" ? "Lien expiré : recommence" : "Google Photos n'a pas été relié");
    params.delete("photos"); setParams(params, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async () => {
    try {
      const { url } = await callFunction<{ url: string }>("poster/connect", { back: location.origin + location.pathname });
      location.href = url;
    } catch (e) { toast((e as Error).message); }
  };
  const makeKey = async () => {
    if (status?.key && !confirm("Remplacer la clé ? Il faudra coller la nouvelle dans GitHub.")) return;
    try { setKey((await callFunction<{ key: string }>("poster/key", {})).key); void load(); } catch (e) { toast((e as Error).message); }
  };

  return (
    <div className="card col">
      <span className="small muted">Les jours qui viennent en une image 4K, dans l'écran de veille de la Chromecast. Une nouvelle image part
        quand le planning change (vérifié toutes les 30 minutes) ; les anciennes vont dans l'album « Hestia · À supprimer ».</span>
      {!status ? <span className="small muted">État inconnu (hors ligne ?).</span> : <>
        <div className="row"><span className="grow"><b>Google Photos</b><div className="small muted">{status.linked ? "Relié." : status.client ? "Pas encore relié." : "Il manque l'identifiant OAuth de Google (docs/SETUP.md, « Télé »)."}</div></span>
          {status.client && <button className={`btn small ${status.linked ? "" : "primary"}`} onClick={connect}>{status.linked ? "Relier de nouveau" : "Relier"}</button>}</div>
        <div className="row"><span className="grow"><b>Clé pour GitHub</b><div className="small muted">{status.key ? "Créée." : "Pas encore créée."}</div></span>
          <button className="btn small" onClick={makeKey}>{status.key ? "Remplacer" : "Créer"}</button></div>
        {key && <>
          <div className="row"><code className="grow small selectable" style={{ wordBreak: "break-all" }}>{key}</code>
            <button className="icon-btn" aria-label="Copier la clé" onClick={() => navigator.clipboard.writeText(key).then(() => toast("Clé copiée"))}><Copy /></button></div>
          <span className="tiny muted">À coller dans GitHub, dépôt de Hestia › Settings › Secrets and variables › Actions › secret <b>HESTIA_POSTER_KEY</b>.
            Elle n'est affichée qu'une fois.</span>
        </>}
        <span className="small">{status.at ? `Dernière image envoyée le ${when(status.at)}.` : "Pas encore d'image envoyée."}</span>
        {status.album && <span className="tiny muted">Sur la télé : app Google Home › la Chromecast › Écran de veille › Google Photos › album « Hestia · Télé ».
          De temps en temps : Google Photos › album « Hestia · À supprimer » › tout sélectionner › supprimer.</span>}
      </>}
    </div>
  );
}
