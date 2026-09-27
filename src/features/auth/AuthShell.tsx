import { useEffect, useState } from "react";
import type { IdentityAdapter, IdentityState } from "../../adapters/identity/identity";

type Props = { identity: IdentityAdapter };

const initialState: IdentityState = { status: "loading" };

function messageFor(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  return code === "auth/popup-closed-by-user"
    ? "Google sign-in was cancelled."
    : "Sign-in could not be completed. Please try again.";
}

export function AuthShell({ identity }: Props) {
  const [state, setState] = useState<IdentityState>(initialState);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => identity.subscribe(setState), [identity]);

  async function run(action: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (cause) {
      console.error(cause);
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <section className="card" aria-live="polite">
        <div className="brand">CivilBonus</div>

        {state.status === "loading" && (
          <div className="view">
            <div className="spinner" aria-hidden="true" />
            <p>Checking authentication…</p>
          </div>
        )}

        {state.status === "signedOut" && (
          <div className="view">
            <p className="eyebrow">Authentication experiment</p>
            <h1>Welcome</h1>
            <p className="muted">Sign in with your Google account to continue.</p>
            <button className="google-button" disabled={busy} onClick={() => run(() => identity.signInWithGoogle())}>
              <span className="google-mark" aria-hidden="true">G</span>
              Continue with Google
            </button>
          </div>
        )}

        {state.status === "signedIn" && (
          <div className="view">
            <p className="eyebrow">Authenticated</p>
            {state.user.photoUrl && (
              <img className="avatar" src={state.user.photoUrl} alt={state.user.displayName ? state.user.displayName + "'s profile picture" : "Google profile picture"} />
            )}
            <h1>Welcome, {state.user.displayName || "Google user"}</h1>
            <p className="email">{state.user.email || ""}</p>
            <p className="success">You are authenticated with Google.</p>
            <button className="secondary-button" disabled={busy} onClick={() => run(() => identity.signOut())}>Sign out</button>
          </div>
        )}

        {error && <p className="error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
