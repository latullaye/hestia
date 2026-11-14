// The device: installed or not, which kind, notifications, keeping the screen on.
import { callFunction, supabase } from "./supabase";

export const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isAndroid = () => /android/i.test(navigator.userAgent);
export const isMobile = () => isIOS() || isAndroid();

// Android / desktop Chrome: the browser offers to install; we keep the offer for our own button
let installEvent: any = null;
const installListeners = new Set<() => void>();
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvent = e; installListeners.forEach((fn) => fn()); });
window.addEventListener("appinstalled", () => { installEvent = null; installListeners.forEach((fn) => fn()); });
export const canPromptInstall = () => !!installEvent;
export const onInstallChange = (fn: () => void) => { installListeners.add(fn); return () => { installListeners.delete(fn); }; };
export async function promptInstall() {
  if (!installEvent) return false;
  installEvent.prompt();
  const { outcome } = await installEvent.userChoice;
  installEvent = null;
  installListeners.forEach((fn) => fn());
  return outcome === "accepted";
}

// ---------- Push notifications ----------
export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export type PushState = "on" | "off" | "denied" | "unsupported";
export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}
const keyBytes = (b64: string) => Uint8Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
export async function enablePush(memberId: string): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if ((await Notification.requestPermission()) !== "granted") return Notification.permission === "denied" ? "denied" : "off";
  const reg = await navigator.serviceWorker.ready;
  const { key } = await callFunction<{ key: string }>("notify?vapid", undefined, "GET");
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
  const device = isIOS() ? "iPhone / iPad" : isAndroid() ? "Android" : "Ordinateur";
  const { error } = await supabase.from("push_subscriptions").upsert(
    { member_id: memberId, endpoint: sub.endpoint, subscription: sub.toJSON(), device, last_seen_at: new Date().toISOString() }, { onConflict: "endpoint" });
  if (error) throw new Error(error.message);
  return "on";
}
export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}

// ---------- Screen always on (kiosk) ----------
export function keepAwake(): () => void {
  let lock: any = null, stopped = false;
  const ask = async () => { try { if (!stopped && "wakeLock" in navigator && document.visibilityState === "visible") lock = await (navigator as any).wakeLock.request("screen"); } catch { /* not allowed right now */ } };
  const again = () => { if (document.visibilityState === "visible") void ask(); };
  void ask();
  document.addEventListener("visibilitychange", again);
  return () => { stopped = true; document.removeEventListener("visibilitychange", again); lock?.release?.().catch(() => {}); };
}
