import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import { applyTheme } from "./pages/Settings";
import "./styles.css";

applyTheme();
// The service worker keeps a copy of the app for offline use and receives the push notifications. A new version is
// taken at the next opening; the kitchen tablet, never closed, checks every hour and reloads by itself.
const update = registerSW({
  immediate: true,
  onRegisteredSW: (_url, registration) => { if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000); },
  onNeedRefresh: () => void update(true),
});

// No pinch zoom, like an app: iOS ignores user-scalable=no in the viewport tag, so the two-finger gesture is stopped here
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("touchmove", (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

// On a touch screen, a long press opens no browser menu (copy, share, open in a new tab), except where text is editable
if (matchMedia("(pointer: coarse)").matches) {
  document.addEventListener("contextmenu", (e) => {
    if (!(e.target as Element | null)?.closest?.("input, textarea, [contenteditable='true'], .selectable")) e.preventDefault();
  });
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
