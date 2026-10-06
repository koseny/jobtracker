import type { CashFlowWorkspaceV2, Money } from "../domain/v2/cashFlowV2";
import type { CashFlowRepositoryV2 } from "../domain/v2/repositoryV2";
import { DomainV2ValidationError } from "../domain/v2/validationV2";
import {
  executeWorkspaceV2Command,
  type WorkspaceV2CommandContext,
} from "./executeWorkspaceV2Command";

export interface RevisePlanItemAmountV2Command extends WorkspaceV2CommandContext {
  planItemId: string;
  planRevisionId: string;
  newAmount: Money;
  reason?: string;
}

/** Append a previous/new amount record and update one canonical monthly plan atomically. */
export async function revisePlanItemAmountV2(
  repository: CashFlowRepositoryV2,
  command: RevisePlanItemAmountV2Command,
): Promise<CashFlowWorkspaceV2> {
  const request = structuredClone(command);
  if (!request.planItemId.trim() || !request.planRevisionId.trim()) {
    throw new DomainV2ValidationError("Plan item and revision ids are required.");
  }
  if (!Number.isSafeInteger(request.newAmount.amountMinor) || request.newAmount.amountMinor < 0) {
    throw new DomainV2ValidationError("New planned amount must be a non-negative exact safe integer.");
  }
  if (request.reason !== undefined) {
    if (!request.reason.trim()) throw new DomainV2ValidationError("Omit an empty plan revision reason.");
    request.reason = request.reason.trim();
  }

  return executeWorkspaceV2Command(repository, request, source => {
    const plan = source.planItems.find(value => value.planItemId === request.planItemId);
    if (!plan) throw new DomainV2ValidationError("Plan item must exist.");
    if (request.newAmount.currencyCode !== plan.currentPlannedAmount.currencyCode) {
      throw new DomainV2ValidationError("Plan revision must use the plan's native currency.");
    }
    if (request.newAmount.amountMinor === plan.currentPlannedAmount.amountMinor) {
      throw new DomainV2ValidationError("Plan revision requires an amount change.");
    }
    const revisionNo = 1 + source.planRevisions.filter(value => value.planItemId === request.planItemId)
      .reduce((max, value) => Math.max(max, value.revisionNo), 0);
    if (!Number.isSafeInteger(revisionNo)) {
      throw new DomainV2ValidationError("Plan revision sequence exceeds exact integer precision.");
    }
    return {
      ...source,
      planItems: source.planItems.map(value => value.planItemId === request.planItemId
        ? { ...value, currentPlannedAmount: { ...request.newAmount }, updatedAt: request.changedAt }
        : value),
      planRevisions: [...source.planRevisions, {
        planRevisionId: request.planRevisionId,
        planItemId: request.planItemId,
        revisionNo,
        previousAmount: { ...plan.currentPlannedAmount },
        newAmount: { ...request.newAmount },
        changedAt: request.changedAt,
        ...(request.reason === undefined ? {} : { reason: request.reason }),
      }],
    };
  });
}
