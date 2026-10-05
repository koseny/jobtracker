import { isValidIsoDate } from "../domain/time";
import type { AllocationEvent, CashFlowWorkspaceV2, Money } from "../domain/v2/cashFlowV2";
import type { CashFlowRepositoryV2 } from "../domain/v2/repositoryV2";
import { DomainV2ValidationError } from "../domain/v2/validationV2";
import { assertSafeReserveTimeline } from "./allocationReserveV2";
import { executeWorkspaceV2Command, type WorkspaceV2CommandContext } from "./executeWorkspaceV2Command";

export interface AdjustAllocationV2Command extends WorkspaceV2CommandContext {
  allocationId: string;
  allocationEventId: string;
  amount: Money;
  occurredAt: string;
  reason: string;
}

/**
 * Append an explicit signed correction to an ACTIVE allocation. ADJUST changes
 * reserve coverage only; account position and actual income/expense are untouched.
 */
export async function adjustAllocationV2(
  repository: CashFlowRepositoryV2,
  command: AdjustAllocationV2Command,
): Promise<CashFlowWorkspaceV2> {
  const request = structuredClone(command);
  if (!request.allocationId.trim() || !request.allocationEventId.trim()) {
    throw new DomainV2ValidationError("Allocation and event ids are required.");
  }
  if (!Number.isSafeInteger(request.amount.amountMinor) || request.amount.amountMinor === 0) {
    throw new DomainV2ValidationError("ADJUST amount must be a nonzero exact safe integer.");
  }
  if (!request.reason.trim()) {
    throw new DomainV2ValidationError("ADJUST requires a nonblank reason.");
  }
  request.reason = request.reason.trim();
  const timestamp = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
  if (!timestamp.test(request.occurredAt) ||
      !isValidIsoDate(request.occurredAt.slice(0, 10)) ||
      !Number.isFinite(Date.parse(request.occurredAt))) {
    throw new DomainV2ValidationError("Allocation occurredAt must be a real ISO timestamp with a timezone.");
  }

  return executeWorkspaceV2Command(repository, request, source => {
    const allocation = source.allocations.find(value => value.allocationId === request.allocationId);
    if (!allocation || allocation.state !== "ACTIVE") {
      throw new DomainV2ValidationError("Allocation must exist and be ACTIVE.");
    }
    if (request.amount.currencyCode !== allocation.currencyCode) {
      throw new DomainV2ValidationError("ADJUST amount must use the allocation account currency.");
    }
    const event: AllocationEvent = {
      allocationEventId: request.allocationEventId,
      allocationId: request.allocationId,
      eventType: "ADJUST",
      amount: { ...request.amount },
      occurredAt: request.occurredAt,
      note: request.reason,
    };
    assertSafeReserveTimeline(source, event);
    return {
      ...source,
      allocations: source.allocations.map(value =>
        value.allocationId === request.allocationId ? { ...value, updatedAt: request.changedAt } : value,
      ),
      allocationEvents: [...source.allocationEvents, event],
    };
  });
}
