// Local-first data. Every screen reads from this store, which keeps a copy of the family's tables on the device
// (IndexedDB) so the app opens and works without network.
//   read   useTable("events") gives the local rows, at once;
//   write  put() / remove() change the local copy immediately and queue the change (the "outbox");
//   sync   the outbox is sent when the network allows (upserts by id: sending twice is harmless), then each table is
//          refreshed from the server with "updated_at > last seen"; live changes arrive through Supabase Realtime.
// Deletions are soft (deleted_at) so that every device learns about them. Last write wins.
// With demo data (initDemo) nothing leaves the page: used to try the app and for screenshots.
import { del, get, set } from "idb-keyval";
import { supabase } from "./supabase";
import { TABLES, type TableName, type Tables } from "./types";

type Row = { id: string; [k: string]: any };
type Op = { table: TableName; id: string; row: Row };
export type SyncStatus = { online: boolean; syncing: boolean; pending: number; lastSync: number | null; error: string | null; ready: boolean; demo: boolean };

// Columns the server owns: never sent back from a local copy (see the triggers in supabase/migrations)
const SERVER_COLUMNS: Partial<Record<TableName, string[]>> & { all: string[] } = {
  all: ["created_at", "updated_at"],
  events: ["gcal_event_id", "gcal_etag", "gcal_recurring", "gcal_synced_at", "gcal_dirty", "birthday_id", "source", "created_by", "approval_requested_at"],
  shopping_items: ["name_key", "purchase_count", "needed_at"],
  dishes: ["name_key"],
  chore_occurrences: ["done_at", "created_by"],
  notifications: ["action_token", "pushed_at", "created_at"],
  birthdays: ["gcal_recurring_id"],
};
const NO_AUTHOR: TableName[] = ["notifications"]; // tables without updated_by / updated_via

class Store {
  private data = new Map<TableName, Map<string, Row>>(TABLES.map((t) => [t, new Map()]));
  private snapshots = new Map<TableName, Row[]>();
  private cursors: Partial<Record<TableName, string>> = {};
  private outbox: Op[] = [];
  private listeners = new Set<() => void>();
  private saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private userId: string | null = null;
  private channel: ReturnType<typeof supabase.channel> | null = null;
  private syncPromise: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  status: SyncStatus = { online: navigator.onLine, syncing: false, pending: 0, lastSync: null, error: null, ready: false, demo: false };
  // Who is acting (the signed-in adult; on the kiosk, the person picked on the screen)
  actorId: string | null = null;

  // ---------- Reading ----------
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  rows<T extends TableName>(table: T): Tables[T][] {
    let snap = this.snapshots.get(table);
    if (!snap) { snap = [...this.data.get(table)!.values()]; this.snapshots.set(table, snap); }
    return snap as Tables[T][];
  }
  byId<T extends TableName>(table: T, id: string | null | undefined): Tables[T] | undefined {
    return id ? (this.data.get(table)!.get(id) as Tables[T] | undefined) : undefined;
  }
  getStatus = () => this.status;

