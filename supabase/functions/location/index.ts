// Where someone on the way home is, sent by OwnTracks (https://owntracks.org) from their phone, even locked.
//   POST ?cle=hsl_…   (or HTTP Basic auth, the key as password)   body: an OwnTracks message, or a list of them
// Each person makes their key in Réglages; the address goes into OwnTracks once (docs/SETUP.md). Points are kept only
// during a "Je rentre" trip (private.record_location): the rest of the day, what OwnTracks sends is dropped.
import { json, preflight } from "../_shared/http.ts";
import { db } from "../_shared/runtime.ts";

const KEY = /^hsl_[0-9a-f]{64}$/;

function keyOf(req: Request): string {
  const fromUrl = new URL(req.url).searchParams.get("cle");
  if (fromUrl) return fromUrl;
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Basic ")) return "";
  try { return atob(auth.slice(6)).split(":").slice(1).join(":"); } catch { return ""; }
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const key = keyOf(req);
  if (!KEY.test(key)) return json({ error: "auth" }, 401);
  const member = (await db.one(`select private.location_key_member($1) as id`, [key]))?.id;
  if (!member) return json({ error: "auth" }, 401);
  const body = await req.json().catch(() => null);
  let kept = 0;
  for (const p of Array.isArray(body) ? body : [body]) {
    if (!p || p._type !== "location" || typeof p.lat !== "number" || typeof p.lon !== "number") continue; // waypoints, status…
    const at = typeof p.tst === "number" ? p.tst : Date.now() / 1000;
    const r = await db.one(`select private.record_location($1::uuid, $2, $3, $4, to_timestamp($5), 'owntracks') as r`,
      [member, p.lat, p.lon, typeof p.acc === "number" ? p.acc : null, at]);
    if (r?.r === "ok" || r?.r === "home") kept++;
  }
  // OwnTracks reads the answer as a list of messages for it: none. (kept is for whoever tests the address by hand)
  return new Response("[]", { headers: { "Content-Type": "application/json", "x-hestia-kept": String(kept) } });
});
