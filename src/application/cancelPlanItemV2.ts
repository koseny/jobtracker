import type { CashFlowWorkspaceV2 } from "../domain/v2/cashFlowV2";
import type { CashFlowRepositoryV2 } from "../domain/v2/repositoryV2";
import { DomainV2ValidationError } from "../domain/v2/validationV2";
import {
  executeWorkspaceV2Command,
  type WorkspaceV2CommandContext,
} from "./executeWorkspaceV2Command";

export interface CancelPlanItemV2Command extends WorkspaceV2CommandContext {
  planItemId: string;
}

/** Remove an expectation from active plans while retaining the item and all links/history. */
export async function cancelPlanItemV2(
  repository: CashFlowRepositoryV2,
  command: CancelPlanItemV2Command,
): Promise<CashFlowWorkspaceV2> {
  const request = structuredClone(command);
  if (!request.planItemId.trim()) throw new DomainV2ValidationError("Plan item id is required.");

  return executeWorkspaceV2Command(repository, request, source => {
    const item = source.planItems.find(value => value.planItemId === request.planItemId);
    if (!item) throw new DomainV2ValidationError("Plan item must exist.");
    if (item.planStatus === "CANCELLED") {
      throw new DomainV2ValidationError("Plan item is already cancelled.");
    }
    return {
      ...source,
      planItems: source.planItems.map(value => value.planItemId === request.planItemId
        ? { ...value, planStatus: "CANCELLED" as const, updatedAt: request.changedAt }
        : value),
    };
  });
}
