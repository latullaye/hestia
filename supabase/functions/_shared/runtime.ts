// The only file that touches Deno: the database connection and the environment of an Edge Function.
// (Everything else in _shared is plain TypeScript, so it also runs in the tests and in the web app.)
import postgres from "postgres";
import { makeDb } from "./db.ts";

declare const Deno: { env: { get(name: string): string | undefined } };

export const env = (name: string) => Deno.env.get(name) || undefined;
// SUPABASE_DB_URL is given to every Edge Function; prepare: false because it goes through the connection pooler
export const sql = postgres(env("SUPABASE_DB_URL")!, { prepare: false, max: 3, idle_timeout: 20, onnotice: () => {} });
export const db = makeDb(sql);
