import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { partsIn } from "@shared/time.ts";
import { store } from "./store";
import type { Member, TableName, Tables } from "./types";

export function useTable<T extends TableName>(table: T): Tables[T][] {
  return useSyncExternalStore(store.subscribe, () => store.rows(table));
}
export const useSyncStatus = () => useSyncExternalStore(store.subscribe, store.getStatus);

// The household's settings (time zone, weather place…)
export function useHousehold() {
  const settings = useTable("settings");
  return useMemo(() => {
    const h = settings.find((s) => s.id === "household")?.value || {};
    return {
      name: (h.name as string) || "Hestia",
      tz: (h.timezone as string) || "America/Toronto",
      weather: (h.weather as { label: string; latitude: number; longitude: number }) || { label: "Montréal", latitude: 45.5019, longitude: -73.5674 },
      reminders: settings.find((s) => s.id === "reminders")?.value || {},
    };
  }, [settings]);
}

// Members of the family, in order; people only (no device) with family()
export function useMembers() {
  const members = useTable("members");
  return useMemo(() => {
    const all = [...members].filter((m) => m.active).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    const byId = new Map(all.map((m) => [m.id, m]));
    return {
      all, byId,
      family: all.filter((m) => m.role !== "device"),
      adults: all.filter((m) => m.role === "adult"),
      name: (id: string | null | undefined) => (id && byId.get(id)?.name) || "?",
      names: (ids: string[] | null | undefined, empty = "Toute la famille") => (ids?.length ? ids.map((id) => byId.get(id)?.name || "?").join(", ") : empty),
    };
  }, [members]);
}
export type Members = ReturnType<typeof useMembers>;

// The current time, refreshed every minute (the day changes at midnight without reloading)
export function useNow(everyMs = 60_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    const wake = () => { if (document.visibilityState === "visible") setNow(Date.now()); };
    document.addEventListener("visibilitychange", wake);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", wake); };
  }, [everyMs]);
  return now;
}
export function useToday(tz: string) {
  const now = useNow();
  return partsIn(now, tz).day;
}

export function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query), on = () => setMatch(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}

export type Me = { member: Member | null; isKiosk: boolean; isAdult: boolean };
