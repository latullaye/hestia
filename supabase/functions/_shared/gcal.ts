// Google Calendar API, reduced to what Hestia needs. Web standards only (fetch, crypto.subtle): runs in Deno and Node.
// Two ways to sign in, whichever is configured (docs/SETUP.md):
//   - a service account the calendar is shared with (GOOGLE_SERVICE_ACCOUNT_JSON);
//   - the owner's OAuth refresh token (GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN).

export type GEvent = {
  id: string;
  etag?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  recurringEventId?: string;
  extendedProperties?: { private?: Record<string, string> };
};
export type GEventInput = Omit<GEvent, "id" | "etag" | "status" | "recurringEventId">;

// What the sync needs from Google (the tests give it a fake one)
export interface Google {
  list(timeMin: string, timeMax: string): Promise<GEvent[]>;
  insert(ev: GEventInput): Promise<GEvent>;
  patch(id: string, ev: GEventInput): Promise<GEvent | null>; // null: the event no longer exists
  remove(id: string): Promise<void>;
}

export type GoogleConfig = {
  calendarId: string;
  serviceAccountJson?: string | null;
  oauth?: { clientId: string; clientSecret: string; refreshToken: string } | null;
};

const b64url = (data: ArrayBuffer | string) => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function serviceAccountToken(json: string): Promise<string> {
  const sa = JSON.parse(json) as { client_email: string; private_key: string };
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (ch) => ch.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/calendar.events", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3300,
  }))}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return await tokenRequest({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${b64url(signature)}` });
}

async function tokenRequest(params: Record<string, string>): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams(params) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) throw new Error(`Google sign-in failed (${r.status}): ${data.error_description || data.error || "?"}`);
  return data.access_token as string;
}

export function googleClient(cfg: GoogleConfig): Google {
  let token: Promise<string> | null = null;
  const auth = () => (token ??= cfg.serviceAccountJson ? serviceAccountToken(cfg.serviceAccountJson)
    : tokenRequest({ grant_type: "refresh_token", client_id: cfg.oauth!.clientId, client_secret: cfg.oauth!.clientSecret, refresh_token: cfg.oauth!.refreshToken }));
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cfg.calendarId)}/events`;
  const call = async (method: string, url: string, body?: unknown) => {
    const r = await fetch(url, {
      method, headers: { Authorization: `Bearer ${await auth()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 404 || r.status === 410) return null;
    if (!r.ok) throw new Error(`Google Calendar ${method} ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return r.status === 204 ? {} : await r.json();
  };
  return {
    async list(timeMin, timeMax) {
      const out: GEvent[] = [];
      let pageToken = "";
      do {
        const q = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", showDeleted: "false", maxResults: "2500",
          fields: "nextPageToken,items(id,etag,status,summary,description,location,start,end,recurringEventId,extendedProperties/private)" });
        if (pageToken) q.set("pageToken", pageToken);
        const page = await call("GET", `${base}?${q}`);
        if (!page) throw new Error("Google Calendar: calendar not found (check GOOGLE_CALENDAR_ID and the sharing).");
        out.push(...(page.items || []));
        pageToken = page.nextPageToken || "";
      } while (pageToken);
      return out;
    },
    insert: async (ev) => (await call("POST", base, ev)) as GEvent,
    patch: async (id, ev) => (await call("PATCH", `${base}/${encodeURIComponent(id)}`, ev)) as GEvent | null,
    remove: async (id) => { await call("DELETE", `${base}/${encodeURIComponent(id)}`); },
  };
}
