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
  return voidInScope(repository, command, "unlinked");
}

/** Void a linked actual while retaining PlanRealization and allocation APPLY history. */
export async function voidLinkedMovementV2(
  repository: CashFlowRepositoryV2,
  command: VoidMovementV2Command,
): Promise<CashFlowWorkspaceV2> {
  return voidInScope(repository, command, "linked");
}

async function voidInScope(
  repository: CashFlowRepositoryV2,
  command: VoidMovementV2Command,
  scope: "unlinked" | "linked",
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
    const realizations = source.planRealizations.filter(value => value.movementId === movement.movementId);
    const events = source.allocationEvents.filter(value => value.movementId === movement.movementId);
    if (scope === "unlinked" && (realizations.length > 0 || events.length > 0)) {
      throw new VoidMovementV2ScopeError("Financially linked movement void requires separate dependency resolution.");
    }
    if (scope === "linked") {
      if (realizations.length === 0 && events.length === 0) {
        throw new VoidMovementV2ScopeError("This command requires an existing financial link.");
      }
      if (events.some(value => value.eventType !== "APPLY")) {
        throw new VoidMovementV2ScopeError("Movement-linked non-APPLY allocation events need separate resolution.");
      }
      if (events.length > 0) {
        const current = source.moneyMovementRevisions.find(value =>
          value.movementId === movement.movementId && value.revisionNo === movement.currentRevisionNo,
        )!;
        const payload = current.payload;
        if (payload.movementType !== "EXPENSE" || !payload.accountId ||
            events.some(event => {
              const allocation = source.allocations.find(value => value.allocationId === event.allocationId)!;
              return allocation.accountId !== payload.accountId ||
                event.amount.currencyCode !== payload.amount.currencyCode;
            })) {
          throw new VoidMovementV2ScopeError("Linked APPLY requires a compatible EXPENSE account and currency.");
        }
      }
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
