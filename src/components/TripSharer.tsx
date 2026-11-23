// While I am on my way home and chose to share where I am, the app sends my position (it runs on every screen, as long
// as Hestia is open). With the phone locked, only OwnTracks can (Réglages, docs/SETUP.md): without it, the screen is
// kept on; with it, the phone may sleep, OwnTracks takes over.
// A point every 20 seconds at most, or sooner after 60 m. Being near home ends the trip (the server decides).
import { useEffect, useRef } from "react";
import { keepAwake } from "../lib/device";
import { useNow, useTable } from "../lib/hooks";
import { useSession } from "../lib/session";
import { store } from "../lib/store";
import { supabase } from "../lib/supabase";
import { distanceM, type Point } from "../lib/trip";
import type { Arrival } from "../lib/types";
import { activeArrivals } from "./Away";
import { ownTracksState } from "./OwnTracks";
import { toast } from "./ui";

const EVERY_MS = 20_000, MOVED_M = 60;
// The choice is the trip's (arrivals.share_location): turned off, the server keeps nothing, from OwnTracks either
export const isSharing = (trip: Arrival) => trip.share_location !== false;

export function TripSharer() {
  const { me, demo } = useSession(), now = useNow(30_000);
  const trip = activeArrivals(useTable("arrivals"), now).find((a) => a.member_id === me?.id);
  const on = !!trip && isSharing(trip) && "geolocation" in navigator;
  const last = useRef<{ p: Point; at: number } | null>(null);

  useEffect(() => {
    if (!on || !trip) return;
    const awake = ownTracksState() === "used" ? () => {} : keepAwake();
    const watch = navigator.geolocation.watchPosition(async (pos) => {
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }, t = Date.now();
      if (last.current && t - last.current.at < EVERY_MS && distanceM(last.current.p, p) < MOVED_M) return;
      last.current = { p, at: t };
      if (demo) {
        store.put("arrival_locations", { id: trip.id, lat: p.lat, lng: p.lng, accuracy: pos.coords.accuracy, located_at: new Date(t).toISOString(), via: "app" });
        return;
      }
      const { data } = await supabase.rpc("share_location", { p_lat: p.lat, p_lng: p.lng, p_accuracy: Math.round(pos.coords.accuracy) });
      if (data === "home") toast("Bienvenue à la maison");
    }, (e) => { if (e.code === e.PERMISSION_DENIED) toast("Position refusée : à autoriser dans les réglages du téléphone"); },
    { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 });
    return () => { navigator.geolocation.clearWatch(watch); awake(); };
  }, [on, trip?.id, demo]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
