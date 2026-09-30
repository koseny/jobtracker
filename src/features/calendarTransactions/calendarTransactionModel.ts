import type { CurrencyCode, Money } from "../../domain/v2/cashFlowV2";

export type CalendarEntryKind =
  | "EVENT"
  | "NOTE"
  | "PLANNED"
  | "ACTUAL_INCOME"
  | "ACTUAL_EXPENSE"
  | "TRANSFER"
  | "WORK";

export interface CalendarEntryModel {
  id: string;
  kind: CalendarEntryKind;
  label: string;
  amount?: Money;
  recurring?: boolean;
  movementId?: string;
}

export interface CalendarDayModel {
  date: string;
  dayOfMonth: number;
  inSelectedMonth: boolean;
  isToday?: boolean;
  entries: CalendarEntryModel[];
}

export interface CalendarMonthViewModel {
  selectedMonth: string;
  days: CalendarDayModel[];
}

export interface SelectedDayViewModel {
  date: string;
  eventsAndNotes: CalendarEntryModel[];
  expectedAndPlanned: CalendarEntryModel[];
  actualMovements: CalendarEntryModel[];
}

export type CalendarQuickAddKind = "EVENT" | "INCOME" | "EXPENSE" | "NOTE";

export type TransactionType = "INCOME" | "EXPENSE" | "TRANSFER";
export type TransactionLifecycleStatus = "ACTIVE" | "VOIDED";

export interface TransactionLedgerRowModel {
  movementId: string;
  occurredOn: string;
  description: string;
  movementType: TransactionType;
  accountLabel: string;
  counterAccountLabel?: string;
  categoryLabel?: string;
  amount: Money;
  lifecycleStatus: TransactionLifecycleStatus;
  reconciliationStatus?: string;
}

export interface TransactionAuditEntryModel {
  revisionNo: number;
  changedAt: string;
  summary: string;
}

export interface TransactionDetailModel extends TransactionLedgerRowModel {
  currentRevisionNo: number;
  planMatchLabel?: string;
  linkedDailyEventLabel?: string;
  allocationRelationLabel?: string;
  dependencyWarning?: string;
  auditHistory: TransactionAuditEntryModel[];
}

export interface TransactionFilters {
  query: string;
  movementType: "ALL" | TransactionType;
  lifecycleStatus: "ALL" | TransactionLifecycleStatus;
  accountLabel: string;
  categoryLabel: string;
}

export const DEFAULT_TRANSACTION_FILTERS: TransactionFilters = {
  query: "",
  movementType: "ALL",
  lifecycleStatus: "ALL",
  accountLabel: "",
  categoryLabel: "",
};

export function visibleCalendarEntries(
  entries: CalendarEntryModel[],
  focusMode: boolean,
): { visible: CalendarEntryModel[]; overflowCount: number } {
  const limit = focusMode ? 6 : 3;
  return {
    visible: entries.slice(0, limit),
    overflowCount: Math.max(0, entries.length - limit),
  };
}

export function partitionSelectedDay(
  day: CalendarDayModel,
): SelectedDayViewModel {
  return {
    date: day.date,
    eventsAndNotes: day.entries.filter(entry =>
      entry.kind === "EVENT" || entry.kind === "NOTE",
    ),
    expectedAndPlanned: day.entries.filter(entry =>
      entry.kind === "PLANNED" || entry.kind === "WORK",
    ),
    actualMovements: day.entries.filter(entry =>
      entry.kind === "ACTUAL_INCOME" ||
      entry.kind === "ACTUAL_EXPENSE" ||
      entry.kind === "TRANSFER",
    ),
  };
}

export function validateCalendarMonthModel(model: CalendarMonthViewModel): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(model.selectedMonth)) {
    throw new Error("Calendar selectedMonth must use YYYY-MM.");
  }
  if (model.days.length !== 42) {
    throw new Error("Calendar month view requires exactly 42 day cells.");
  }

  const seen = new Set<string>();
  for (const day of model.days) {
    if (seen.has(day.date)) throw new Error(`Duplicate calendar day: ${day.date}.`);
    seen.add(day.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date)) {
      throw new Error(`Calendar day must use YYYY-MM-DD: ${day.date}.`);
    }
    if (!Number.isInteger(day.dayOfMonth) || day.dayOfMonth < 1 || day.dayOfMonth > 31) {
      throw new Error(`Invalid calendar dayOfMonth: ${day.dayOfMonth}.`);
    }
  }
}

export function newestFirst(
  rows: TransactionLedgerRowModel[],
): TransactionLedgerRowModel[] {
  return [...rows].sort((a, b) => {
    const dateCompare = b.occurredOn.localeCompare(a.occurredOn);
    if (dateCompare !== 0) return dateCompare;
    return b.movementId.localeCompare(a.movementId);
  });
}

export function filterTransactions(
  rows: TransactionLedgerRowModel[],
  filters: TransactionFilters,
): TransactionLedgerRowModel[] {
  const query = filters.query.trim().toLocaleLowerCase();
  const account = filters.accountLabel.trim().toLocaleLowerCase();
  const category = filters.categoryLabel.trim().toLocaleLowerCase();

  return newestFirst(rows).filter(row => {
    const queryMatch =
      !query ||
      row.description.toLocaleLowerCase().includes(query) ||
      row.movementId.toLocaleLowerCase().includes(query) ||
      row.accountLabel.toLocaleLowerCase().includes(query) ||
      (row.counterAccountLabel?.toLocaleLowerCase().includes(query) ?? false) ||
      (row.categoryLabel?.toLocaleLowerCase().includes(query) ?? false);

    const typeMatch =
      filters.movementType === "ALL" ||
      row.movementType === filters.movementType;

    const statusMatch =
      filters.lifecycleStatus === "ALL" ||
      row.lifecycleStatus === filters.lifecycleStatus;

    const accountMatch =
      !account ||
      row.accountLabel.toLocaleLowerCase().includes(account) ||
      (row.counterAccountLabel?.toLocaleLowerCase().includes(account) ?? false);

    const categoryMatch =
      !category ||
      (row.categoryLabel?.toLocaleLowerCase().includes(category) ?? false);

    return queryMatch && typeMatch && statusMatch && accountMatch && categoryMatch;
  });
}

export function assertTransactionDisplayCurrency(
  amount: Money,
  expectedCurrency: CurrencyCode,
): void {
  if (amount.currencyCode !== expectedCurrency) {
    throw new Error("Transaction amount currency does not match the expected display currency.");
  }
}
