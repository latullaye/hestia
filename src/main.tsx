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

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
