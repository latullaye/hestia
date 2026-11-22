// The TV poster: the days ahead as a picture in a Google Photos album, which the Chromecast's ambient screen shows.
// The picture is taken by a scheduled GitHub workflow (.github/workflows/poster.yml): it asks here for the rows to show,
// draws the app's #/poster screen with them, and sends the picture back only when it changed.
//   GET  /poster/snapshot       (poster key)  the rows the poster shows, and the fingerprint of the last picture sent
//   POST /poster/upload?hash=…  (poster key)  a new picture (JPEG): twice into "Hestia · Télé", the previous ones moved
//                                             to "Hestia · À supprimer" (see _shared/photos.ts)
//   GET  /poster/status         (an adult)    is Google Photos linked, is there a key, when was the last picture
//   POST /poster/key            (an adult)    a new poster key, for GitHub's secrets (shown once; replaces the old one)
//   POST /poster/connect        (an adult)    the Google consent address; { back } is where to come back to
//   GET  /poster/callback       (Google)      the end of the consent: keeps the access, back to the app
import { type Db, config, householdTz, setConfig } from "../_shared/db.ts";
import { json, memberFromToken, preflight, rememberFunctionsUrl } from "../_shared/http.ts";
import { type OAuthClient, consentUrl, exchangeCode, photosClient, replacePicture } from "../_shared/photos.ts";
import { db, env } from "../_shared/runtime.ts";
import { addDays, partsIn } from "../_shared/time.ts";

const KEY = /^hsp_[0-9a-f]{64}$/;
const DAYS = 5; // the poster shows today and the next three days; a little more for "bientôt" is read from birthdays

const client = (): OAuthClient | null => {
  const clientId = env("GOOGLE_PHOTOS_CLIENT_ID") || env("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = env("GOOGLE_PHOTOS_CLIENT_SECRET") || env("GOOGLE_OAUTH_CLIENT_SECRET");
  return clientId && clientSecret ? { clientId, clientSecret } : null;
};
const redirectUri = () => `${(env("SUPABASE_URL") || "").replace(/\/$/, "")}/functions/v1/poster/callback`;
const hex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");

async function keyOk(req: Request, d: Db): Promise<boolean> {
  const key = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!KEY.test(key)) return false;
  const row = await d.one(`select private.sha256_hex($1) = (select value from private.config where key = 'poster_key_sha256') as ok`, [key]);
  return !!row?.ok;
}

// The rows the poster needs, nothing more: today and the next days
async function snapshot(d: Db) {
  const tz = await householdTz(d), today = partsIn(Date.now(), tz).day, end = addDays(today, DAYS);
  const [members, settings, events, meals, occurrences, birthdays, countdowns, stays] = await Promise.all([
    d.all(`select * from public.members where active and deleted_at is null`),
    d.all(`select * from public.settings where id = 'household'`),
    d.all(`select * from public.events where deleted_at is null and status in ('confirmed', 'pending')
             and coalesce(end_date, (ends_at at time zone $3)::date, start_date, (starts_at at time zone $3)::date) >= $1::date - 1
             and coalesce(start_date, (starts_at at time zone $3)::date) <= $2::date`, [today, end, tz]),
    d.all(`select * from public.meal_plan where deleted_at is null and date between $1::date and $2::date`, [today, end]),
    d.all(`select * from public.chore_occurrences where deleted_at is null and due_date <= $1::date and (due_until is null or due_until >= $1::date)`, [today]),
    d.all(`select * from public.birthdays where deleted_at is null`),
    d.all(`select * from public.countdowns where deleted_at is null`),
    d.all(`select * from public.stays where deleted_at is null and end_date >= $1::date and start_date <= $2::date`, [today, end]),
  ]);
  const dishIds = [...new Set(meals.map((m) => m.dish_id).filter(Boolean))];
  const dishes = dishIds.length ? await d.all(`select * from public.dishes where id = any ($1::text::uuid[])`, [`{${dishIds.join(",")}}`]) : [];
  // The picture is drawn as a device of the family that nobody sees: the poster needs someone signed in
  members.push({ id: "00000000-0000-0000-0000-000000000007", auth_user_id: "poster", name: "Télé", role: "device", needs_caregiver: false,
    color: "#6b7a78", emoji: null, aliases: [], birth_date: null, sort_order: 999, active: true });
  return {
    tz, hash: await config(d, "poster_hash"),
    tables: { members, settings, events, meal_plan: meals, dishes, chore_occurrences: occurrences, birthdays, countdowns, stays },
  };
}

