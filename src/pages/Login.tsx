import { useState } from "react";
import { Wordmark } from "../components/icons";
import { InstallBanner } from "../components/InstallBanner";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";

export function Login() {
  const [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(/invalid/i.test(error.message) ? "Courriel ou mot de passe incorrect." : navigator.onLine ? error.message : "Pas de réseau.");
  };
  return (
    <div className="app">
      <InstallBanner />
      <div className="login">
        <form onSubmit={submit}>
          <div className="logo"><Wordmark height={84} /></div>
          <p className="muted">La maison en un coup d'œil.</p>
          <input className="input" type="email" autoComplete="username" placeholder="Courriel" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="input" type="password" autoComplete="current-password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
          <button className="btn primary" disabled={busy}>{busy ? "Connexion…" : "Se connecter"}</button>
          <a className="small" href="?demo">Voir une démonstration (famille fictive)</a>
        </form>
      </div>
    </div>
  );
}

// Signed in, but the account is not one of the family's members
export function NotLinked() {
  const { email, signOut } = useSession();
  return (
    <div className="login"><div className="col" style={{ maxWidth: 420 }}>
      <div className="logo"><Wordmark /></div>
      <p>Le compte <b>{email}</b> n'est pas encore relié à un membre de la famille.</p>
      <p className="muted small">Un adulte de la famille doit relier ce compte (voir docs/SETUP.md, « Relier les comptes »). Si c'est déjà fait, vérifie ta connexion et réessaie.</p>
      <button className="btn" onClick={() => location.reload()}>Réessayer</button>
      <button className="btn" onClick={() => void signOut()}>Se déconnecter</button>
    </div></div>
  );
}
