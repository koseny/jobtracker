import { isValidIsoDate } from "../domain/time";
import type {
  Allocation,
  AllocationEvent,
  CashFlowSourceStateV2,
  CashFlowWorkspaceV2,
  IncomeExpenseMovementRevisionPayload,
  Money,
  MoneyMovement,
} from "../domain/v2/cashFlowV2";
import type { CashFlowRepositoryV2 } from "../domain/v2/repositoryV2";
import { DomainV2ValidationError } from "../domain/v2/validationV2";
import { executeWorkspaceV2Command, type WorkspaceV2CommandContext } from "./executeWorkspaceV2Command";

export interface ApplyAllocationV2Command extends WorkspaceV2CommandContext {
  allocationId: string;
  allocationEventId: string;
  movementId: string;
  amount: Money;
  occurredAt: string;
  note?: string;
}

function validatedRequest(command: ApplyAllocationV2Command): ApplyAllocationV2Command {
  const request = structuredClone(command);
  if (!request.allocationId.trim() || !request.allocationEventId.trim() || !request.movementId.trim()) {
    throw new DomainV2ValidationError("Allocation, event and movement ids are required.");
  }
  if (!Number.isSafeInteger(request.amount.amountMinor) || request.amount.amountMinor <= 0) {
    throw new DomainV2ValidationError("APPLY amount must be a positive exact safe integer.");
  }
  const timestamp = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
  if (!timestamp.test(request.occurredAt) ||
      !isValidIsoDate(request.occurredAt.slice(0, 10)) ||
      !Number.isFinite(Date.parse(request.occurredAt))) {
    throw new DomainV2ValidationError("Allocation occurredAt must be a real ISO timestamp with a timezone.");
  }
  if (request.note !== undefined) {
    if (!request.note.trim()) throw new DomainV2ValidationError("Omit an empty allocation note.");
    request.note = request.note.trim();
  }
  return request;
}

function activeAllocation(source: CashFlowSourceStateV2, allocationId: string): Allocation {
  const allocation = source.allocations.find(value => value.allocationId === allocationId);
  if (!allocation || allocation.state !== "ACTIVE") {
    throw new DomainV2ValidationError("Allocation must exist and be ACTIVE.");
  }
  return allocation;
}

function activeExpense(
  source: CashFlowSourceStateV2,
  movementId: string,
): { movement: MoneyMovement; payload: IncomeExpenseMovementRevisionPayload } {
  const movement = source.moneyMovements.find(value => value.movementId === movementId);
  if (!movement || movement.lifecycleStatus !== "ACTIVE" || movement.movementType !== "EXPENSE") {
    throw new DomainV2ValidationError("Allocation APPLY requires an ACTIVE EXPENSE movement.");
  }
  const revision = source.moneyMovementRevisions.find(value =>
    value.movementId === movement.movementId && value.revisionNo === movement.currentRevisionNo,
  );
  if (!revision || revision.payload.movementType !== "EXPENSE") {
    throw new DomainV2ValidationError("Current EXPENSE revision must exist.");
  }
  return { movement, payload: revision.payload };
}

function assertCompatibility(
  source: CashFlowSourceStateV2,
  allocation: Allocation,
  payload: IncomeExpenseMovementRevisionPayload,
  request: ApplyAllocationV2Command,
): void {
  if (!payload.accountId || payload.accountId !== allocation.accountId) {
    throw new DomainV2ValidationError("Allocation APPLY requires the expense and allocation to use the same account.");
  }
  if (payload.amount.currencyCode !== allocation.currencyCode ||
      request.amount.currencyCode !== allocation.currencyCode) {
    throw new DomainV2ValidationError("Allocation APPLY must use the allocation and expense native currency.");
  }

  let appliedTotal = BigInt(request.amount.amountMinor);
  for (const event of source.allocationEvents.filter(value => value.movementId === request.movementId)) {
    if (event.eventType !== "APPLY") {
      throw new DomainV2ValidationError("Movement-linked non-APPLY allocation events need separate resolution.");
    }
    const linkedAllocation = source.allocations.find(value => value.allocationId === event.allocationId);
    if (!linkedAllocation ||
        linkedAllocation.accountId !== payload.accountId ||
        event.amount.currencyCode !== payload.amount.currencyCode ||
        !Number.isSafeInteger(event.amount.amountMinor)) {
      throw new DomainV2ValidationError("Existing APPLY is incompatible with the target expense.");
    }
    appliedTotal += BigInt(event.amount.amountMinor);
  }
  if (appliedTotal > BigInt(payload.amount.amountMinor)) {
    throw new DomainV2ValidationError("Aggregate APPLY exceeds the target expense amount.");
  }
}

function assertSafeApplyTimeline(
  source: CashFlowSourceStateV2,
  newEvent: AllocationEvent,
): void {
  const movementStatus = new Map(source.moneyMovements.map(value => [value.movementId, value.lifecycleStatus]));
  const byDay = new Map<string, { gross: number; applied: number }>();

  for (const event of [...source.allocationEvents, newEvent]) {
    if (event.allocationId !== newEvent.allocationId) continue;
    const day = event.occurredAt.slice(0, 10);
    const amounts = byDay.get(day) ?? { gross: 0, applied: 0 };
    switch (event.eventType) {
      case "RESERVE":
      case "ADJUST":
        amounts.gross += event.amount.amountMinor;
        break;
      case "RELEASE":
        amounts.gross -= event.amount.amountMinor;
        break;
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

  let gross = 0;
  let applied = 0;
  const effectiveDay = newEvent.occurredAt.slice(0, 10);
  for (const day of [...byDay.keys()].sort()) {
    const amounts = byDay.get(day)!;
    gross += amounts.gross;
    applied += amounts.applied;
    const remaining = gross - applied;
    if (![gross, applied, remaining].every(Number.isSafeInteger)) {
      throw new DomainV2ValidationError("Reserve history exceeds exact safe integer precision.");
    }
    if (day >= effectiveDay && remaining < 0) {
      throw new DomainV2ValidationError("APPLY exceeds reserve available on its effective day or a later day.");
    }
  }
}

function eventFor(request: ApplyAllocationV2Command): AllocationEvent {
  return {
    allocationEventId: request.allocationEventId,
    allocationId: request.allocationId,
    eventType: "APPLY",
    amount: { ...request.amount },
    occurredAt: request.occurredAt,
    movementId: request.movementId,
    ...(request.note === undefined ? {} : { note: request.note }),
  };
}

/**
 * Consume an ACTIVE allocation against an existing compatible ACTIVE EXPENSE.
 * This command appends only an AllocationEvent APPLY. It does not create,
 * revise, reconcile or duplicate the expense MoneyMovement.
 */
export async function applyAllocationV2(
  repository: CashFlowRepositoryV2,
  command: ApplyAllocationV2Command,
): Promise<CashFlowWorkspaceV2> {
  const request = validatedRequest(command);

  return executeWorkspaceV2Command(repository, request, source => {
    const allocation = activeAllocation(source, request.allocationId);
    const { payload } = activeExpense(source, request.movementId);
    assertCompatibility(source, allocation, payload, request);

    const event = eventFor(request);
    assertSafeApplyTimeline(source, event);

    return {
      ...source,
      allocations: source.allocations.map(value =>
        value.allocationId === allocation.allocationId
          ? { ...value, updatedAt: request.changedAt }
          : value,
      ),
      allocationEvents: [...source.allocationEvents, event],
    };
  });
}
