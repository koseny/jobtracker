import type { CurrencyCode, Money } from "../../domain/v2/cashFlowV2";
import type { LanguageCode } from "../../domain/ownerPreferences";

export type OutlookMode = "COMPARISON" | "TRAJECTORY";
export type CompletionFilter = "ALL" | "OPEN" | "COMPLETED";

export interface KpiCardModel {
  id: "income" | "spending" | "monthlyResult" | "freeAvailable";
  label: string;
  value: Money | null;
  secondaryText?: string;
  helpText: string;
  incomplete?: boolean;
}

export interface RecentTransactionModel {
  movementId: string;
  occurredOn: string;
  description: string;
  movementType: "INCOME" | "EXPENSE" | "TRANSFER";
  amount: Money;
}

export interface ComparisonPoint {
  monthId: string;
  label: string;
  incomeMinor: number;
  spendingMinor: number;
  resultMinor: number;
}

export interface ComparisonSeries {
  currencyCode: CurrencyCode;
  points: ComparisonPoint[];
}

export interface TrajectoryPoint {
  date: string;
  label: string;
  actualMinor: number;
  forecastMinor?: number;
}

export interface TrajectorySeries {
  currencyCode: CurrencyCode;
  points: TrajectoryPoint[];
}

export interface UpcomingItemModel {
  id: string;
  date: string;
  label: string;
  kind: "EVENT" | "PLANNED" | "WORK";
}

export interface PositionSummaryRow {
  id: string;
  label: string;
  position: Money;
  allocated: Money;
  free: Money;
}

export interface ReportingEquivalentModel {
  value: Money | null;
  fxContext?: string;
  incomplete?: boolean;
}

export interface OverviewViewModel {
  selectedMonth: string;
  kpis: KpiCardModel[];
  comparison: ComparisonSeries;
  trajectory: TrajectorySeries;
  recentTransactions: RecentTransactionModel[];
  upcoming: UpcomingItemModel[];
  positions: PositionSummaryRow[];
  reportingEquivalent?: ReportingEquivalentModel;
}

export interface MonthItemRowModel {
  id: string;
  name: string;
  planned: Money;
  actual?: Money;
  completionStatus: "OPEN" | "COMPLETED";
  helpText?: string;
}

export interface MonthGroupModel {
  id: string;
  name: string;
  rows: MonthItemRowModel[];
}

export interface MonthPositionAccountModel {
  accountId: string;
  name: string;
  position: Money;
  allocated: Money;
  free: Money;
}

export interface MonthViewModel {
  selectedMonth: string;
  incomeGroups: MonthGroupModel[];
  spendingGroups: MonthGroupModel[];
  accounts: MonthPositionAccountModel[];
  reportingEquivalent?: ReportingEquivalentModel;
}

export interface CurrencyTotals {
  currencyCode: CurrencyCode;
  plannedMinor: number;
  actualMinor: number;
}

export function languageLocale(language: LanguageCode): string {
  switch (language) {
    case "HU": return "hu-HU";
    case "DE": return "de-DE";
    case "EN": return "en-GB";
  }
}

export function minorToMajor(money: Money): number {
  return money.currencyCode === "EUR"
    ? money.amountMinor / 100
    : money.amountMinor;
}

export function formatMoney(money: Money, language: LanguageCode): string {
  const digits = money.currencyCode === "EUR" ? 2 : 0;
  return new Intl.NumberFormat(languageLocale(language), {
    style: "currency",
    currency: money.currencyCode,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minorToMajor(money));
}

export function signedMoneyDifference(
  actual: Money | undefined,
  planned: Money,
): Money | null {
  if (!actual) {
    return { amountMinor: -planned.amountMinor, currencyCode: planned.currencyCode };
  }
  if (actual.currencyCode !== planned.currencyCode) return null;
  return {
    amountMinor: actual.amountMinor - planned.amountMinor,
    currencyCode: planned.currencyCode,
  };
}

export function totalsByCurrency(groups: MonthGroupModel[]): CurrencyTotals[] {
  const totals = new Map<CurrencyCode, CurrencyTotals>();

  for (const group of groups) {
    for (const row of group.rows) {
      const current = totals.get(row.planned.currencyCode) ?? {
        currencyCode: row.planned.currencyCode,
        plannedMinor: 0,
        actualMinor: 0,
      };
      current.plannedMinor += row.planned.amountMinor;

      if (row.actual) {
        if (row.actual.currencyCode !== row.planned.currencyCode) {
          throw new Error(
            `Month row ${row.id} mixes planned and actual currencies.`,
          );
        }
        current.actualMinor += row.actual.amountMinor;
      }
      totals.set(current.currencyCode, current);
    }
  }

  return [...totals.values()].sort((a, b) =>
    a.currencyCode.localeCompare(b.currencyCode),
  );
}

export function filterMonthGroups(
  groups: MonthGroupModel[],
  query: string,
  completionFilter: CompletionFilter,
): MonthGroupModel[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return groups
    .map(group => ({
      ...group,
      rows: group.rows.filter(row => {
        const queryMatch =
          !normalizedQuery ||
          row.name.toLocaleLowerCase().includes(normalizedQuery) ||
          group.name.toLocaleLowerCase().includes(normalizedQuery);
        const statusMatch =
          completionFilter === "ALL" ||
          row.completionStatus === completionFilter;
        return queryMatch && statusMatch;
      }),
    }))
    .filter(group => group.rows.length > 0);
}

export function chartExtent(values: number[]): number {
  return Math.max(1, ...values.map(value => Math.abs(value)));
}
