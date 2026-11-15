import { describe, expect, it } from "vitest";
import { NOTIFY_TOPICS, decide, eventLead, inQuiet, topicOf } from "../supabase/functions/_shared/notify-prefs.ts";

describe("notification preferences", () => {
  it("tells the two reminders apart by where they lead", () => {
    expect(topicOf("reminder", "#/event/abc")).toBe("event_reminder");
    expect(topicOf("reminder", "#/chores")).toBe("chores_evening");
    expect(topicOf("comment", "#/event/abc")).toBe("comment");
  });

  it("knows every kind the database and the notify function create", () => {
    const ids = new Set(NOTIFY_TOPICS.map((t) => t.id));
    for (const [kind, url] of [["approval_request"], ["approval_decision"], ["comment"], ["task_assigned"], ["arrival"], ["stay"], ["digest"], ["reminder", "#/event/x"], ["reminder", "#/chores"]])
      expect(ids.has(topicOf(kind, url))).toBe(true);
  });

  it("quiet hours, past midnight or not, end excluded", () => {
    const night = { quiet: { from: "22:00", to: "07:00" } };
    expect(inQuiet(night, "23:30")).toBe(true);
    expect(inQuiet(night, "03:00")).toBe(true);
    expect(inQuiet(night, "07:00")).toBe(false);
    expect(inQuiet(night, "12:00")).toBe(false);
    const nap = { quiet: { from: "13:00", to: "15:00" } };
    expect(inQuiet(nap, "14:00")).toBe(true);
    expect(inQuiet(nap, "15:00")).toBe(false);
    expect(inQuiet({ quiet: { from: "10:00", to: "10:00" } }, "10:00")).toBe(false);
    expect(inQuiet({ quiet: { from: "25:00", to: "07:00" } }, "03:00")).toBe(false);
    expect(inQuiet({}, "03:00")).toBe(false);
  });

  it("muted topics are skipped, quiet hours hold, the rest is sent", () => {
    const p = { off: ["digest", "chores_evening"], quiet: { from: "22:00", to: "07:00" } };
    expect(decide(p, "digest", "#/", "12:00")).toBe("skip");
    expect(decide(p, "reminder", "#/chores", "20:00")).toBe("skip");
    expect(decide(p, "reminder", "#/event/x", "20:00")).toBe("send");
    expect(decide(p, "approval_request", "#/event/x", "23:00")).toBe("hold");
    expect(decide(null, "stay", "#/", "23:00")).toBe("send");
  });

  it("the reminder lead: one's own, else the household's, none when muted", () => {
    expect(eventLead({}, 60)).toBe(60);
    expect(eventLead({ event_before: 15 }, 60)).toBe(15);
    expect(eventLead({ event_before: null }, 30)).toBe(30);
    expect(eventLead({ off: ["event_reminder"], event_before: 15 }, 60)).toBe(0);
  });
});
