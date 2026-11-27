import { describe, expect, it } from "vitest";
import { ago, distanceM, fmtDistance, shiftSlot, slotAfter } from "../src/lib/trip";
import { type TripRow, clock, gap, median, tripStats, tripSummary } from "../supabase/functions/_shared/trips.ts";

const at = (hm: string) => Date.parse(`2026-11-20T${hm}:00Z`);

describe("Je rentre", () => {
  it("arrival times are on 5-minute marks", () => {
    expect(slotAfter(at("17:01"), 25)).toBe(at("17:30"));
    expect(slotAfter(at("17:05"), 25)).toBe(at("17:30"));
    expect(slotAfter(at("17:05") + 1000, 25)).toBe(at("17:35"));
  });
  it("adjusting moves mark by mark, never into the past", () => {
    expect(shiftSlot(at("17:30"), 1, at("17:01"))).toBe(at("17:35"));
    expect(shiftSlot(at("17:30"), 3, at("17:01"))).toBe(at("17:45"));
    expect(shiftSlot(at("17:33"), -1, at("17:01"))).toBe(at("17:30")); // an odd time (older app) snaps back on the grid
    expect(shiftSlot(at("17:10"), -1, at("17:08"))).toBe(at("17:10"));
  });
  it("distances and ages read simply", () => {
    expect(Math.round(distanceM({ lat: 45.5, lng: -73.6 }, { lat: 45.51, lng: -73.6 }))).toBe(1112);
    expect(fmtDistance(320)).toBe("300 m");
    expect(fmtDistance(2440)).toBe("2,4 km");
    expect(fmtDistance(12_400)).toBe("12 km");
    expect(ago(new Date(at("17:00")).toISOString(), at("17:00") + 30_000)).toBe("à l'instant");
    expect(ago(new Date(at("17:00")).toISOString(), at("17:04"))).toBe("il y a 4 min");
  });
});

describe("trip stats", () => {
  const tz = "America/Toronto";
  const row = (day: string, told: string, eta: string, extra: Partial<TripRow> = {}): TripRow =>
    ({ id: day, member_id: "m", created_at: `${day}T${told}:00-05:00`, eta: `${day}T${eta}:00-05:00`, ...extra });
  it("reads the four times as minutes of the day, and what follows from them", () => {
    const [t] = tripStats([row("2026-11-26", "17:13", "17:55", { first_eta: "2026-11-26T17:50:00-05:00", departed_at: "2026-11-26T17:15:30-05:00", arrived_at: "2026-11-26T17:51:40-05:00" })], tz);
    expect([t.told, t.left, t.planned, t.plannedLast, t.home]).toEqual([1033, 1035, 1070, 1075, 1071]);
    expect([t.ride, t.late]).toEqual([36, 1]);
    expect(clock(t.told)).toBe("17 h 13");
    expect(gap(t.late)).toBe("+1 min");
  });
  it("leaves out cancelled trips, and keeps unknown times unknown", () => {
    const s = tripStats([row("2026-11-24", "17:00", "17:30"), row("2026-11-25", "17:00", "17:30", { deleted_at: "2026-11-25T22:01:00Z" })], tz);
    expect(s).toHaveLength(1);
    expect([s[0].left, s[0].home, s[0].ride, s[0].late]).toEqual([null, null, null, null]);
    expect(clock(s[0].left)).toBe("—");
  });
  it("sums up with medians, and counts past midnight", () => {
    const s = tripStats([row("2026-11-24", "17:00", "17:30", { arrived_at: "2026-11-24T17:40:00-05:00" }), row("2026-11-25", "17:10", "17:40", { arrived_at: "2026-11-25T17:38:00-05:00" }),
      row("2026-11-26", "23:50", "23:59", { arrived_at: "2026-11-27T00:20:00-05:00" })], tz);
    expect(s[2].home).toBe(1460);
    expect(clock(s[2].home)).toBe("0 h 20");
    const m = tripSummary(s);
    expect([m.count, m.told, m.late]).toEqual([3, 1030, 10]);
    expect(median([])).toBeNull();
  });
});
