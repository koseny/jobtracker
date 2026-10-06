import type { CashFlowWorkspaceV2, PlanItem } from "../domain/v2/cashFlowV2";
import type { CashFlowRepositoryV2 } from "../domain/v2/repositoryV2";
import { DomainV2ValidationError } from "../domain/v2/validationV2";
import {
  executeWorkspaceV2Command,
  type WorkspaceV2CommandContext,
} from "./executeWorkspaceV2Command";

export interface CreatePlanItemV2Command extends WorkspaceV2CommandContext {
  planItemId: string;
  item: Pick<PlanItem, "monthId" | "direction" | "name" | "currentPlannedAmount" | "expectedDate">;
}

/** Create one explicit monthly expectation without posting a financial movement. */
export async function createPlanItemV2(
  repository: CashFlowRepositoryV2,
  command: CreatePlanItemV2Command,
): Promise<CashFlowWorkspaceV2> {
  // Freeze caller input before loading; the shared command boundary validates and saves once.
  const request = structuredClone(command);
  if (!request.planItemId.trim() || !request.item.name.trim()) {
    throw new DomainV2ValidationError("Plan item id and name are required.");
  }
  if (request.item.direction !== "INCOME" && request.item.direction !== "EXPENSE") {
    throw new DomainV2ValidationError("Plan direction must be INCOME or EXPENSE.");
  }
  if (!Number.isSafeInteger(request.item.currentPlannedAmount.amountMinor) ||
      request.item.currentPlannedAmount.amountMinor < 0) {
    throw new DomainV2ValidationError("Planned amount must be a non-negative exact safe integer.");
  }

  return executeWorkspaceV2Command(repository, request, source => ({
    ...source,
    planItems: [...source.planItems, {
      planItemId: request.planItemId,
      monthId: request.item.monthId,
      direction: request.item.direction,
      name: request.item.name.trim(),
      currentPlannedAmount: { ...request.item.currentPlannedAmount },
      planStatus: "ACTIVE",
      completionStatus: "OPEN",
      ...(request.item.expectedDate === undefined ? {} : { expectedDate: request.item.expectedDate }),
      createdAt: request.changedAt,
      updatedAt: request.changedAt,
    }],
  }));
}
