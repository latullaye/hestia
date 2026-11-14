// Moving a planned dish to another meal by dragging it (week screen and kiosk).
// With a mouse the drag starts as soon as the pointer moves; with a finger it starts after a short hold, so that a
// swipe still scrolls the page. Drop targets are the elements carrying data-drop="<date>|<slot>".
import { useCallback, useEffect, useRef, useState } from "react";
import { store } from "./store";
import type { Meal, MealSlot } from "./types";

const HOLD_MS = 320, MOUSE_SLOP = 6, TOUCH_SLOP = 10, EDGE = 70, SCROLL_STEP = 14;
type Drag = { meal: Meal; label: string; x: number; y: number; over: string | null };

export const dropKey = (date: string, slot: MealSlot) => `${date}|${slot}`;

export function useMealDrag() {
  const [drag, setDrag] = useState<Drag | null>(null);
  const live = useRef<Drag | null>(null);      // the same, readable from the listeners
  const dropped = useRef(0);                   // when the last drag ended: the click that follows must not open a sheet

  // While a dish is held, the page must not scroll under the finger (needs a non-passive listener, set once)
  useEffect(() => {
    const stop = (e: TouchEvent) => { if (live.current) e.preventDefault(); };
    document.addEventListener("touchmove", stop, { passive: false });
    return () => document.removeEventListener("touchmove", stop);
  }, []);

  const start = useCallback((e: React.PointerEvent, meal: Meal, label: string) => {
    if (e.button !== 0) return;
    const x0 = e.clientX, y0 = e.clientY, touch = e.pointerType !== "mouse";
    let timer: ReturnType<typeof setTimeout> | undefined, frame = 0, last = { x: x0, y: y0 };
    const update = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop]");
      live.current = { meal, label, x, y, over: el?.dataset.drop ?? null };
      setDrag(live.current);
    };
    const begin = () => {
      update(last.x, last.y);
      document.body.classList.add("dragging");
      navigator.vibrate?.(12);
      // Near the top or bottom edge, the page follows
      const tick = () => {
        if (!live.current) return;
        const dy = last.y < EDGE ? -SCROLL_STEP : last.y > window.innerHeight - EDGE ? SCROLL_STEP : 0;
        if (dy) { window.scrollBy(0, dy); update(last.x, last.y); }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    const move = (ev: PointerEvent) => {
      last = { x: ev.clientX, y: ev.clientY };
      const far = Math.hypot(ev.clientX - x0, ev.clientY - y0);
      if (live.current) update(ev.clientX, ev.clientY);
      else if (!touch && far > MOUSE_SLOP) begin();
      else if (touch && far > TOUCH_SLOP) end(); // the finger moved before the hold: it is a scroll
    };
    const end = (ev?: PointerEvent) => {
      clearTimeout(timer); cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end);
      const d = live.current;
      if (!d) return;
      live.current = null; setDrag(null); dropped.current = Date.now();
      document.body.classList.remove("dragging");
      if (ev?.type !== "pointerup" || !d.over) return;
      const [date, slot] = d.over.split("|") as [string, MealSlot];
      if (date !== meal.date || slot !== meal.slot) store.put("meal_plan", { ...meal, date, slot });
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end); window.addEventListener("pointercancel", end);
    if (touch) timer = setTimeout(begin, HOLD_MS);
  }, []);

  return {
    // Props of a draggable dish
    item: (meal: Meal, label: string) => ({
      onPointerDown: (e: React.PointerEvent) => start(e, meal, label),
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(), // the long press must not open the browser's menu
      className: `draggable ${drag?.meal.id === meal.id ? "dragged" : ""}`,
    }),
    // Props of a meal that accepts a dish
    target: (date: string, slot: MealSlot) => ({ "data-drop": dropKey(date, slot), "data-over": drag?.over === dropKey(date, slot) || undefined }),
    // True right after a drop: the click it produces is not a tap
    justDropped: () => Date.now() - dropped.current < 400,
    dragging: !!drag,
    ghost: drag ? <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>{drag.label}</div> : null,
  };
}
