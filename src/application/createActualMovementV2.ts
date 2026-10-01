import type {
  CashFlowWorkspaceV2,
  IncomeExpenseMovementRevisionPayload,
} from "../domain/v2/cashFlowV2";
import type { CashFlowRepositoryV2 } from "../domain/v2/repositoryV2";
import { DomainV2ValidationError } from "../domain/v2/validationV2";
import {
  executeWorkspaceV2Command,
  type WorkspaceV2CommandContext,
} from "./executeWorkspaceV2Command";

export interface CreateActualMovementV2Command extends WorkspaceV2CommandContext {
  movementId: string;
  movementRevisionId: string;
  payload: IncomeExpenseMovementRevisionPayload;
}

/**
 * Create one standalone INCOME/EXPENSE and its first revision in a single save.
 * IDs and audit time are supplied by the caller. No implicit realization,
 * allocation, work-payment link, account creation, FX conversion or UI wiring.
 */
export async function createActualMovementV2(
  repository: CashFlowRepositoryV2,
  command: CreateActualMovementV2Command,
): Promise<CashFlowWorkspaceV2> {
  // Snapshot before the first await so callers cannot change an in-flight command.
  const request = structuredClone(command);
  const payload = request.payload;
  if (payload.movementType !== "INCOME" && payload.movementType !== "EXPENSE") {
    throw new DomainV2ValidationError("This command creates only INCOME or EXPENSE movements.");
  }
  if (!Number.isSafeInteger(payload.amount.amountMinor)) {
    throw new DomainV2ValidationError("Movement amountMinor must be an exact safe integer.");
  }
  if (payload.accountId !== undefined && !payload.accountId.trim()) {
    throw new DomainV2ValidationError("Omit accountId when the actual has no account.");
  }

  return executeWorkspaceV2Command(repository, request, source => {
    if (payload.categoryId !== undefined &&
        !source.categories.some(category => category.categoryId === payload.categoryId)) {
      throw new DomainV2ValidationError("Movement category must exist when supplied.");
    }
    return {
      ...source,
      moneyMovements: [...source.moneyMovements, {
        movementId: request.movementId,
        movementType: payload.movementType,
        lifecycleStatus: "ACTIVE",
        currentRevisionNo: 1,
        createdAt: request.changedAt,
        updatedAt: request.changedAt,
      }],
      moneyMovementRevisions: [...source.moneyMovementRevisions, {
        movementRevisionId: request.movementRevisionId,
        movementId: request.movementId,
        revisionNo: 1,
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
