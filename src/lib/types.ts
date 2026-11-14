// The rows of the database, as the app sees them (see docs/DATA_MODEL.md and supabase/migrations).
import type { Schedule } from "@shared/schedule.ts";

export type Sync = { id: string; created_at?: string; updated_at?: string; updated_by?: string | null; updated_via?: string; deleted_at?: string | null };

export type Member = Sync & {
  auth_user_id: string | null; name: string; role: "adult" | "child" | "device"; needs_caregiver: boolean; color: string; emoji: string | null;
  aliases: string[]; birth_date: string | null; sort_order: number; active: boolean;
};
export type Setting = Sync & { value: Record<string, any> };
export type EventStatus = "confirmed" | "pending" | "declined" | "cancelled";
export type CalEvent = Sync & {
  title: string; description: string | null; location: string | null; all_day: boolean; starts_at: string; ends_at: string | null;
  start_date: string | null; end_date: string | null; kind: string; participant_ids: string[]; caregiver_ids: string[]; status: EventStatus;
  approver_ids: string[]; approval_requested_at?: string | null; approval_decided_by?: string | null; approval_decided_at?: string | null;
  approval_note?: string | null; created_by?: string | null; source?: string; gcal_event_id?: string | null; gcal_recurring?: boolean; birthday_id?: string | null;
};
export type EventComment = Sync & { event_id: string; author_id: string | null; body: string };
export type Birthday = Sync & { name: string; month: number; day: number; year: number | null; kind: "birthday" | "anniversary" | "memorial"; note: string | null; gift_ideas: string | null };
export type Countdown = Sync & { title: string; emoji: string | null; target_date: string; yearly: boolean; show_on_kiosk: boolean };
export type Dish = Sync & { name: string; tags: string[]; courses: string[]; source: string | null; ingredients: string | null; recipe: string | null; source_url: string | null; note: string | null; favorite: boolean; archived: boolean };
export type MealSlot = "breakfast" | "lunch" | "dinner";
export type MealKind = "home" | "leftovers" | "restaurant" | "takeout" | "other";
export type Meal = Sync & { date: string; slot: MealSlot; member_ids: string[]; dish_id: string | null; label: string | null; kind: MealKind; cook_ids: string[]; note: string | null };
export type ShoppingList = Sync & { name: string; emoji: string | null; sort_order: number; show_on_kiosk: boolean };
export type ShoppingSection = Sync & { list_id: string; name: string; emoji: string | null; sort_order: number };
export type ShoppingItem = Sync & { list_id: string; section_id: string | null; name: string; note: string | null; needed: boolean; needed_at?: string | null; purchased_at: string | null; purchase_count?: number; sort_order: number };
export type TimeOfDay = "morning" | "afternoon" | "evening" | "anytime";
export type Chore = Sync & { title: string; emoji: string | null; description: string | null; assignee_ids: string[]; assignment: "fixed" | "rotate"; schedule: Schedule; time_of_day: TimeOfDay; start_date: string; end_date: string | null; active: boolean; sort_order: number };
export type Occurrence = Sync & { chore_id: string | null; title: string; emoji: string | null; due_date: string; due_until: string | null; time_of_day: TimeOfDay; assignee_ids: string[]; status: "todo" | "done" | "skipped"; done_by: string | null; done_at: string | null; note: string | null; created_by?: string | null };
export type Notification = { id: string; member_id: string; kind: string; title: string; body: string | null; url: string | null; data: Record<string, any>; read_at: string | null; created_at: string; updated_at?: string };

export type Tables = {
  members: Member; settings: Setting; events: CalEvent; event_comments: EventComment; birthdays: Birthday; countdowns: Countdown; dishes: Dish;
  meal_plan: Meal; shopping_lists: ShoppingList; shopping_sections: ShoppingSection; shopping_items: ShoppingItem; chores: Chore;
  chore_occurrences: Occurrence; notifications: Notification;
};
export type TableName = keyof Tables;
export const TABLES: TableName[] = ["members", "settings", "events", "event_comments", "birthdays", "countdowns", "dishes", "meal_plan", "shopping_lists",
  "shopping_sections", "shopping_items", "chores", "chore_occurrences", "notifications"];
