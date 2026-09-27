import type { CashFlowRepository, CashFlowWorkspace } from "../domain/cashFlow";

export async function loadCashFlowWorkspace(
  repository: CashFlowRepository,
  ownerPartitionId: string,
  workspaceId: string,
): Promise<CashFlowWorkspace | null> {
  return repository.load(ownerPartitionId, workspaceId);
}
