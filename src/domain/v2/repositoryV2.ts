import type { CashFlowWorkspaceV2 } from "./cashFlowV2";

export class WorkspaceV2OwnershipError extends Error {}
export class WorkspaceV2RevisionConflictError extends Error {}
export class WorkspaceV2AlreadyExistsError extends Error {}
export class WorkspaceV2NotFoundError extends Error {}

export interface CashFlowRepositoryV2 {
  load(ownerPartitionId: string, workspaceId: string): Promise<CashFlowWorkspaceV2 | null>;

  /**
   * expectedRevision === null means create-only and fails if the workspace already exists.
   * Otherwise the persisted revision must equal expectedRevision and workspace.revision
   * must be expectedRevision + 1.
   */
  save(
    ownerPartitionId: string,
    workspace: CashFlowWorkspaceV2,
    expectedRevision: number | null,
  ): Promise<void>;
}

export function assertV2WorkspaceOwnership(
  workspace: CashFlowWorkspaceV2,
  ownerPartitionId: string,
): void {
  if (workspace.ownerPartitionId !== ownerPartitionId) {
    throw new WorkspaceV2OwnershipError(
      "Workspace does not belong to the active owner partition.",
    );
  }
}

export function assertV2RevisionTransition(
  current: CashFlowWorkspaceV2 | null,
  next: CashFlowWorkspaceV2,
  expectedRevision: number | null,
): void {
  if (expectedRevision === null) {
    if (current) {
      throw new WorkspaceV2AlreadyExistsError("Workspace already exists.");
    }
    if (next.revision !== 1) {
      throw new WorkspaceV2RevisionConflictError(
        "New canonical workspace must start at revision 1.",
      );
    }
    return;
  }

  if (!current) {
    throw new WorkspaceV2NotFoundError("Workspace was not found.");
  }
  if (current.revision !== expectedRevision) {
    throw new WorkspaceV2RevisionConflictError(
      "Persisted workspace revision does not match expectedRevision.",
    );
  }
  if (next.revision !== expectedRevision + 1) {
    throw new WorkspaceV2RevisionConflictError(
      "Next workspace revision must increment exactly by one.",
    );
  }
}
