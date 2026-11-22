// "Je rentre": arrival times on the 5-minute grid, distances, and the way home by bike.
//
// Times are always on a 5-minute mark (17 h 30, not 17 h 33): the others get a time that reads well, and the trip
// says "dans 29 min" next to it. The way home is asked of the FOSSGIS OSRM server (OpenStreetMap data, bicycle
// profile, no key: light use only, which a family's trips are). Without it the map draws a straight dashed line.
import { useEffect, useRef, useState } from "react";

export type Point = { lat: number; lng: number };
export const SLOT_MS = 5 * 60_000;

// The first 5-minute mark at least `minutes` from now
export const slotAfter = (now: number, minutes: number) => Math.ceil((now + minutes * 60_000) / SLOT_MS) * SLOT_MS;
// A time moved by `steps` marks, never before the next mark
export const shiftSlot = (eta: number, steps: number, now: number) =>
  Math.max(slotAfter(now, 1), Math.round(eta / SLOT_MS) * SLOT_MS + steps * SLOT_MS);

export function distanceM(a: Point, b: Point): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
// "350 m", "2,4 km"
export const fmtDistance = (m: number) => (m < 1000 ? `${Math.round(m / 50) * 50 || 50} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0).replace(".", ",")} km`);
// "à l'instant", "il y a 3 min", "il y a 1 h 05"
export function ago(iso: string, now: number): string {
  const m = Math.floor((now - Date.parse(iso)) / 60_000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  return `il y a ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

export type Route = { line: Point[]; meters: number; seconds: number; straight?: boolean };
const ROUTER = "https://routing.openstreetmap.de/routed-bike/route/v1/driving";

export async function bikeRoute(from: Point, to: Point, signal?: AbortSignal): Promise<Route> {
  const url = `${ROUTER}/${from.lng.toFixed(5)},${from.lat.toFixed(5)};${to.lng.toFixed(5)},${to.lat.toFixed(5)}?overview=full&geometries=geojson`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`route ${r.status}`);
  const out = await r.json();
  const best = out.routes?.[0];
  if (!best) throw new Error("no route");
  return { line: best.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng })), meters: best.distance, seconds: best.duration };
}

// The way from `from` to `to`, asked again only when the rider has moved 150 m or more (or after 2 minutes): enough to
// follow the trip without asking the server at every point. A straight line while waiting, or if the server is out of reach.
export function useBikeRoute(from: Point | null, to: Point | null): Route | null {
  const [route, setRoute] = useState<Route | null>(null);
  const asked = useRef<{ from: Point; to: Point; at: number } | null>(null);
  useEffect(() => {
    if (!from || !to) { setRoute(null); return; }
    const last = asked.current;
    const fresh = last && distanceM(last.from, from) < 150 && distanceM(last.to, to) < 10 && Date.now() - last.at < 120_000;
    if (fresh && route) return;
    asked.current = { from, to, at: Date.now() };
    const straight: Route = { line: [from, to], meters: distanceM(from, to), seconds: distanceM(from, to) / 4.2, straight: true }; // ~15 km/h
    if (!route) setRoute(straight);
    const stop = new AbortController();
    bikeRoute(from, to, stop.signal).then(setRoute).catch(() => { if (!stop.signal.aborted) setRoute((r) => (r && !r.straight ? r : straight)); });
    return () => stop.abort();
  }, [from?.lat, from?.lng, to?.lat, to?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return route;
}

// Where home is (Réglages › La maison), if it was set
export const homeOf = (household: { home?: Point | null }): Point | null =>
  household.home && Number.isFinite(household.home.lat) && Number.isFinite(household.home.lng) ? household.home : null;
