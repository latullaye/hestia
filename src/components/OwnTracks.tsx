// Réglages › Position en arrière-plan: one secret address per person for OwnTracks, the free app that sends where the
// phone is even when it is locked (supabase/functions/location). The address is shown once, when made.
import { Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { FUNCTIONS_URL } from "../config";
import { supabase } from "../lib/supabase";
import { toast } from "./ui";

type Info = { created_at: string; last_used_at: string | null } | null;
const day = (iso: string) => new Date(iso).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" });

export function OwnTracksCard() {
  const [info, setInfo] = useState<Info | undefined>(undefined);
  const [fresh, setFresh] = useState<string | null>(null);
  const load = async () => { const { data } = await supabase.rpc("location_key_info"); setInfo(((data as any[]) || [])[0] ?? null); };
  useEffect(() => { void load(); }, []);
  const make = async () => {
    if (info && !confirm("Remplacer l'adresse ? L'ancienne cessera de fonctionner : il faudra coller la nouvelle dans OwnTracks.")) return;
    const { data, error } = await supabase.rpc("create_location_key");
    if (error) return toast(error.message);
    setFresh(`${FUNCTIONS_URL}/location?cle=${data}`);
    void load();
  };
  const revoke = async () => {
    if (!confirm("Révoquer l'adresse ? OwnTracks ne pourra plus envoyer ta position.")) return;
    await supabase.rpc("revoke_location_key");
    setFresh(null); void load();
  };

  return (
    <div className="card col">
      <span className="small muted">Pour que ta position s'affiche pendant « Je rentre » même téléphone verrouillé. OwnTracks est une app gratuite et
        libre ; Hestia ne garde sa position que pendant un trajet, et l'efface à l'arrivée.</span>
      {info === undefined ? null : info ? (
        <span className="small">Adresse créée le {day(info.created_at)} · {info.last_used_at ? `dernière position reçue le ${day(info.last_used_at)}` : "rien reçu pour l'instant"}</span>
      ) : <span className="small">Pas encore d'adresse.</span>}
      {fresh && <>
        <div className="row"><code className="grow small selectable" style={{ wordBreak: "break-all" }}>{fresh}</code>
          <button className="icon-btn" aria-label="Copier l'adresse" onClick={() => navigator.clipboard.writeText(fresh).then(() => toast("Adresse copiée"))}><Copy /></button></div>
        <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
          <li>Installe OwnTracks (Play Store ou App Store).</li>
          <li>Dans OwnTracks, Préférences › Connexion : mode <b>HTTP</b>, et colle cette adresse comme URL. Pas d'identifiant.</li>
          <li>Autorise la localisation <b>tout le temps</b> (sinon rien ne part téléphone verrouillé).</li>
          <li>Mode de suivi « Important » : économe en batterie. « Déplacement » est plus précis pendant le trajet.</li>
        </ol>
        <span className="tiny muted">Cette adresse est secrète : elle n'est affichée qu'une fois.</span>
      </>}
      <div className="row">
        <button className="btn" onClick={make}>{info ? "Remplacer l'adresse" : "Créer mon adresse OwnTracks"}</button>
        {info && <button className="btn" onClick={revoke}>Révoquer</button>}
      </div>
    </div>
  );
}
