import type { CashFlowItem, CashFlowRepository, CashFlowWorkspace } from "../domain/cashFlow";
import { validateBufferPolicy, validateItem } from "../domain/validation";

export class WorkspaceNotFoundError extends Error {}
export class WorkspaceOwnershipError extends Error {}

function assertOwnership(workspace: CashFlowWorkspace, ownerPartitionId: string): void {
  if (workspace.ownerPartitionId !== ownerPartitionId) {
    throw new WorkspaceOwnershipError("Workspace does not belong to the active owner partition.");
  }
}

export async function loadWorkspace(
  repository: CashFlowRepository,
  ownerPartitionId: string,
  workspaceId: string,
): Promise<CashFlowWorkspace | null> {
  return repository.load(ownerPartitionId, workspaceId);
}

export async function saveWorkspace(
  repository: CashFlowRepository,
  ownerPartitionId: string,
  workspace: CashFlowWorkspace,
): Promise<void> {
  assertOwnership(workspace, ownerPartitionId);
  validateBufferPolicy(workspace.bufferPolicy);
  workspace.items.forEach(validateItem);
  await repository.save(workspace);
}

export async function addItem(
  repository: CashFlowRepository,
  ownerPartitionId: string,
  workspaceId: string,
  item: CashFlowItem,
): Promise<CashFlowWorkspace> {
  validateItem(item);
  const workspace = await repository.load(ownerPartitionId, workspaceId);
  if (!workspace) throw new WorkspaceNotFoundError("Cash-flow workspace was not found.");
  assertOwnership(workspace, ownerPartitionId);
  if (workspace.items.some(existing => existing.id === item.id)) {
    throw new Error("An item with this id already exists.");
  }
  const updated = { ...workspace, items: [...workspace.items, item], updatedAt: item.updatedAt };
  await repository.save(updated);
  return updated;
}

export async function deleteItem(
  repository: CashFlowRepository,
  ownerPartitionId: string,
  workspaceId: string,
  itemId: string,
  updatedAt: string,
): Promise<CashFlowWorkspace> {
  const workspace = await repository.load(ownerPartitionId, workspaceId);
  if (!workspace) throw new WorkspaceNotFoundError("Cash-flow workspace was not found.");
  assertOwnership(workspace, ownerPartitionId);
  const updated = { ...workspace, items: workspace.items.filter(item => item.id !== itemId), updatedAt };
  await repository.save(updated);
  return updated;
}
