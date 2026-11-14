// Moving a planned dish to another meal by dragging it (week screen and kiosk).
// Drop targets are the elements carrying data-drop="<date>|<slot>".
//
// Two ways to start, because the screens differ:
//   instant  (kiosk) the screen does not scroll, so the dish takes the finger at once: touch-action is off on it, and the
//            drag starts after a few pixels, like with a mouse. A tap without moving still opens the meal.
//   hold     (phone week screen) a swipe must keep scrolling the page: with a finger the drag starts after a short hold.
//            With a mouse it starts on the first move.
// While dragging, nothing re-renders but the meal under the finger: the floating label is moved directly in the DOM,
// once per frame. Re-rendering the whole kiosk on every move is what made the gesture stutter on a tablet.
import { useCallback, useEffect, useRef, useState } from "react";
import { store } from "./store";
import type { Meal, MealSlot } from "./types";

const HOLD_MS = 280, MOUSE_SLOP = 5, INSTANT_SLOP = 6, HOLD_SLOP = 12, EDGE = 70, SCROLL_STEP = 14;

export const dropKey = (date: string, slot: MealSlot) => `${date}|${slot}`;

export function useMealDrag({ instant = false }: { instant?: boolean } = {}) {
  const [dragged, setDragged] = useState<string | null>(null); // the meal being moved
  const [over, setOver] = useState<string | null>(null);       // the meal it would land in
  const active = useRef(false);
  const dropped = useRef(0); // when the last drag ended: the click that follows is not a tap

  // While a dish is held, the page must not scroll under the finger (a non-passive listener, set once)
  useEffect(() => {
    const stop = (e: TouchEvent) => { if (active.current) e.preventDefault(); };
    document.addEventListener("touchmove", stop, { passive: false });
    return () => document.removeEventListener("touchmove", stop);
  }, []);

  const start = useCallback((e: React.PointerEvent, meal: Meal, label: string) => {
    if (e.button !== 0) return;
    const x0 = e.clientX, y0 = e.clientY, touch = e.pointerType !== "mouse", hold = touch && !instant;
    let timer: ReturnType<typeof setTimeout> | undefined, frame = 0, ghost: HTMLDivElement | null = null;
    let x = x0, y = y0, target: string | null = null;

    const locate = () => {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop]");
      const key = el?.dataset.drop ?? null;
      if (key !== target) { target = key; setOver(key); }
    };
    const tick = () => {
      if (!active.current) return;
      if (ghost) ghost.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -150%)`;
      // On a scrolling page, near the top or bottom edge, the page follows
      if (!instant) {
        const dy = y < EDGE ? -SCROLL_STEP : y > window.innerHeight - EDGE ? SCROLL_STEP : 0;
        if (dy) window.scrollBy(0, dy);
      }
      locate();
      frame = requestAnimationFrame(tick);
    };
    const begin = () => {
      active.current = true;
      ghost = document.createElement("div");
      ghost.className = "drag-ghost";
      ghost.textContent = label;
      document.body.appendChild(ghost);
      document.body.classList.add("dragging");
      setDragged(meal.id);
      navigator.vibrate?.(10);
      frame = requestAnimationFrame(tick);
    };
    const move = (ev: PointerEvent) => {
      x = ev.clientX; y = ev.clientY;
      if (active.current) return; // the frame loop does the rest
      const far = Math.hypot(x - x0, y - y0);
      if (hold) { if (far > HOLD_SLOP) end(); } // the finger moved before the hold: it is a scroll
      else if (far > (touch ? INSTANT_SLOP : MOUSE_SLOP)) begin();
    };
    const end = (ev?: PointerEvent) => {
      clearTimeout(timer); cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end);
      if (!active.current) return;
      active.current = false;
      if (ev) { x = ev.clientX; y = ev.clientY; locate(); }
      ghost?.remove();
      document.body.classList.remove("dragging");
      setDragged(null); setOver(null);
      dropped.current = Date.now();
      if (ev?.type !== "pointerup" || !target) return;
      const [date, slot] = target.split("|") as [string, MealSlot];
      if (date !== meal.date || slot !== meal.slot) store.put("meal_plan", { ...meal, date, slot });
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end); window.addEventListener("pointercancel", end);
    if (hold) timer = setTimeout(begin, HOLD_MS);
  }, [instant]);

  return {
    // Props of a draggable dish
    item: (meal: Meal, label: string) => ({
      onPointerDown: (e: React.PointerEvent) => start(e, meal, label),
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(), // a long press must not open the browser's menu
      className: `draggable ${instant ? "instant" : ""} ${dragged === meal.id ? "dragged" : ""}`,
    }),
    // Props of a meal that accepts a dish
    target: (date: string, slot: MealSlot) => ({ "data-drop": dropKey(date, slot), "data-over": over === dropKey(date, slot) || undefined }),
    // True right after a drop: the click it produces is not a tap
    justDropped: () => Date.now() - dropped.current < 400,
    dragging: !!dragged,
  };
}
