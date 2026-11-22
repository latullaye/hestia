// Someone on the way home, seen by the others (the notification's "Voir où il est", the home screen's banner, the
// kiosk's chip): their time, their word, and where they are on the way home by bike.
import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { hhmm, minutesLeft } from "../components/Away";
import { TripMap } from "../components/TripMap";
import { SyncPill } from "../components/ui";
import { useHousehold, useMembers, useNow, useTable } from "../lib/hooks";
import { useSession } from "../lib/session";
import { type Point, ago, fmtDistance, homeOf, useBikeRoute } from "../lib/trip";
import type { Arrival } from "../lib/types";

const STALE_MS = 3 * 60_000; // older than this, the point is shown grey: the phone stopped sending

export function TripView({ trip, mapHeight = 280 }: { trip: Arrival; mapHeight?: number }) {
  const household = useHousehold(), members = useMembers(), now = useNow(10_000);
  const loc = useTable("arrival_locations").find((l) => l.id === trip.id);
  const home = homeOf(household);
  const rider: Point | null = loc?.lat != null && loc?.lng != null ? { lat: loc.lat, lng: loc.lng } : null;
  const route = useBikeRoute(rider, home);
  const fresh = !!loc?.located_at && now - Date.parse(loc.located_at) < STALE_MS;
  const left = minutesLeft(trip.eta, now), name = members.name(trip.member_id);
  const over = !!trip.arrived_at || !!trip.deleted_at;

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="card leaving">
        <span className="label">{over ? (trip.arrived_at ? `${name} : à la maison depuis` : "Trajet annulé") : `${name} arrive vers`}</span>
        <div className="leaving-eta">{hhmm(trip.arrived_at ?? trip.eta, household.tz)}</div>
        {!over && <p className="muted" style={{ margin: 0 }}>{left > 0 ? `dans ${left} min` : "devrait être là"}{trip.from_label ? ` · départ ${trip.from_label} à ${hhmm(trip.left_at, household.tz)}` : ""}</p>}
        {trip.note && <p className="trip-note">« {trip.note} »</p>}
      </div>
      {!over && <>
        <TripMap rider={rider} home={home} route={route} fresh={fresh} height={mapHeight} />
        <p className="small muted" style={{ margin: 0 }}>
          {!rider ? "Pas encore de position : elle s'affiche dès que son téléphone l'envoie."
            : <>Position {ago(loc!.located_at!, now)}{loc!.via === "owntracks" ? " (OwnTracks)" : ""}
              {route && !route.straight ? ` · encore ${fmtDistance(route.meters)}, environ ${Math.max(1, Math.round(route.seconds / 60))} min à vélo` : home ? ` · à ${fmtDistance(route?.meters ?? 0)} à vol d'oiseau` : ""}
              {!fresh && " · son téléphone n'envoie plus sa position pour l'instant"}</>}
          {!home && " La maison n'est pas encore placée sur la carte (Réglages › La maison)."}
        </p>
      </>}
    </div>
  );
}

export function Trip() {
  const { id } = useParams(), { me } = useSession(), navigate = useNavigate();
  const trip = useTable("arrivals").find((a) => a.id === id);
  useEffect(() => { if (trip && trip.member_id === me?.id) navigate("/leaving", { replace: true }); }, [trip, me, navigate]);
  return (
    <div className="page">
      <div className="top"><h1 className="grow">Sur le chemin</h1><SyncPill /></div>
      {trip ? <TripView trip={trip} /> : <div className="card col"><span>Ce trajet est terminé.</span><Link to="/" className="btn">Retour</Link></div>}
    </div>
  );
}
