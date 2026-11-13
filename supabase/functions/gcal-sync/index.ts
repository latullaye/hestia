// Google Calendar "Family" <-> public.events. The logic is in ../_shared/gcal-sync.ts.
// Called by: pg_cron every 10 minutes ({}), the database when an event changes ({ push: <event id> }), and the app
// ("Synchroniser maintenant" in Réglages; GET gives the state of the link).
// Secrets (Edge Functions › Secrets, or rows of private.config in lower case): GOOGLE_CALENDAR_ID, and either
// GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET + GOOGLE_OAUTH_REFRESH_TOKEN.
import { config, householdTz, setConfig } from "../_shared/db.ts";
import { googleClient } from "../_shared/gcal.ts";
import { pull, pushDirty } from "../_shared/gcal-sync.ts";
import { isInternal, json, memberFromToken, preflight, rememberFunctionsUrl } from "../_shared/http.ts";
import { db, env } from "../_shared/runtime.ts";

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (!(await isInternal(req, db)) && !(await memberFromToken(req, db, env))) return json({ error: "auth" }, 401);
  await rememberFunctionsUrl(db, env);

  const calendarId = await config(db, "google_calendar_id", env);
  const serviceAccountJson = await config(db, "google_service_account_json", env);
  const [clientId, clientSecret, refreshToken] = [await config(db, "google_oauth_client_id", env), await config(db, "google_oauth_client_secret", env), await config(db, "google_oauth_refresh_token", env)];
  const oauth = clientId && clientSecret && refreshToken ? { clientId, clientSecret, refreshToken } : null;
  const configured = !!calendarId && (!!serviceAccountJson || !!oauth);
  const last = JSON.parse((await config(db, "gcal_last_sync")) || "null");
  if (req.method === "GET") return json({ configured, last });
  if (!configured) return json({ configured: false });

  const body = await req.json().catch(() => ({}));
  const google = googleClient({ calendarId: calendarId!, serviceAccountJson, oauth });
  const tz = await householdTz(db);
  const report: Record<string, unknown> = { at: new Date().toISOString() };
  try {
    Object.assign(report, await pushDirty(db, google, tz, typeof body.push === "string" ? body.push : null));
    if (!body.push) {
      const pulled = await pull(db, google, tz);
      report.errors = [...((report.errors as string[]) || []), ...pulled.errors];
      Object.assign(report, { ...pulled, errors: report.errors });
    }
  } catch (e) {
    report.errors = [...((report.errors as string[]) || []), (e as Error).message.slice(0, 300)];
    console.error("gcal-sync", e);
  }
  if (!body.push || (report.errors as string[])?.length) await setConfig(db, "gcal_last_sync", JSON.stringify(report));
  return json({ configured: true, ...report });
});