async function upload(req: Request, d: Db) {
  const c = client(), refresh = await config(d, "photos_refresh_token");
  if (!c || !refresh) return json({ error: "Google Photos n'est pas relié (Réglages › Télé)." }, 409);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length < 1000 || bytes.length > 15_000_000 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return json({ error: "Image JPEG attendue." }, 400);
  const tz = await householdTz(d), now = partsIn(Date.now(), tz);
  const previous = JSON.parse((await config(d, "poster_items")) || "[]") as string[];
  const out = await replacePicture(photosClient(c, refresh),
    { tv: await config(d, "photos_album_tv"), trash: await config(d, "photos_album_trash"), previous },
    bytes, `hestia-tele-${now.day}-${now.time.replace(":", "")}`, `Hestia · télé · ${now.day} ${now.time}`);
  await setConfig(d, "photos_album_tv", out.tv);
  if (out.trash) await setConfig(d, "photos_album_trash", out.trash);
  await setConfig(d, "poster_items", JSON.stringify(out.ids));
  await setConfig(d, "poster_hash", new URL(req.url).searchParams.get("hash") || "");
  await setConfig(d, "poster_at", new Date().toISOString());
  return json({ ok: true, photos: out.ids.length, moved: previous.length });
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  await rememberFunctionsUrl(db, env);
  const url = new URL(req.url), action = url.pathname.split("/").filter(Boolean).pop();

  try {
    if (action === "snapshot" || action === "upload") {
      if (!(await keyOk(req, db))) return json({ error: "auth" }, 401);
      return action === "snapshot" ? json(await snapshot(db)) : await upload(req, db);
    }

    if (action === "callback") {
      const [state, back] = ((await config(db, "photos_oauth_state")) || "").split("|");
      const go = (result: string) => Response.redirect(`${back || "https://github.com"}#/settings?photos=${result}`, 302);
      if (!state || url.searchParams.get("state") !== state) return go("expire");
      await db.exec(`delete from private.config where key = 'photos_oauth_state'`);
      const code = url.searchParams.get("code"), c = client();
      if (!code || !c) return go("refuse");
      await setConfig(db, "photos_refresh_token", await exchangeCode(c, redirectUri(), code));
      return go("ok");
    }

    // The rest is for the adults, from Réglages
    const who = await memberFromToken(req, db, env);
    if (!who || who.member.role !== "adult") return json({ error: "auth" }, 401);
    if (action === "status") {
      return json({
        client: !!client(), linked: !!(await config(db, "photos_refresh_token")), key: !!(await config(db, "poster_key_sha256")),
        album: !!(await config(db, "photos_album_tv")), at: await config(db, "poster_at"),
      });
    }
    if (action === "key" && req.method === "POST") {
      const key = `hsp_${hex(32)}`;
      await db.exec(`insert into private.config (key, value) values ('poster_key_sha256', private.sha256_hex($1))
                     on conflict (key) do update set value = excluded.value, updated_at = now()`, [key]);
      return json({ key });
    }
    if (action === "connect" && req.method === "POST") {
      const c = client();
      if (!c) return json({ error: "Il manque l'identifiant OAuth de Google dans les secrets (docs/SETUP.md, « Télé »)." }, 409);
      const body = await req.json().catch(() => ({}));
      const back = String(body.back || "");
      if (!/^https:\/\/[^\s#|]+$/.test(back) && !/^http:\/\/localhost(:\d+)?\/[^\s#|]*$/.test(back)) return json({ error: "Adresse de retour invalide." }, 400);
      const state = hex(16);
      await setConfig(db, "photos_oauth_state", `${state}|${back}`);
      return json({ url: consentUrl(c, redirectUri(), state) });
    }
    return json({ error: "action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
});
