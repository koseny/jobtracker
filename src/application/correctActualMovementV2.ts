import type { CashFlowWorkspaceV2, IncomeExpenseMovementRevisionPayload } from "../domain/v2/cashFlowV2";
import type { CashFlowRepositoryV2 } from "../domain/v2/repositoryV2";
import { DomainV2ValidationError } from "../domain/v2/validationV2";
import { executeWorkspaceV2Command, type WorkspaceV2CommandContext } from "./executeWorkspaceV2Command";

export interface CorrectActualMovementV2Command extends WorkspaceV2CommandContext {
  movementId: string;
  movementRevisionId: string;
  payload: IncomeExpenseMovementRevisionPayload;
}

export class ActualMovementV2CorrectionScopeError extends Error {}

/**
 * Append a correction to an ACTIVE standalone INCOME/EXPENSE. The supplied
 * payload is the complete replacement business value, not a partial patch.
 * Financially linked movements require a later dependency-aware command; this
 * bounded command never adjusts or unlinks reconciliation/allocation records.
 * DailyEvent references remain attached to the stable movement identity.
 */
export async function correctActualMovementV2(
  repository: CashFlowRepositoryV2,
  command: CorrectActualMovementV2Command,
): Promise<CashFlowWorkspaceV2> {
  const request = structuredClone(command);
  const payload = request.payload;
  if (payload.movementType !== "INCOME" && payload.movementType !== "EXPENSE") {
    throw new DomainV2ValidationError("This command corrects only INCOME or EXPENSE movements.");
  }
  if (!Number.isSafeInteger(payload.amount.amountMinor)) {
    throw new DomainV2ValidationError("Movement amountMinor must be an exact safe integer.");
  }
  if (payload.accountId !== undefined && !payload.accountId.trim()) {
    throw new DomainV2ValidationError("Omit accountId when the actual has no account.");
  }

  return executeWorkspaceV2Command(repository, request, source => {
    const movement = source.moneyMovements.find(value => value.movementId === request.movementId);
    if (!movement) throw new DomainV2ValidationError("Movement to correct must exist.");
    if (movement.lifecycleStatus !== "ACTIVE" || movement.movementType === "TRANSFER") {
      throw new ActualMovementV2CorrectionScopeError("Only ACTIVE standalone INCOME/EXPENSE correction is supported.");
    }
    if (payload.movementType !== movement.movementType) {
      throw new DomainV2ValidationError("Correction must preserve the stable movement type.");
    }
    if (source.planRealizations.some(value => value.movementId === movement.movementId) ||
        source.allocationEvents.some(value => value.movementId === movement.movementId)) {
      throw new ActualMovementV2CorrectionScopeError("Financially linked corrections require dependency-aware commands outside this slice.");
    }
    if (payload.categoryId !== undefined &&
        !source.categories.some(category => category.categoryId === payload.categoryId)) {
      throw new DomainV2ValidationError("Movement category must exist when supplied.");
    }
    const revisionNo = movement.currentRevisionNo + 1;
    if (!Number.isSafeInteger(movement.currentRevisionNo) || !Number.isSafeInteger(revisionNo)) {
      throw new DomainV2ValidationError("Movement revision must allow an exact increment.");
    }
    return {
      ...source,
      moneyMovements: source.moneyMovements.map(value => value.movementId === movement.movementId
        ? { ...value, currentRevisionNo: revisionNo, updatedAt: request.changedAt }
        : value),
      moneyMovementRevisions: [...source.moneyMovementRevisions, {
        movementRevisionId: request.movementRevisionId,
        movementId: movement.movementId,
        revisionNo,
        payload: {
          movementType: payload.movementType,
          occurredOn: payload.occurredOn,
          amount: { ...payload.amount },
          accountId: payload.accountId,
          categoryId: payload.categoryId,
          description: payload.description,
        },
        changedAt: request.changedAt,
      }],
    };
  });
}
