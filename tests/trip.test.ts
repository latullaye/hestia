import { describe, expect, it } from "vitest";
import { ago, distanceM, fmtDistance, shiftSlot, slotAfter } from "../src/lib/trip";

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
