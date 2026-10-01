import { isValidIsoDate } from "../domain/time";
import type { CashFlowSourceStateV2, CashFlowWorkspaceV2 } from "../domain/v2/cashFlowV2";
import {
  assertV2WorkspaceOwnership,
  type CashFlowRepositoryV2,
  WorkspaceV2NotFoundError,
  WorkspaceV2RevisionConflictError,
} from "../domain/v2/repositoryV2";
import { DomainV2ValidationError, validateWorkspaceV2 } from "../domain/v2/validationV2";

export interface WorkspaceV2CommandContext {
  ownerPartitionId: string;
  workspaceId: string;
  expectedRevision: number;
  changedAt: string;
}

function validateContext(context: WorkspaceV2CommandContext): void {
  if (!context.ownerPartitionId.trim() || !context.workspaceId.trim()) {
    throw new DomainV2ValidationError("Command owner and workspace ids are required.");
  }
  if (!Number.isSafeInteger(context.expectedRevision) || context.expectedRevision < 1 ||
      !Number.isSafeInteger(context.expectedRevision + 1)) {
    throw new WorkspaceV2RevisionConflictError("Command expectedRevision must allow an exact increment.");
  }
  // Audit time is explicit; it does not replace the movement's date-only occurredOn.
  const timestamp = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
  if (!timestamp.test(context.changedAt) ||
      !isValidIsoDate(context.changedAt.slice(0, 10)) ||
      !Number.isFinite(Date.parse(context.changedAt))) {
    throw new DomainV2ValidationError("Command changedAt must be a real ISO timestamp with a timezone.");
  }
}

/**
 * Dormant application primitive for an existing canonical workspace.
 * Transform only detached source state, validate the complete result, then save once.
 * The repository must enforce expectedRevision atomically at persistence time; a
 * conflict is returned to the caller without automatic retry or overwrite.
 */
export async function executeWorkspaceV2Command(
  repository: CashFlowRepositoryV2,
  context: WorkspaceV2CommandContext,
  transform: (source: CashFlowSourceStateV2) => CashFlowSourceStateV2,
): Promise<CashFlowWorkspaceV2> {
  const request = { ...context };
  validateContext(request);
  const loaded = await repository.load(request.ownerPartitionId, request.workspaceId);
  if (!loaded) throw new WorkspaceV2NotFoundError("Canonical workspace was not found.");
  assertV2WorkspaceOwnership(loaded, request.ownerPartitionId);
  if (loaded.workspaceId !== request.workspaceId) {
    throw new WorkspaceV2NotFoundError("Repository returned a different workspace.");
  }
  validateWorkspaceV2(loaded);
  if (loaded.revision !== request.expectedRevision) {
    throw new WorkspaceV2RevisionConflictError("Workspace changed since the command was prepared.");
  }

  const detached = structuredClone(loaded);
  const next: CashFlowWorkspaceV2 = {
    ...detached,
    sourceState: structuredClone(transform(detached.sourceState)),
    revision: request.expectedRevision + 1,
    updatedAt: request.changedAt,
  };
  validateWorkspaceV2(next);
  await repository.save(request.ownerPartitionId, next, request.expectedRevision);
  return next;
}
