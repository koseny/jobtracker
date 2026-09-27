import { firebaseIdentityAdapter } from "../adapters/identity/firebaseIdentity";
import { AuthShell } from "../features/auth/AuthShell";

export function App() {
  return <AuthShell identity={firebaseIdentityAdapter} />;
}
