// A small map of a trip home: the rider, the way home by bike, home. Drawn without a map library: the view is fitted
// once to what it shows (no panning, no zooming), so a few map tiles and an SVG line are all it takes.
// Tiles: OpenStreetMap's own (no key needed), turned grey and tinted with Hestia's accent by CSS (.trip-map img and
// .trip-tint), darkened in the dark theme. OSM's tile policy asks for a Referer: the app sends none by default
// (index.html), so the tiles ask for the origin only. CARTO's quieter tiles now want a key.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Point, Route } from "../lib/trip";
import { Glyph } from "./icons";

const TILE = 256, MAX_ZOOM = 17, MIN_ZOOM = 3, PAD = 36;

// Web Mercator: a point in pixels of the whole world at zoom z
const world = (p: Point, z: number) => {
  const s = TILE * 2 ** z, lat = (p.lat * Math.PI) / 180;
  return { x: ((p.lng + 180) / 360) * s, y: ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * s };
};

function useDark() {
  const read = () => {
    const t = document.documentElement.dataset.theme;
    return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  };
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)"), on = () => setDark(read());
    mq.addEventListener("change", on);
    const obs = new MutationObserver(on);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { mq.removeEventListener("change", on); obs.disconnect(); };
  }, []);
  return dark;
}

export function TripMap({ rider, home, route, fresh = true, height = 260 }: { rider: Point | null; home: Point | null; route: Route | null; fresh?: boolean; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const dark = useDark();
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el); setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const points = [...(route?.line ?? []), ...(rider ? [rider] : []), ...(home ? [home] : [])];
  if (!points.length) return <div ref={box} className="trip-map empty" style={{ height }}><span className="small muted">Pas encore de position</span></div>;

  // The largest zoom at which everything fits, padding included
  let z = MAX_ZOOM;
  for (; z > MIN_ZOOM; z--) {
    const xs = points.map((p) => world(p, z).x), ys = points.map((p) => world(p, z).y);
    if (Math.max(...xs) - Math.min(...xs) <= width - 2 * PAD && Math.max(...ys) - Math.min(...ys) <= height - 2 * PAD) break;
  }
  const xs = points.map((p) => world(p, z).x), ys = points.map((p) => world(p, z).y);
  const left = (Math.max(...xs) + Math.min(...xs)) / 2 - width / 2, top = (Math.max(...ys) + Math.min(...ys)) / 2 - height / 2;
  const at = (p: Point) => { const w = world(p, z); return { x: w.x - left, y: w.y - top }; };

  const tiles: { x: number; y: number; key: string; src: string }[] = [];
  const n = 2 ** z;
  if (width) {
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height) / TILE); ty++) {
      if (ty < 0 || ty >= n) continue;
      for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width) / TILE); tx++) {
        const wx = ((tx % n) + n) % n;
        tiles.push({ x: tx * TILE - left, y: ty * TILE - top, key: `${z}/${tx}/${ty}`, src: `https://tile.openstreetmap.org/${z}/${wx}/${ty}.png` });
      }
    }
  }
  const line = route?.line.map(at).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const r = rider && at(rider), h = home && at(home);

  return (
    <div ref={box} className={`trip-map ${dark ? "dark" : ""}`} style={{ height }} aria-label="Carte du trajet">
      {tiles.map((t) => <img key={t.key} src={t.src} alt="" draggable={false} referrerPolicy="strict-origin-when-cross-origin" style={{ left: t.x, top: t.y }} />)}
      <span className="trip-tint" />
      <svg width={width} height={height}>
        {line && <polyline points={line} className={`trip-route ${route?.straight ? "straight" : ""}`} />}
      </svg>
      {h && <span className="trip-home" style={{ left: h.x, top: h.y }}><Glyph name="home" /></span>}
      {r && <span className={`trip-rider ${fresh ? "fresh" : ""}`} style={{ left: r.x, top: r.y }} />}
      <span className="trip-credit">© les contributeurs d'OpenStreetMap</span>
    </div>
  );
}
