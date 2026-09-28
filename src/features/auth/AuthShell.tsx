import { useEffect, useState } from "react";
import type { IdentityAdapter, IdentityState } from "../../adapters/identity/identity";
import type { CashFlowRepository, CashFlowWorkspace } from "../../domain/cashFlow";
import { ensureWorkspace } from "../../application/cashFlowService";

type Props = { identity: IdentityAdapter; cashFlowRepository: CashFlowRepository };

const initialState: IdentityState = { status: "loading" };
const WORKSPACE_ID = "home";

function messageFor(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  return code === "auth/popup-closed-by-user"
    ? "Google sign-in was cancelled."
    : "The operation could not be completed. Please try again.";
}

export function AuthShell({ identity, cashFlowRepository }: Props) {
  const [state, setState] = useState<IdentityState>(initialState);
  const [workspace, setWorkspace] = useState<CashFlowWorkspace | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => identity.subscribe(setState), [identity]);

  useEffect(() => {
    if (state.status !== "signedIn") {
      setWorkspace(null);
      setWorkspaceLoading(false);
      return;
    }

    let active = true;
    setWorkspaceLoading(true);
    setError("");
    ensureWorkspace(cashFlowRepository, state.user.id, WORKSPACE_ID, new Date().toISOString())
      .then(result => {
        if (active) setWorkspace(result);
      })
      .catch(cause => {
        console.error(cause);
        if (active) setError("Your local Home Cash Flow workspace could not be opened.");
      })
      .finally(() => {
        if (active) setWorkspaceLoading(false);
      });
    return () => {
      active = false;
    };
  }, [cashFlowRepository, state]);

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
            <p className="eyebrow">Home Cash Flow</p>
            <h1>Welcome</h1>
            <p className="muted">Sign in with your Google account to open your local cash-flow workspace.</p>
            <button className="google-button" disabled={busy} onClick={() => run(() => identity.signInWithGoogle())}>
              <span className="google-mark" aria-hidden="true">G</span>
              Continue with Google
            </button>
          </div>
        )}

        {state.status === "signedIn" && (
          <div className="view">
            <p className="eyebrow">Home Cash Flow</p>
            {state.user.photoUrl && (
              <img className="avatar" src={state.user.photoUrl} alt={state.user.displayName ? state.user.displayName + "'s profile picture" : "Google profile picture"} />
            )}
            <h1>Welcome, {state.user.displayName || "Google user"}</h1>
            <p className="email">{state.user.email || ""}</p>
            {workspaceLoading && <p className="muted">Opening your local workspace…</p>}
            {workspace && (
              <div>
                <p className="success">Your local Home Cash Flow workspace is ready.</p>
                <p className="muted">{workspace.items.length} cash-flow items · {workspace.currency}</p>
              </div>
            )}
            <button className="secondary-button" disabled={busy} onClick={() => run(() => identity.signOut())}>Sign out</button>
          </div>
        )}

        {error && <p className="error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
