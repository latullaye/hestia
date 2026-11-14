import { createClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "../config";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "hestia-auth" },
  realtime: { params: { eventsPerSecond: 5 } },
});

// Calls an Edge Function with the signed-in user's token
export async function callFunction<T = any>(name: string, body?: unknown, method: "GET" | "POST" = "POST"): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${data.session?.access_token ?? SUPABASE_KEY}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok && !out.reply) throw Object.assign(new Error(out.message || out.error || `HTTP ${r.status}`), { status: r.status, data: out });
  return out as T;
}
