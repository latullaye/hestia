// The intercom button and its panel: speak (or type), Claude acts through the tools, the answer is shown and read aloud.
import { Loader, Mic, Send, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ask, canListen, listen, speak, stopSpeaking, type Listening, type Turn } from "../lib/intercom";
import { useSession } from "../lib/session";

type Phase = "idle" | "listening" | "thinking" | "answer";
const WHY: Record<string, string> = {
  denied: "Le micro n'est pas autorisé pour Hestia. Écris ta demande ci-dessous.",
  network: "La reconnaissance vocale a besoin du réseau. Écris ta demande ci-dessous.",
  silence: "Je n'ai rien entendu.",
  other: "Le micro n'a pas fonctionné. Écris ta demande ci-dessous.",
};

export function IntercomPanel({ onClose }: { onClose: () => void }) {
  const { acting, isKiosk } = useSession();
  const [phase, setPhase] = useState<Phase>("idle");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState("");
  const history = useRef<Turn[]>([]);
  const rec = useRef<Listening | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();

  const send = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setHeard(text); setPhase("thinking"); setNote("");
    const a = await ask(text.trim(), history.current, acting?.id ?? null);
    history.current = [...history.current, { role: "user" as const, text }, { role: "assistant" as const, text: a.reply }].slice(-6);
    setReply(a.reply); setPhase("answer");
    speak(a.reply);
    // In the kitchen, the panel goes away by itself
    if (isKiosk) { clearTimeout(closeTimer.current); closeTimer.current = setTimeout(onClose, 20_000); }
  }, [acting, isKiosk, onClose]);

  const start = useCallback(() => {
    stopSpeaking(); clearTimeout(closeTimer.current);
    setHeard(""); setReply(""); setNote("");
    const r = listen({
      interim: setHeard,
      final: (text) => void send(text),
      error: (why) => { setPhase("idle"); setNote(WHY[why]); },
    });
    rec.current = r;
    if (r) setPhase("listening"); else { setPhase("idle"); setNote(canListen() ? WHY.other : "Ici, pas de reconnaissance vocale : écris ta demande, ou dicte-la avec le micro du clavier."); }
  }, [send]);

  useEffect(() => { start(); return () => { rec.current?.stop(); stopSpeaking(); clearTimeout(closeTimer.current); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="backdrop intercom" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="intercom-panel">
        <button className={`mic ${phase}`} onClick={() => (phase === "listening" ? rec.current?.stop() : phase === "thinking" ? undefined : start())} aria-label="Parler">
          {phase === "thinking" ? <Loader /> : phase === "listening" ? <Square /> : <Mic />}
        </button>
        {phase === "answer" ? <><p className="heard small">« {heard} »</p><p className="reply">{reply}</p></>
          : <p className="heard">{heard ? `« ${heard} »` : phase === "listening" ? "Je t'écoute…" : phase === "thinking" ? "…" : note || "Appuie sur le micro et parle."}</p>}
        {phase !== "answer" && note && heard && <p className="small muted">{note}</p>}
        <form className="row" style={{ width: "100%" }} onSubmit={(e) => { e.preventDefault(); rec.current?.stop(); const t = typed; setTyped(""); void send(t); }}>
          <input className="input grow" placeholder="Ou écris : « il faut acheter des œufs »" value={typed} onChange={(e) => setTyped(e.target.value)} enterKeyHint="send" />
          <button className="icon-btn" aria-label="Envoyer" disabled={!typed.trim() || phase === "thinking"}><Send /></button>
        </form>
        <div className="row" style={{ width: "100%" }}>
          {phase === "answer" && <button className="btn primary grow" onClick={start}><Mic />Parler encore</button>}
          <button className="btn grow" onClick={onClose}>Fermer</button>
        </div>
        {acting && <p className="tiny muted">C'est {acting.name} qui parle.</p>}
      </div>
    </div>
  );
}

export function IntercomFab() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="fab" onClick={() => setOpen(true)} aria-label="Interphone"><Mic /></button>
      {open && <IntercomPanel onClose={() => setOpen(false)} />}
    </>
  );
}
