/// <reference lib="webworker" />
// Service worker: keeps a copy of the app on the device (it opens without network) and shows the push notifications.
// A notification that asks for an approval carries two buttons (Android, desktop): they answer without opening the app,
// through the "notify" function and the notification's own token.
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { FUNCTIONS_URL, SUPABASE_KEY } from "./config";

declare const self: ServiceWorkerGlobalScope;
type Payload = { title: string; body?: string; url?: string; tag?: string; kind?: string; token?: string; actions?: { action: string; title: string }[] };

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));

self.addEventListener("push", (event) => {
  let p: Payload = { title: "Hestia" };
  try { p = { ...p, ...(event.data?.json() as Payload) }; } catch { p.body = event.data?.text(); }
  event.waitUntil(self.registration.showNotification(p.title, {
    body: p.body, tag: p.tag, icon: "icons/icon-192.png", badge: "icons/badge.png", data: { url: p.url || "#/", token: p.token },
    ...(p.actions?.length ? { actions: p.actions } : {}),
  } as NotificationOptions));
});

async function open(url: string) {
  const target = new URL(url.startsWith("#") ? `./${url}` : url, self.registration.scope).href;
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const existing = windows.find((w) => w.url.startsWith(self.registration.scope));
  if (existing) { await existing.focus(); if ("navigate" in existing) await existing.navigate(target).catch(() => {}); return; }
  await self.clients.openWindow(target);
}

self.addEventListener("notificationclick", (event) => {
  const { url, token } = (event.notification.data || {}) as { url: string; token?: string };
  event.notification.close();
  if ((event.action === "approve" || event.action === "decline") && token) {
    event.waitUntil((async () => {
      try {
        const r = await fetch(`${FUNCTIONS_URL}/notify`, { method: "POST", headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
          body: JSON.stringify({ task: "action", token, action: event.action }) });
        const out = await r.json();
        await self.registration.showNotification("Hestia", { body: out.message || "C'est noté.", icon: "icons/icon-192.png", badge: "icons/badge.png", tag: "decision" });
      } catch {
        await open(url); // no network: decide in the app
      }
    })());
    return;
  }
  event.waitUntil(open(url || "#/"));
});
