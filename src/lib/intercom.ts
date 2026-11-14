// The intercom on the device: listen (the browser's speech recognition, in French), ask (the "intercom" function, which
// lets Claude act with the tools), speak the answer. Where speech recognition does not exist, the keyboard's microphone
// does the job: the sentence is typed or dictated in the text field.
import { store } from "./store";
import { callFunction } from "./supabase";

const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
export const canListen = () => !!SR;

export type Listening = { stop: () => void };
export function listen(on: { interim: (text: string) => void; final: (text: string) => void; error: (why: "denied" | "network" | "silence" | "other") => void }): Listening | null {
  if (!SR) return null;
  const rec = new SR();
  rec.lang = "fr-CA"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  let heard = "", done = false;
  rec.onresult = (e: any) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) heard += t; else interim += t;
    }
    on.interim((heard + " " + interim).trim());
  };
  rec.onerror = (e: any) => {
    if (done || e.error === "aborted") return;
    if (e.error === "no-speech") return; // onend says "silence"
    done = true;
    on.error(e.error === "not-allowed" || e.error === "service-not-allowed" ? "denied" : e.error === "network" ? "network" : "other");
  };
  rec.onend = () => { if (done) return; done = true; if (heard.trim()) on.final(heard.trim()); else on.error("silence"); };
  try { rec.start(); } catch { return null; }
  return { stop: () => { try { rec.stop(); } catch { /* already stopped */ } } };
}

export type Turn = { role: "user" | "assistant"; text: string };
export type Answer = { reply: string; changed: boolean; error?: string | null };
export async function ask(text: string, history: Turn[], actingMemberId: string | null): Promise<Answer> {
  if (store.status.demo) {
    await new Promise((r) => setTimeout(r, 700));
    return { reply: "En démonstration, l'interphone n'agit pas. Dans la vraie app, je l'aurais fait : « " + text + " ».", changed: false };
  }
  if (!navigator.onLine) return { reply: "Pas de réseau : l'interphone a besoin d'internet.", changed: false, error: "offline" };
  try {
    const out = await callFunction<Answer>("intercom", { text, history, acting_member_id: actingMemberId });
    if (out.changed) void store.sync();
    return out;
  } catch (e) {
    return { reply: "L'interphone ne répond pas pour le moment.", changed: false, error: (e as Error).message };
  }
}

export function speak(text: string) {
  if (!("speechSynthesis" in window) || !text) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-CA";
    const voices = speechSynthesis.getVoices();
    u.voice = voices.find((v) => v.lang === "fr-CA") || voices.find((v) => v.lang.startsWith("fr")) || null;
    u.rate = 1.05;
    speechSynthesis.speak(u);
  } catch { /* no voice on this device */ }
}
export const stopSpeaking = () => { try { speechSynthesis.cancel(); } catch { /* nothing to stop */ } };
