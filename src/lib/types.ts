// The rows of the database, as the app sees them (see docs/DATA_MODEL.md and supabase/migrations).
import type { NotifyPrefs } from "@shared/notify-prefs.ts";
import type { Schedule } from "@shared/schedule.ts";

export type Sync = { id: string; created_at?: string; updated_at?: string; updated_by?: string | null; updated_via?: string; deleted_at?: string | null };

export type Member = Sync & {
  auth_user_id: string | null; name: string; role: "adult" | "child" | "device"; needs_caregiver: boolean; color: string; emoji: string | null;
  aliases: string[]; birth_date: string | null; sort_order: number; active: boolean;
  notify_prefs?: NotifyPrefs; // what reaches this person's phone (supabase/functions/_shared/notify-prefs.ts)
};
export type Setting = Sync & { value: Record<string, any> };
export type EventStatus = "confirmed" | "pending" | "declined" | "cancelled";
export type CalEvent = Sync & {
  title: string; description: string | null; location: string | null; all_day: boolean; starts_at: string; ends_at: string | null;
  start_date: string | null; end_date: string | null; kind: string; participant_ids: string[]; caregiver_ids: string[]; status: EventStatus;
  approver_ids: string[]; approval_requested_at?: string | null; approval_decided_by?: string | null; approval_decided_at?: string | null;
  approval_note?: string | null; created_by?: string | null; source?: string; gcal_event_id?: string | null; gcal_recurring?: boolean; birthday_id?: string | null; stay_id?: string | null;
};
export type EventComment = Sync & { event_id: string; author_id: string | null; body: string };
export type Birthday = Sync & { name: string; month: number; day: number; year: number | null; kind: "birthday" | "anniversary" | "memorial"; note: string | null; gift_ideas: string | null };
export type Countdown = Sync & { title: string; emoji: string | null; target_date: string; yearly: boolean; show_on_kiosk: boolean };
export type Dish = Sync & { name: string; tags: string[]; courses: string[]; source: string | null; ingredients: string | null; recipe: string | null; source_url: string | null; note: string | null; favorite: boolean; archived: boolean };
export type MealSlot = "breakfast" | "lunch" | "dinner";
export type MealKind = "home" | "leftovers" | "restaurant" | "takeout" | "other";
export type Meal = Sync & { date: string; slot: MealSlot; member_ids: string[]; dish_id: string | null; label: string | null; kind: MealKind; cook_ids: string[]; note: string | null };
export type ShoppingList = Sync & { name: string; emoji: string | null; sort_order: number; show_on_kiosk: boolean; url?: string | null };
export type ShoppingSection = Sync & { list_id: string; name: string; emoji: string | null; sort_order: number };
export type ShoppingItem = Sync & { list_id: string; section_id: string | null; name: string; note: string | null; needed: boolean; needed_at?: string | null; purchased_at: string | null; purchase_count?: number; sort_order: number };
export type TimeOfDay = "morning" | "afternoon" | "evening" | "anytime";
export type Chore = Sync & { title: string; emoji: string | null; description: string | null; assignee_ids: string[]; assignment: "fixed" | "rotate"; schedule: Schedule; time_of_day: TimeOfDay; start_date: string; end_date: string | null; active: boolean; sort_order: number };
export type Occurrence = Sync & { chore_id: string | null; title: string; emoji: string | null; due_date: string; due_until: string | null; time_of_day: TimeOfDay; assignee_ids: string[]; status: "todo" | "done" | "skipped"; done_by: string | null; done_at: string | null; note: string | null; created_by?: string | null; stay_id?: string | null };
export type Arrival = Sync & { member_id: string; from_label: string | null; left_at: string; eta: string; notify_ids: string[]; arrived_at: string | null };
export type Transport = "car" | "bus" | "train" | "plane" | "other";
export type Stay = Sync & {
  kind: "visit" | "vacation"; status: "planned" | "confirmed"; place: string; start_date: string; end_date: string; member_ids: string[];
  transport: Transport | null; carshare: boolean; carshare_booked: boolean; note: string | null;
};
export type GiftPerson = Sync & { name: string; birthday_id: string | null; member_id: string | null; for_birthday: boolean; for_christmas: boolean; note: string | null };
export type Occasion = "birthday" | "christmas";
export type Gift = Sync & {
  person_id: string; title: string; note: string | null; url: string | null; occasion: Occasion | null; year: number | null;
  bought_at: string | null; bought_by: string | null; wish_id: string | null; created_by?: string | null; kind?: GiftKind | null;
};
export type GiftKind = "main" | "stocking";
export type Notification = { id: string; member_id: string; kind: string; title: string; body: string | null; url: string | null; data: Record<string, any>; read_at: string | null; created_at: string; updated_at?: string };

export type Tables = {
  members: Member; settings: Setting; events: CalEvent; event_comments: EventComment; birthdays: Birthday; countdowns: Countdown; dishes: Dish;
  meal_plan: Meal; shopping_lists: ShoppingList; shopping_sections: ShoppingSection; shopping_items: ShoppingItem; chores: Chore;
  chore_occurrences: Occurrence; notifications: Notification; gift_people: GiftPerson; gifts: Gift; arrivals: Arrival; stays: Stay;
};
export type TableName = keyof Tables;
export const TABLES: TableName[] = ["members", "settings", "events", "event_comments", "birthdays", "countdowns", "dishes", "meal_plan", "shopping_lists",
  "shopping_sections", "shopping_items", "chores", "chore_occurrences", "notifications", "gift_people", "gifts", "arrivals", "stays"];
