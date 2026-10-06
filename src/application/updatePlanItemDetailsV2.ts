import type { CashFlowWorkspaceV2, PlanItem } from "../domain/v2/cashFlowV2";
import type { CashFlowRepositoryV2 } from "../domain/v2/repositoryV2";
import { DomainV2ValidationError } from "../domain/v2/validationV2";
import {
  executeWorkspaceV2Command,
  type WorkspaceV2CommandContext,
} from "./executeWorkspaceV2Command";

export interface UpdatePlanItemDetailsV2Command extends WorkspaceV2CommandContext {
  planItemId: string;
  name?: string;
  /** null clears the date; omitted leaves it unchanged. */
  expectedDate?: string | null;
}

/** Edit display/timing details without changing the canonical amount or its history. */
export async function updatePlanItemDetailsV2(
  repository: CashFlowRepositoryV2,
  command: UpdatePlanItemDetailsV2Command,
): Promise<CashFlowWorkspaceV2> {
  const request = structuredClone(command);
  if (!request.planItemId.trim()) throw new DomainV2ValidationError("Plan item id is required.");
  if (request.name === undefined && request.expectedDate === undefined) {
    throw new DomainV2ValidationError("At least one plan detail must change.");
  }
  if (request.name !== undefined) {
    request.name = request.name.trim();
    if (!request.name) throw new DomainV2ValidationError("Plan item name is required.");
  }

  return executeWorkspaceV2Command(repository, request, source => {
    const item = source.planItems.find(value => value.planItemId === request.planItemId);
    if (!item) throw new DomainV2ValidationError("Plan item must exist.");
    const nextName = request.name ?? item.name;
    const nextDate = request.expectedDate === undefined
      ? item.expectedDate
      : request.expectedDate === null ? undefined : request.expectedDate;
    if (nextName === item.name && nextDate === item.expectedDate) {
      throw new DomainV2ValidationError("Plan detail edit requires a change.");
    }
    const updated: PlanItem = { ...item, name: nextName, updatedAt: request.changedAt };
    if (nextDate === undefined) delete updated.expectedDate;
    else updated.expectedDate = nextDate;
    return {
      ...source,
      planItems: source.planItems.map(value => value.planItemId === request.planItemId ? updated : value),
    };
  });
}
