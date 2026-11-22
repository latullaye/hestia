// Draws the TV poster and sends it to the album when it changed (.github/workflows/poster.yml, every 30 minutes).
//   1. asks the "poster" function for the rows of the moment (HESTIA_POSTER_KEY);
//   2. draws the app's #/poster screen with them, from dist/ (npm run build), in Chromium, at 3840 × 2160;
//   3. if what it says changed since the last picture (a fingerprint of its text), sends the JPEG back.
// It never prints the family's data: the repository is public, and so are the workflow's logs.
//   HESTIA_POSTER_VARIANT  aujourdhui (default) | semaine | epure      HESTIA_POSTER_FORCE=1  send even if unchanged
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)("playwright");
const FUNCTIONS = process.env.HESTIA_FUNCTIONS_URL || "https://cjneicknraclualneebb.supabase.co/functions/v1";
const KEY = process.env.HESTIA_POSTER_KEY, VARIANT = process.env.HESTIA_POSTER_VARIANT || "aujourdhui";
if (!KEY) { console.log("::warning::Pas de secret HESTIA_POSTER_KEY : l'affiche n'est pas faite (docs/SETUP.md, « Télé »)."); process.exit(0); }
const auth = { Authorization: `Bearer ${KEY}` };

const snap = await fetch(`${FUNCTIONS}/poster/snapshot`, { headers: auth });
if (!snap.ok) { console.error(`Les données de l'affiche n'ont pas pu être lues (${snap.status}).`); process.exit(1); }
const { tz, hash: last, tables } = await snap.json();

// dist/ served on a free local port
const root = fileURLToPath(new URL("../dist/", import.meta.url));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  try {
    const body = await readFile(join(root, path === "/" ? "index.html" : path));
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "text/html" }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, locale: "fr-CA", timezoneId: tz || "America/Toronto", serviceWorkers: "block" });
  await page.addInitScript((t) => { window.__HESTIA_SNAPSHOT__ = t; }, tables);
  await page.goto(`http://127.0.0.1:${server.address().port}/?demo=snapshot#/poster?v=${VARIANT}`);
  await page.waitForSelector(".poster", { timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  const hash = createHash("sha256").update(`${VARIANT}\n${await page.locator(".poster").innerText()}`).digest("hex");
  if (hash === last && !process.env.HESTIA_POSTER_FORCE) { console.log("Affiche inchangée : rien à envoyer."); process.exit(0); }
  const jpeg = await page.screenshot({ type: "jpeg", quality: 92 });
  const up = await fetch(`${FUNCTIONS}/poster/upload?hash=${hash}`, { method: "POST", headers: { ...auth, "Content-Type": "image/jpeg" }, body: jpeg });
  const out = await up.json().catch(() => ({}));
  if (!up.ok) { console.error(`L'affiche n'a pas pu être envoyée (${up.status}) : ${out.error || "?"}`); process.exit(1); }
  console.log(`Nouvelle affiche envoyée : ${out.photos} photos dans l'album, ${out.moved} anciennes déplacées.`);
} finally {
  await browser.close();
  server.close();
}
