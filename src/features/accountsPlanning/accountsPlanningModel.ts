import type {
  AccountType,
  AllocationState,
  CurrencyCode,
  Money,
  PlanDirection,
  RecurrenceRule,
} from "../../domain/v2/cashFlowV2";

export interface AccountPresentationRow {
  accountId: string;
  name: string;
  accountType: AccountType;
  currencyCode: CurrencyCode;
  position: Money;
  allocated: Money;
  free: Money;
  active: boolean;
  recentMovementLabels?: string[];
  reconciliationLabels?: string[];
}

export interface AllocationPresentationRow {
  allocationId: string;
  purpose: string;
  accountLabel: string;
  currencyCode: CurrencyCode;
  reserved: Money;
  applied: Money;
  remaining: Money;
  state: AllocationState;
  linkedPlanLabel?: string;
  overAllocated?: boolean;
}

export interface ReportingEquivalentPresentation {
  value: Money | null;
  fxContext?: string;
  incomplete?: boolean;
}

export interface AccountsViewModel {
  accounts: AccountPresentationRow[];
  allocations: AllocationPresentationRow[];
  reportingEquivalent?: ReportingEquivalentPresentation;
}

export interface PlanTemplatePresentationRow {
  planTemplateId: string;
  name: string;
  direction: PlanDirection;
  plannedAmount: Money;
  recurrence: RecurrenceRule["kind"] | "NONE";
  timingLabel?: string;
  categoryGroupLabel?: string;
  active: boolean;
}

export interface IncomeSourcePresentationRow {
  incomeSourceId: string;
  name: string;
  unit?: string;
  unitPrice?: Money;
  defaultCurrency: CurrencyCode;
  active: boolean;
}

export interface WorkOccurrencePresentationRow {
  workOccurrenceId: string;
  date: string;
  sourceLabel: string;
  quantity: number;
  unit?: string;
  expectedValue?: Money;
  state: "PLANNED" | "COMPLETED";
  note?: string;
}

export interface PlanningViewModel {
  templates: PlanTemplatePresentationRow[];
  incomeSources: IncomeSourcePresentationRow[];
  workOccurrences: WorkOccurrencePresentationRow[];
}

export interface CurrencyPositionTotal {
  currencyCode: CurrencyCode;
  positionMinor: number;
  allocatedMinor: number;
  freeMinor: number;
}

export function accountTotalsByCurrency(
  rows: AccountPresentationRow[],
): CurrencyPositionTotal[] {
  const totals = new Map<CurrencyCode, CurrencyPositionTotal>();
  for (const row of rows) {
    if (
      row.position.currencyCode !== row.currencyCode ||
      row.allocated.currencyCode !== row.currencyCode ||
      row.free.currencyCode !== row.currencyCode
    ) {
      throw new Error(`Account ${row.accountId} mixes currencies.`);
    }
    const current = totals.get(row.currencyCode) ?? {
      currencyCode: row.currencyCode,
      positionMinor: 0,
      allocatedMinor: 0,
      freeMinor: 0,
    };
    current.positionMinor += row.position.amountMinor;
    current.allocatedMinor += row.allocated.amountMinor;
    current.freeMinor += row.free.amountMinor;
    totals.set(row.currencyCode, current);
  }
  return [...totals.values()].sort((a,b)=>a.currencyCode.localeCompare(b.currencyCode));
}

export function allocationRemaining(
  reserved: Money,
  applied: Money,
): Money {
  if (reserved.currencyCode !== applied.currencyCode) {
    throw new Error("Allocation reserved/applied currency mismatch.");
  }
  return {
    amountMinor: reserved.amountMinor - applied.amountMinor,
    currencyCode: reserved.currencyCode,
  };
}

export function recurrenceLabelKey(
  recurrence: RecurrenceRule["kind"] | "NONE",
): "none" | "oneTime" | "monthly" | "quarterly" | "weekly" | "multipleWithinMonth" {
  switch (recurrence) {
    case "NONE": return "none";
    case "ONE_TIME": return "oneTime";
    case "MONTHLY": return "monthly";
    case "QUARTERLY": return "quarterly";
    case "WEEKLY": return "weekly";
    case "MULTIPLE_WITHIN_MONTH": return "multipleWithinMonth";
  }
}

export function workExpectedValue(
  quantity: number,
  unitPrice: Money | undefined,
): Money | null {
  if (!unitPrice) return null;
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error("Work quantity must be non-negative.");
  }
  return {
    amountMinor: Math.round(quantity * unitPrice.amountMinor),
    currencyCode: unitPrice.currencyCode,
  };
}
