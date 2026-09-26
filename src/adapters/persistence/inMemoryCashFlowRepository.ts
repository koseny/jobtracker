import type { CashFlowRepository, CashFlowWorkspace } from "../../domain/cashFlow";

export class InMemoryCashFlowRepository implements CashFlowRepository {
  private readonly workspaces = new Map<string, CashFlowWorkspace>();

  async load(ownerPartitionId: string, workspaceId: string): Promise<CashFlowWorkspace | null> {
    return this.workspaces.get(this.key(ownerPartitionId, workspaceId)) ?? null;
  }

  async save(workspace: CashFlowWorkspace): Promise<void> {
    this.workspaces.set(this.key(workspace.ownerPartitionId, workspace.workspaceId), structuredClone(workspace));
  }

  private key(ownerPartitionId: string, workspaceId: string): string {
    return `${ownerPartitionId}::${workspaceId}`;
  }
}
