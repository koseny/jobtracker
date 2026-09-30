import type { CashFlowWorkspaceV2 } from "../domain/v2/cashFlowV2";
import {
  assertV2WorkspaceOwnership,
  type CashFlowRepositoryV2,
} from "../domain/v2/repositoryV2";
import { validateWorkspaceV2 } from "../domain/v2/validationV2";

export async function loadValidatedWorkspaceV2ReadOnly(
  repository: CashFlowRepositoryV2,
  ownerPartitionId: string,
  workspaceId: string,
): Promise<CashFlowWorkspaceV2 | null> {
  const workspace = await repository.load(ownerPartitionId, workspaceId);
  if (!workspace) return null;

  assertV2WorkspaceOwnership(workspace, ownerPartitionId);
  validateWorkspaceV2(workspace);
  return workspace;
}
