// What every function needs around a request: CORS, JSON answers, and who is calling.
//   - the app: the signed-in user's Supabase token (Authorization: Bearer), checked with the Auth server;
//   - the database (pg_cron, triggers): the x-hestia-secret header, equal to private.config.internal_secret.
// The functions are deployed with verify_jwt = false (supabase/config.toml) and do these checks themselves, so they work
// the same with the project's legacy and new API keys.
import { type Db, type Member, loadMembers, setConfig } from "./db.ts";

export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*", // no cookie is ever used: a caller without a token gets nothing
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-hestia-secret, mcp-protocol-version, mcp-session-id, last-event-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "mcp-session-id",
};
export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
export const preflight = (req: Request) => (req.method === "OPTIONS" ? new Response(null, { status: 204, headers: CORS }) : null);

type Env = (name: string) => string | undefined;

// The family member behind the request's Supabase token, or null
export async function memberFromToken(req: Request, db: Db, env: Env): Promise<{ member: Member; members: Member[] } | null> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token || token.split(".").length !== 3) return null;
  const apikey = req.headers.get("apikey") || env("SUPABASE_ANON_KEY") || "";
  const r = await fetch(`${env("SUPABASE_URL")}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey } }).catch(() => null);
  if (!r || !r.ok) return null;
  const user = await r.json().catch(() => null);
  if (!user?.id) return null;
  const members = await loadMembers(db);
  const member = members.find((m) => m.auth_user_id === user.id);
  return member ? { member, members } : null;
}

export async function isInternal(req: Request, db: Db): Promise<boolean> {
  const given = req.headers.get("x-hestia-secret");
  if (!given) return false;
  const row = await db.one(`select value from private.config where key = 'internal_secret'`);
  return !!row?.value && row.value === given;
}

// The database calls the functions by their address: each function writes it down when it runs (nothing to configure)
let remembered = false;
export async function rememberFunctionsUrl(db: Db, env: Env) {
  if (remembered) return;
  const base = env("SUPABASE_URL");
  if (!base) return;
  await setConfig(db, "functions_url", `${base.replace(/\/$/, "")}/functions/v1`);
  remembered = true;
}
