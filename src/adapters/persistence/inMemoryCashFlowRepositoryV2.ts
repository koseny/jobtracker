import type { CashFlowWorkspaceV2 } from "../../domain/v2/cashFlowV2";
import {
  assertV2RevisionTransition,
  assertV2WorkspaceOwnership,
  type CashFlowRepositoryV2,
} from "../../domain/v2/repositoryV2";
import { validateWorkspaceV2 } from "../../domain/v2/validationV2";

export class InMemoryCashFlowRepositoryV2 implements CashFlowRepositoryV2 {
  private readonly workspaces = new Map<string, CashFlowWorkspaceV2>();

  async load(ownerPartitionId: string, workspaceId: string): Promise<CashFlowWorkspaceV2 | null> {
    const workspace = this.workspaces.get(this.key(ownerPartitionId, workspaceId));
    return workspace ? structuredClone(workspace) : null;
  }

  async save(
    ownerPartitionId: string,
    workspace: CashFlowWorkspaceV2,
    expectedRevision: number | null,
  ): Promise<void> {
    assertV2WorkspaceOwnership(workspace, ownerPartitionId);
    validateWorkspaceV2(workspace);

    const key = this.key(ownerPartitionId, workspace.workspaceId);
    const current = this.workspaces.get(key) ?? null;
    assertV2RevisionTransition(current, workspace, expectedRevision);

    this.workspaces.set(key, structuredClone(workspace));
  }

  private key(ownerPartitionId: string, workspaceId: string): string {
    return `${ownerPartitionId}::${workspaceId}`;
  }
}
