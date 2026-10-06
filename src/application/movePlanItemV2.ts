import type { CashFlowSourceStateV2, CashFlowWorkspaceV2 } from "../domain/v2/cashFlowV2";
import type { CashFlowRepositoryV2 } from "../domain/v2/repositoryV2";
import { DomainV2ValidationError } from "../domain/v2/validationV2";
import {
  executeWorkspaceV2Command,
  type WorkspaceV2CommandContext,
} from "./executeWorkspaceV2Command";

export interface MovePlanItemV2Command extends WorkspaceV2CommandContext {
  planItemId: string;
  move: "UP" | "DOWN";
}

export function planMoveAvailability(
  source: CashFlowSourceStateV2,
  planItemId: string,
): { UP: boolean; DOWN: boolean } {
  const item = source.planItems.find(value => value.planItemId === planItemId);
  if (!item || item.planStatus !== "ACTIVE") return { UP: false, DOWN: false };
  const peers = source.planItems
    .filter(value => value.monthId === item.monthId &&
      value.direction === item.direction && value.planStatus === "ACTIVE")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const index = peers.findIndex(value => value.planItemId === planItemId);
  return { UP: index > 0, DOWN: index < peers.length - 1 };
}

/** Swap order with the adjacent active item in the same month and direction. */
export async function movePlanItemV2(
  repository: CashFlowRepositoryV2,
  command: MovePlanItemV2Command,
): Promise<CashFlowWorkspaceV2> {
  const request = structuredClone(command);
  if (!request.planItemId.trim() || (request.move !== "UP" && request.move !== "DOWN")) {
    throw new DomainV2ValidationError("Plan item id and UP/DOWN move are required.");
  }

  return executeWorkspaceV2Command(repository, request, source => {
    const item = source.planItems.find(value => value.planItemId === request.planItemId);
    if (!item || item.planStatus !== "ACTIVE") {
      throw new DomainV2ValidationError("Active plan item must exist.");
    }
    const peers = source.planItems
      .filter(value => value.monthId === item.monthId &&
        value.direction === item.direction && value.planStatus === "ACTIVE")
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const index = peers.findIndex(value => value.planItemId === item.planItemId);
    const neighbor = peers[index + (request.move === "UP" ? -1 : 1)];
    if (!neighbor) {
      throw new DomainV2ValidationError("Plan item is already at that edge.");
    }
    return {
      ...source,
      planItems: source.planItems.map(value => {
        if (value.planItemId === item.planItemId) {
          return { ...value, sortOrder: neighbor.sortOrder, updatedAt: request.changedAt };
        }
        if (value.planItemId === neighbor.planItemId) {
          return { ...value, sortOrder: item.sortOrder, updatedAt: request.changedAt };
        }
        return value;
      }),
    };
  });
}
