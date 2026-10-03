import { isValidIsoDate } from "../domain/time";
import type { Allocation, AllocationEvent, CashFlowSourceStateV2, CashFlowWorkspaceV2, Money } from "../domain/v2/cashFlowV2";
import type { CashFlowRepositoryV2 } from "../domain/v2/repositoryV2";
import { DomainV2ValidationError } from "../domain/v2/validationV2";
import { executeWorkspaceV2Command, type WorkspaceV2CommandContext } from "./executeWorkspaceV2Command";

interface AllocationEventCommand extends WorkspaceV2CommandContext {
  allocationId: string;
  allocationEventId: string;
  amount: Money;
  occurredAt: string;
  note?: string;
}

export interface ReserveAllocationV2Command extends AllocationEventCommand {
  newAllocation?: { accountId: string; purpose: string; linkedPlanItemId?: string };
}

export interface ReleaseAllocationV2Command extends AllocationEventCommand {}

function validatedRequest<T extends AllocationEventCommand>(command: T): T {
  const request = structuredClone(command);
  if (!request.allocationId.trim() || !request.allocationEventId.trim()) {
    throw new DomainV2ValidationError("Allocation and event ids are required.");
  }
  if (!Number.isSafeInteger(request.amount.amountMinor) || request.amount.amountMinor <= 0) {
    throw new DomainV2ValidationError("Reserve amount must be a positive exact safe integer.");
  }
  const timestamp = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
  if (!timestamp.test(request.occurredAt) || !isValidIsoDate(request.occurredAt.slice(0, 10)) ||
      !Number.isFinite(Date.parse(request.occurredAt))) {
    throw new DomainV2ValidationError("Allocation occurredAt must be a real ISO timestamp with a timezone.");
  }
  if (request.note !== undefined) {
    if (!request.note.trim()) throw new DomainV2ValidationError("Omit an empty allocation note.");
    request.note = request.note.trim();
  }
  return request;
}

function eventFor(request: AllocationEventCommand, eventType: "RESERVE" | "RELEASE"): AllocationEvent {
  return {
    allocationEventId: request.allocationEventId,
    allocationId: request.allocationId,
    eventType,
    amount: { ...request.amount },
    occurredAt: request.occurredAt,
    ...(request.note === undefined ? {} : { note: request.note }),
  };
}

function activeAllocation(source: CashFlowSourceStateV2, allocationId: string): Allocation {
  const allocation = source.allocations.find(value => value.allocationId === allocationId);
  if (!allocation || allocation.state !== "ACTIVE") {
    throw new DomainV2ValidationError("Allocation must exist and be ACTIVE.");
  }
  return allocation;
}

function assertNativeAmount(allocation: Allocation, amount: Money): void {
  if (amount.currencyCode !== allocation.currencyCode) {
    throw new DomainV2ValidationError("Reserve amount must use the allocation account currency.");
  }
}

function assertSafeReserveTimeline(
  source: CashFlowSourceStateV2,
  newEvent: AllocationEvent,
): void {
  const byDay = new Map<string, { gross: number; applied: number }>();
  const movementStatus = new Map(source.moneyMovements.map(value => [value.movementId, value.lifecycleStatus]));
  for (const event of [...source.allocationEvents, newEvent]) {
    if (event.allocationId !== newEvent.allocationId) continue;
    const day = event.occurredAt.slice(0, 10);
    const amounts = byDay.get(day) ?? { gross: 0, applied: 0 };
    switch (event.eventType) {
      case "RESERVE": case "ADJUST": amounts.gross += event.amount.amountMinor; break;
      case "RELEASE": amounts.gross -= event.amount.amountMinor; break;
      case "APPLY":
        if (event.movementId && movementStatus.get(event.movementId) === "ACTIVE") {
          amounts.applied += event.amount.amountMinor;
        }
        break;
    }
    if (!Number.isSafeInteger(amounts.gross) || !Number.isSafeInteger(amounts.applied)) {
      throw new DomainV2ValidationError("Reserve history exceeds exact safe integer precision.");
    }
    byDay.set(day, amounts);
  }
  let gross = 0, applied = 0;
  for (const day of [...byDay.keys()].sort()) {
    const amounts = byDay.get(day)!;
    gross += amounts.gross;
    applied += amounts.applied;
    const remaining = gross - applied;
    if (![gross, applied, remaining].every(Number.isSafeInteger)) {
      throw new DomainV2ValidationError("Reserve history exceeds exact safe integer precision.");
    }
    if (newEvent.eventType === "RELEASE" && day >= newEvent.occurredAt.slice(0, 10) && remaining < 0) {
      throw new DomainV2ValidationError("RELEASE exceeds the reserve available on its effective day or a later day.");
    }
  }
}

/** Reserve on an existing ACTIVE allocation, or create a purpose container and its first RESERVE atomically. */
export async function reserveAllocationV2(
  repository: CashFlowRepositoryV2,
  command: ReserveAllocationV2Command,
): Promise<CashFlowWorkspaceV2> {
  const request = validatedRequest(command);
  return executeWorkspaceV2Command(repository, request, source => {
    let allocation: Allocation;
    if (request.newAllocation) {
      const { accountId, purpose, linkedPlanItemId } = request.newAllocation;
      const account = source.accounts.find(value => value.accountId === accountId);
      if (!account || !account.active || !purpose.trim()) {
        throw new DomainV2ValidationError("A new reserve needs an active account and purpose.");
      }
      if (linkedPlanItemId) {
        const plan = source.planItems.find(value => value.planItemId === linkedPlanItemId);
        if (!plan || plan.direction !== "EXPENSE" || plan.currentPlannedAmount.currencyCode !== account.currencyCode) {
          throw new DomainV2ValidationError("Linked reserve plan must be an expense in the account currency.");
        }
      }
      allocation = {
        allocationId: request.allocationId, accountId, purpose: purpose.trim(),
        currencyCode: account.currencyCode, state: "ACTIVE", createdAt: request.changedAt,
        updatedAt: request.changedAt,
        ...(linkedPlanItemId === undefined ? {} : { linkedPlanItemId }),
      };
    } else {
      allocation = activeAllocation(source, request.allocationId);
    }
    assertNativeAmount(allocation, request.amount);
    const event = eventFor(request, "RESERVE");
    assertSafeReserveTimeline(source, event);
    return {
      ...source,
      allocations: request.newAllocation
        ? [...source.allocations, allocation]
        : source.allocations.map(value => value.allocationId === request.allocationId ? { ...value, updatedAt: request.changedAt } : value),
      allocationEvents: [...source.allocationEvents, event],
    };
  });
}

/** Append a RELEASE without changing account position or creating an income movement. */
export async function releaseAllocationV2(
  repository: CashFlowRepositoryV2,
  command: ReleaseAllocationV2Command,
): Promise<CashFlowWorkspaceV2> {
  const request = validatedRequest(command);
  return executeWorkspaceV2Command(repository, request, source => {
    const allocation = activeAllocation(source, request.allocationId);
    assertNativeAmount(allocation, request.amount);
    // A backdated release must remain covered on its effective day and every later day.
    const event = eventFor(request, "RELEASE");
    assertSafeReserveTimeline(source, event);
    return {
      ...source,
      allocations: source.allocations.map(value => value.allocationId === request.allocationId ? { ...value, updatedAt: request.changedAt } : value),
      allocationEvents: [...source.allocationEvents, event],
    };
  });
}
