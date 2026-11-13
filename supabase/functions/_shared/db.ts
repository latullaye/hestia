// Database access for the Edge Functions (and the tests): a thin layer over postgres.js.
// Rows come back as plain JSON (dates as text, like "2026-11-14"; instants as ISO text), the same in Deno and in Node.
// Lists are passed as text and cast in SQL: $1::text::uuid[] with uuids([...]), $1::text::jsonb with JSON.stringify(...)
// (a driver would otherwise turn a jsonb parameter given as text into a JSON string).
import type { Person } from "./calendar-codec.ts";
import { validTz } from "./time.ts";

// deno-lint-ignore no-explicit-any
export type Row = Record<string, any>;
export type Db = {
  all(text: string, params?: unknown[]): Promise<Row[]>;   // a select
  one(text: string, params?: unknown[]): Promise<Row | null>;
  exec(text: string, params?: unknown[]): Promise<Row[]>;  // a write: its "returning" rows, as the driver gives them
};
// deno-lint-ignore no-explicit-any
type Sql = { unsafe: (text: string, params?: any[]) => Promise<any> };

export function makeDb(sql: Sql): Db {
  const all = async (text: string, params: unknown[] = []) =>
    (await sql.unsafe(`select coalesce(json_agg(t), '[]'::json) as r from (${text}) t`, params))[0].r as Row[];
  return {
    all,
    one: async (text, params = []) => (await all(text, params))[0] ?? null,
    exec: async (text, params = []) => [...(await sql.unsafe(text, params))],
  };
}

export const uuids = (ids: (string | null | undefined)[]) => `{${ids.filter(Boolean).join(",")}}`;
export const isUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export type Member = Person & { color?: string; emoji?: string | null; needs_caregiver: boolean; auth_user_id?: string | null };

export const loadMembers = (db: Db) =>
  db.all(`select id, name, role, aliases, needs_caregiver, color, emoji, auth_user_id from public.members
          where active and deleted_at is null order by sort_order, name`) as Promise<Member[]>;

export async function householdTz(db: Db): Promise<string> {
  const row = await db.one(`select value ->> 'timezone' as tz from public.settings where id = 'household'`);
  return validTz(row?.tz);
}

// Private configuration: a function secret (environment) wins over the row of private.config
export async function config(db: Db, key: string, env?: (name: string) => string | undefined): Promise<string | null> {
  const fromEnv = env?.(key.toUpperCase());
  if (fromEnv) return fromEnv;
  const row = await db.one(`select value from private.config where key = $1`, [key]);
  return row?.value ?? null;
}
export const setConfig = (db: Db, key: string, value: string) =>
  db.exec(`insert into private.config (key, value) values ($1, $2)
           on conflict (key) do update set value = excluded.value, updated_at = now()`, [key, value]);
