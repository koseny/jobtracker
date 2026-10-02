import type { CashFlowWorkspaceV2 } from "../domain/v2/cashFlowV2";
import type { CashFlowRepositoryV2 } from "../domain/v2/repositoryV2";
import { DomainV2ValidationError } from "../domain/v2/validationV2";
import { executeWorkspaceV2Command, type WorkspaceV2CommandContext } from "./executeWorkspaceV2Command";

export interface VoidMovementV2Command extends WorkspaceV2CommandContext {
  movementId: string;
  reason?: string;
}

export class VoidMovementV2ScopeError extends Error {}

/** Void an unlinked ACTIVE movement, retaining its current revision and full history. */
export async function voidMovementV2(
  repository: CashFlowRepositoryV2,
  command: VoidMovementV2Command,
): Promise<CashFlowWorkspaceV2> {
  const request = structuredClone(command);
  if (request.reason !== undefined &&
      (typeof request.reason !== "string" || !request.reason.trim())) {
    throw new DomainV2ValidationError("Void reason must be nonblank when supplied.");
  }

  return executeWorkspaceV2Command(repository, request, source => {
    const movement = source.moneyMovements.find(value => value.movementId === request.movementId);
    if (!movement) throw new DomainV2ValidationError("Movement to void must exist.");
    if (movement.lifecycleStatus !== "ACTIVE") {
      throw new VoidMovementV2ScopeError("Only an ACTIVE movement can be voided.");
    }
    if (source.planRealizations.some(value => value.movementId === movement.movementId) ||
        source.allocationEvents.some(value => value.movementId === movement.movementId)) {
      throw new VoidMovementV2ScopeError("Financially linked movement void requires separate dependency resolution.");
    }
    return {
      ...source,
      moneyMovements: source.moneyMovements.map(value => value.movementId === movement.movementId
        ? {
            ...value,
            lifecycleStatus: "VOIDED" as const,
            updatedAt: request.changedAt,
            voidedAt: request.changedAt,
            ...(request.reason === undefined ? {} : { voidReason: request.reason.trim() }),
          }
        : value),
    };
  });
}
