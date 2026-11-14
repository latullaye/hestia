// Who is using the app: the signed-in member (an adult on their phone, or the kiosk's own account), or the demo family.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { demoTables } from "./demo";
import { useMembers, useSyncStatus } from "./hooks";
import { store } from "./store";
import { supabase } from "./supabase";
import type { Member } from "./types";

type Session = {
  loading: boolean;
  signedIn: boolean;
  demo: boolean;
  me: Member | null;            // the member behind the account (null: account not linked to the family yet)
  isKiosk: boolean;             // the account is a shared device
  isAdult: boolean;
  acting: Member | null;        // on the kiosk: who is touching the screen, when they said so
  setActing: (m: Member | null) => void;
  email: string | null;
  signOut: () => Promise<void>;
};
const Ctx = createContext<Session>(null as unknown as Session);
export const useSession = () => useContext(Ctx);

// "?demo" (or "?demo=kiosk") in the address: a fictional family, nothing leaves the page
export const demoMode = () => new URLSearchParams(location.search).get("demo");

export function SessionProvider({ children }: { children: ReactNode }) {
  const demo = demoMode();
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const members = useMembers();
  const status = useSyncStatus();

  useEffect(() => {
    if (demo !== null) {
      store.initDemo(demoTables());
      setUserId(demo === "kiosk" ? "demo-kiosk" : "demo-adult");
      setLoading(false);
      return;
    }
    const start = (id: string | null, mail: string | null) => {
      setUserId(id); setEmail(mail);
      if (id) void store.init(id).finally(() => setLoading(false)); else setLoading(false);
    };
    supabase.auth.getSession().then(({ data }) => start(data.session?.user.id ?? null, data.session?.user.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") start(session?.user.id ?? null, session?.user.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [demo]);

  const me = useMemo(() => members.all.find((m) => m.auth_user_id === userId) ?? null, [members, userId]);
  const acting = (actingId && members.byId.get(actingId)) || null;
  const isKiosk = me?.role === "device";
  // Every write carries its author: the adult, or on the kiosk the person picked (else the server names the kiosk)
  store.actorId = isKiosk ? acting?.id ?? null : me?.id ?? null;

  // On the kiosk, "who is there" is forgotten after two minutes
  useEffect(() => {
    if (!actingId || !isKiosk) return;
    const t = setTimeout(() => setActingId(null), 2 * 60 * 1000);
    return () => clearTimeout(t);
  }, [actingId, isKiosk]);

  const value: Session = {
    loading: loading || (!!userId && !status.ready),
    signedIn: !!userId, demo: demo !== null, me, isKiosk, isAdult: me?.role === "adult", acting,
    setActing: (m) => setActingId(m?.id ?? null), email,
    signOut: async () => { await supabase.auth.signOut(); await store.clear(); setUserId(null); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
