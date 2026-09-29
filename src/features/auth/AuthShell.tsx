import { FormEvent, useEffect, useState } from "react";
import type { IdentityAdapter, IdentityState } from "../../adapters/identity/identity";
import type { CashFlowRepository, CashFlowWorkspace, IncomeItem } from "../../domain/cashFlow";
import { addItem, ensureWorkspace } from "../../application/cashFlowService";

type Props = { identity: IdentityAdapter; cashFlowRepository: CashFlowRepository };
const initialState: IdentityState = { status: "loading" };
const WORKSPACE_ID = "home";

function messageFor(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code) : "";
  return code === "auth/popup-closed-by-user"
    ? "Google sign-in was cancelled."
    : error instanceof Error ? error.message : "The operation could not be completed. Please try again.";
}

export function AuthShell({ identity, cashFlowRepository }: Props) {
  const [state, setState] = useState<IdentityState>(initialState);
  const [workspace, setWorkspace] = useState<CashFlowWorkspace | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");

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
      .then(result => { if (active) setWorkspace(result); })
      .catch(cause => {
        console.error(cause);
        if (active) setError("Your local Home Cash Flow workspace could not be opened.");
      })
      .finally(() => { if (active) setWorkspaceLoading(false); });
    return () => { active = false; };
  }, [cashFlowRepository, state]);

  async function run(action: () => Promise<void>) {
    setError(""); setBusy(true);
    try { await action(); } catch (cause) { console.error(cause); setError(messageFor(cause)); }
    finally { setBusy(false); }
  }

  async function submitIncome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status !== "signedIn" || !workspace) return;
    const now = new Date().toISOString();
    const parsedAmount = Number(amount);
    const item: IncomeItem = {
      id: crypto.randomUUID(),
      name,
      direction: "income",
      mode: "bank",
      planningStatus: "planned",
      expenseType: null,
      schedule: { frequency: "monthly" },
      expectedAmountHuf: parsedAmount,
      createdAt: now,
      updatedAt: now,
    };
    await run(async () => {
      const updated = await addItem(cashFlowRepository, state.user.id, workspace.workspaceId, item);
      setWorkspace(updated);
      setName("");
      setAmount("");
    });
  }

  return (
    <main className="shell">
      <section className="card" aria-live="polite">
        <div className="brand">CivilBonus</div>
        {state.status === "loading" && <div className="view"><div className="spinner" aria-hidden="true" /><p>Checking authentication…</p></div>}
        {state.status === "signedOut" && (
          <div className="view">
            <p className="eyebrow">Home Cash Flow</p><h1>Welcome</h1>
            <p className="muted">Sign in with your Google account to open your local cash-flow workspace.</p>
            <button className="google-button" disabled={busy} onClick={() => run(() => identity.signInWithGoogle())}><span className="google-mark" aria-hidden="true">G</span>Continue with Google</button>
          </div>
        )}
        {state.status === "signedIn" && (
          <div className="view">
            <p className="eyebrow">Home Cash Flow</p>
            {state.user.photoUrl && <img className="avatar" src={state.user.photoUrl} alt={state.user.displayName ? state.user.displayName + "'s profile picture" : "Google profile picture"} />}
            <h1>Welcome, {state.user.displayName || "Google user"}</h1>
            <p className="email">{state.user.email || ""}</p>
            {workspaceLoading && <p className="muted">Opening your local workspace…</p>}
            {workspace && (
              <>
                <p className="success">Your local Home Cash Flow workspace is ready.</p>
                <p className="muted">{workspace.items.length} cash-flow items · {workspace.currency}</p>
                <form className="item-form" onSubmit={submitIncome}>
                  <h2>Add monthly income</h2>
                  <label>Name<input value={name} onChange={event => setName(event.target.value)} required /></label>
                  <label>Expected amount (HUF)<input type="number" min="0" step="1" inputMode="numeric" value={amount} onChange={event => setAmount(event.target.value)} required /></label>
                  <button className="google-button" disabled={busy}>Add income</button>
                </form>
                <div className="item-list" aria-label="Cash-flow items">
                  {workspace.items.map(item => (
                    <div className="item-row" key={item.id}>
                      <strong>{item.name}</strong>
                      <span>{item.direction === "income" ? item.expectedAmountHuf : item.estimatedAmountHuf} HUF · {item.schedule.frequency}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            <button className="secondary-button" disabled={busy} onClick={() => run(() => identity.signOut())}>Sign out</button>
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
