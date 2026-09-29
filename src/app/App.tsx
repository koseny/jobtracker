import { firebaseIdentityAdapter } from "../adapters/identity/firebaseIdentity";
import { IndexedDbCashFlowRepository } from "../adapters/persistence/indexedDbCashFlowRepository";
import { AuthShell } from "../features/auth/AuthShell";

const cashFlowRepository = new IndexedDbCashFlowRepository();

export function App() {
  return <AuthShell identity={firebaseIdentityAdapter} cashFlowRepository={cashFlowRepository} />;
}