  private emit(table?: TableName) {
    if (table) this.snapshots.delete(table); else this.snapshots.clear();
    this.listeners.forEach((fn) => fn());
  }
  private setStatus(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch, pending: this.outbox.length };
    this.listeners.forEach((fn) => fn());
  }

  // ---------- Local copy ----------
  private key = (name: string) => `hestia:${this.userId}:${name}`;
  private persist(name: TableName | "outbox" | "cursors") {
    if (this.status.demo || !this.userId) return;
    clearTimeout(this.saveTimers.get(name));
    this.saveTimers.set(name, setTimeout(() => {
      const value = name === "outbox" ? this.outbox : name === "cursors" ? this.cursors : [...this.data.get(name)!.values()];
      set(this.key(name), value).catch(() => {});
    }, 250));
  }

  async init(userId: string) {
    if (this.userId === userId && this.status.ready) return;
    this.reset();
    this.userId = userId;
    try {
      for (const t of TABLES) {
        const rows = (await get(this.key(t))) as Row[] | undefined;
        if (rows) this.data.set(t, new Map(rows.map((r) => [r.id, r])));
      }
      this.cursors = ((await get(this.key("cursors"))) as typeof this.cursors) || {};
      this.outbox = ((await get(this.key("outbox"))) as Op[]) || [];
    } catch { /* private browsing: works from the network only */ }
    this.emit();
    this.setStatus({ ready: this.data.get("members")!.size > 0, demo: false });
    this.listen();
    await this.sync();
    this.setStatus({ ready: true });
  }

  initDemo(tables: Partial<{ [T in TableName]: Tables[T][] }>) {
    this.reset();
    for (const t of TABLES) this.data.set(t, new Map(((tables[t] || []) as Row[]).map((r) => [r.id, r])));
    this.emit();
    this.setStatus({ ready: true, demo: true, online: true, lastSync: Date.now() });
  }

  reset() {
    if (this.channel) { supabase.removeChannel(this.channel); this.channel = null; }
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    for (const t of TABLES) this.data.get(t)!.clear();
    this.cursors = {}; this.outbox = []; this.userId = null; this.actorId = null;
    this.emit();
    this.setStatus({ ready: false, error: null, lastSync: null, demo: false });
  }

  // Forgets the device's copy (sign-out)
  async clear() {
    const uid = this.userId;
    this.reset();
    if (uid) for (const name of [...TABLES, "cursors", "outbox"]) await del(`hestia:${uid}:${name}`).catch(() => {});
  }

  // ---------- Writing ----------
  put<T extends TableName>(table: T, patch: Partial<Tables[T]> & { id?: string }): Tables[T] {
    const current = patch.id ? this.data.get(table)!.get(patch.id) : undefined;
    const row: Row = { ...current, ...patch, id: patch.id || crypto.randomUUID(), updated_at: new Date().toISOString() };
    if (!current) row.created_at = row.created_at || row.updated_at;
    if (!NO_AUTHOR.includes(table)) { row.updated_by = this.actorId; row.updated_via = "app"; }
    if (row.deleted_at) this.data.get(table)!.delete(row.id); else this.data.get(table)!.set(row.id, row);
    this.emit(table);
    this.persist(table);
    if (!this.status.demo) {
      const op: Op = { table, id: row.id, row: this.outgoing(table, row) };
      const i = this.outbox.findIndex((o) => o.table === table && o.id === row.id);
      if (i >= 0) this.outbox[i] = op; else this.outbox.push(op);
      this.persist("outbox");
      this.setStatus({});
      void this.flush();
    }
    return row as Tables[T];
  }
  remove(table: TableName, id: string) {
    const current = this.data.get(table)!.get(id);
    if (current) this.put(table, { ...current, deleted_at: new Date().toISOString() } as any);
  }
  private outgoing(table: TableName, row: Row): Row {
    const skip = new Set([...SERVER_COLUMNS.all, ...(SERVER_COLUMNS[table] || [])]);
    return Object.fromEntries(Object.entries(row).filter(([k]) => !skip.has(k)));
  }

  // ---------- Sync ----------
  private flushing = false;
  private async flush() {
    if (this.flushing || this.status.demo || !navigator.onLine) return;
    this.flushing = true;
    try {
      while (this.outbox.length) {
        const op = this.outbox[0];
        const { data, error } = await supabase.from(op.table).upsert(op.row as any).select().maybeSingle();
        if (error) {
          // No network: keep it for later. Refused by the server (rights, rule): drop it and take the server's version back.
          const offline = !navigator.onLine || /fetch|network|timeout/i.test(error.message) || !("code" in error && error.code);
          if (offline) break;
          console.warn("sync refused", op.table, error.message);
          this.outbox.shift();
          this.setStatus({ error: `Modification refusée (${op.table}) : ${error.message}` });
          const { data: fresh } = await supabase.from(op.table).select("*").eq("id", op.id).maybeSingle();
          if (fresh && !(fresh as Row).deleted_at) this.data.get(op.table)!.set(op.id, fresh as Row); else this.data.get(op.table)!.delete(op.id);
          this.emit(op.table); this.persist(op.table);
        } else {
          this.outbox.shift();
          // A newer local change for the same row is still waiting: keep the local one
          if (data && !this.outbox.some((o) => o.table === op.table && o.id === op.id)) this.apply(op.table, data as Row);
        }
        this.persist("outbox");
        this.setStatus({});
      }
    } finally {
      this.flushing = false;
    }
  }

  private apply(table: TableName, row: Row) {
    if (this.outbox.some((o) => o.table === table && o.id === row.id)) return; // ours is newer
    const map = this.data.get(table)!;
    if (row.deleted_at) map.delete(row.id); else map.set(row.id, row);
    this.emit(table);
    this.persist(table);
  }

  private async pullTable(table: TableName) {
    for (;;) {
      // A few seconds of overlap: rows written during the previous pull are not missed
      const since = this.cursors[table] ? new Date(Date.parse(this.cursors[table]!) - 5000).toISOString() : null;
      let q = supabase.from(table).select("*").order("updated_at", { ascending: true }).limit(1000);
      if (since) q = q.gt("updated_at", since); else if (table !== "notifications") q = q.is("deleted_at", null);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const rows = (data || []) as Row[];
      for (const r of rows) this.apply(table, r);
      const last = rows[rows.length - 1]?.updated_at;
      if (last && last !== this.cursors[table]) { this.cursors[table] = last; this.persist("cursors"); }
      if (rows.length < 1000) break;
    }
  }

  sync(): Promise<void> {
    if (this.status.demo || !this.userId) return Promise.resolve();
    return (this.syncPromise ??= (async () => {
      this.setStatus({ syncing: true, online: navigator.onLine });
      try {
        if (!navigator.onLine) return;
        await this.flush();
        await Promise.all(TABLES.map((t) => this.pullTable(t)));
        this.setStatus({ lastSync: Date.now(), error: null });
      } catch (e) {
        this.setStatus({ error: navigator.onLine ? (e as Error).message : null });
      } finally {
        this.syncPromise = null;
        this.setStatus({ syncing: false, online: navigator.onLine });
      }
    })());
  }

  private listen() {
    this.channel = supabase.channel("hestia-db")
      .on("postgres_changes", { event: "*", schema: "public" }, (payload) => {
        const table = payload.table as TableName;
        if (!TABLES.includes(table)) return;
        if (payload.eventType === "DELETE") { const id = (payload.old as Row)?.id; if (id) { this.data.get(table)!.delete(id); this.emit(table); this.persist(table); } return; }
        this.apply(table, payload.new as Row);
      })
      .subscribe((state) => { if (state === "SUBSCRIBED") void this.sync(); }); // (re)connected: catch up
    this.timer = setInterval(() => void this.sync(), 5 * 60 * 1000);
  }

  constructor() {
    window.addEventListener("online", () => { this.setStatus({ online: true }); void this.sync(); });
    window.addEventListener("offline", () => this.setStatus({ online: false }));
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void this.sync(); });
  }
}

export const store = new Store();
