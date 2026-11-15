// Swiping sideways through days or weeks: the track follows the finger, then settles on a whole step (a day, a week).
//
// The track holds the visible steps plus `base` spare steps on each side, so that the neighbours are already there while
// the finger moves. At rest it sits at -base steps. On release, the throw (distance plus speed) decides how many steps
// to move, at most `maxSteps`; the track glides there, then the caller shifts its content by that many steps (onSettle)
// and the track jumps back to its rest position in the same frame, so nothing visibly moves.
//
// Moves are written straight to the DOM, once per pointer event: re-rendering the screen while the finger moves is what
// makes such gestures stutter. A gesture becomes a swipe only once it is clearly sideways; a vertical one is left to the
// page (touch-action: pan-y on the viewport), and a tap stays a tap. A dish being dragged (.draggable) is not a swipe.
import { useCallback, useLayoutEffect, useRef } from "react";
import { flushSync } from "react-dom";

const DECIDE_PX = 8;           // movement before deciding between a swipe and a scroll
const SIDEWAYS = 1.2;          // how much more sideways than vertical a swipe must be
const FLICK = 0.35;            // px/ms: a quick flick moves one step even if short
const THROW_MS = 160;          // how far the speed carries the track after release
const EDGE_RESIST = 0.3;       // beyond maxSteps, the track only follows by this much

type Options = { base: number; maxSteps: number; onSettle: (steps: number) => void };

export function useSwipe({ base, maxSteps, onSettle }: Options) {
  const track = useRef<HTMLDivElement>(null);
  const busy = useRef(false);   // a finger is on it, or it is gliding
  const gliding = useRef(false);
  const swipedAt = useRef(0);
  const settle = useRef(onSettle);
  settle.current = onSettle;

  // The width of one step, gap included, as laid out
  const stepPx = () => {
    const el = track.current, a = el?.children[0] as HTMLElement | undefined, b = el?.children[1] as HTMLElement | undefined;
    return a && b ? b.offsetLeft - a.offsetLeft : el?.clientWidth ?? 0;
  };
  const place = (px: number, ms = 0, ease = "cubic-bezier(.22,.8,.3,1)") => {
    const el = track.current;
    if (!el) return;
    el.style.transition = ms ? `transform ${ms}ms ${ease}` : "none";
    el.style.transform = `translate3d(${px}px, 0, 0)`;
  };
  const rest = () => -base * stepPx();

  // Back to the rest position after every render (new content, new size), unless the track is in use
  useLayoutEffect(() => { if (!busy.current) place(rest()); });

  // Glides `steps` steps (positive: forward in time), then lets the caller shift its content
  const go = useCallback((steps: number, ms = 300, ease?: string, then?: () => void) => {
    const el = track.current;
    if (!el || gliding.current) return;
    busy.current = true; gliding.current = true;
    place(rest() - steps * stepPx(), ms, ease);
    let done = false;
    const finish = (e?: TransitionEvent) => {
      if (done || (e && e.target !== el)) return;
      done = true;
      el.removeEventListener("transitionend", finish);
      if (steps) flushSync(() => settle.current(steps));
      place(rest());
      busy.current = false; gliding.current = false;
      then?.();
    };
    if (!ms) return finish();
    el.addEventListener("transitionend", finish);
    setTimeout(finish, ms + 100); // in case the transition never ends (hidden tab)
  }, [base]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (busy.current || e.button !== 0) return;
    if ((e.target as Element).closest(".draggable, input, textarea, select")) return;
    const x0 = e.clientX, y0 = e.clientY, step = stepPx(), from = rest();
    let mode: "undecided" | "swipe" | "none" = "undecided", dx = 0;
    const samples: { x: number; t: number }[] = [{ x: x0, t: e.timeStamp }];

    const move = (ev: PointerEvent) => {
      dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      if (mode === "undecided") {
        if (Math.abs(dx) > DECIDE_PX && Math.abs(dx) > Math.abs(dy) * SIDEWAYS) { mode = "swipe"; busy.current = true; }
        else if (Math.abs(dy) > DECIDE_PX) { mode = "none"; return end(); }
        else return;
      }
      const limit = maxSteps * step;
      const shown = Math.abs(dx) <= limit ? dx : Math.sign(dx) * (limit + (Math.abs(dx) - limit) * EDGE_RESIST);
      place(from + shown);
      samples.push({ x: ev.clientX, t: ev.timeStamp });
      while (samples.length > 2 && ev.timeStamp - samples[0].t > 100) samples.shift();
    };
    const end = (ev?: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (mode !== "swipe") return;
      swipedAt.current = Date.now();
      if (!ev || ev.type === "pointercancel") return go(0, 220);
      const first = samples[0], last = samples[samples.length - 1];
      const speed = last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0; // px/ms, positive to the right
      let steps = -Math.round((dx + speed * THROW_MS) / step);
      if (!steps && Math.abs(speed) > FLICK) steps = -Math.sign(speed);
      steps = Math.max(-maxSteps, Math.min(maxSteps, steps));
      // The glide takes longer the further it goes, and never feels slower than the finger was
      const distance = Math.abs(-steps * step - dx);
      go(steps, Math.round(Math.max(180, Math.min(450, distance / Math.max(Math.abs(speed), 0.8)))));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }, [base, maxSteps, go]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    track,
    go,
    viewport: {
      onPointerDown,
      // The click that ends a swipe is not a tap on what is under the finger
      onClickCapture: (e: React.MouseEvent) => { if (Date.now() - swipedAt.current < 350) { e.preventDefault(); e.stopPropagation(); } },
    },
  };
}
