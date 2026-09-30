import type { LanguageCode } from "../../domain/ownerPreferences";
import type {
  Account,
  CashFlowWorkspaceV2,
  CurrencyCode,
  FxRateQuote,
  Money,
  MoneyMovement,
  MoneyMovementRevision,
  PlanItem,
  RecurrenceRule,
} from "../../domain/v2/cashFlowV2";
import { validateWorkspaceV2 } from "../../domain/v2/validationV2";
import { workExpectedValue } from "../accountsPlanning/accountsPlanningModel";
import type {
  CalendarDayModel,
  CalendarEntryModel,
  TransactionDetailModel,
  TransactionLedgerRowModel,
} from "../calendarTransactions/calendarTransactionModel";
import { presentationText } from "../presentation/presentationText";
import type {
  ComparisonPoint,
  MonthGroupModel,
  PositionSummaryRow,
  TrajectoryPoint,
} from "../presentation/presentationModel";
import type { HcfOperationalViewModels } from "./operationalViewModels";

export class ReadModelProjectionError extends Error {}

type CurrentMovement = {
  movement: MoneyMovement;
  revision: MoneyMovementRevision;
};

type ConsolidatedMoney = {
  value: Money | null;
  incomplete: boolean;
  fxContext?: string;
};

type AllocationAmounts = {
  grossReserved: Money;
  applied: Money;
  remaining: Money;
};

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthParts(monthId: string): [number, number] {
  if (!MONTH_PATTERN.test(monthId)) {
    throw new ReadModelProjectionError("selectedMonth must use YYYY-MM.");
  }
  const [year, month] = monthId.split("-").map(Number);
  return [year, month];
}

function monthEndDate(monthId: string): string {
  const [year, month] = monthParts(monthId);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function shiftMonth(monthId: string, delta: number): string {
  const [year, month] = monthParts(monthId);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function dateOnly(value: string): string {
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ReadModelProjectionError(`Expected ISO date/date-time, received: ${value}.`);
  }
  return date;
}

function addMoney(total: number, money: Money): number {
  if (!Number.isInteger(money.amountMinor)) {
    throw new ReadModelProjectionError("Projected Money must use integer minor units.");
  }
  return total + money.amountMinor;
}

function roundHalfUpRatio(value: number, numerator: number, denominator: number): number {
  if (!Number.isInteger(value) || !Number.isInteger(numerator) || !Number.isInteger(denominator) || denominator <= 0) {
    throw new ReadModelProjectionError("FX conversion requires integer value/numerator and positive integer denominator.");
  }
  const negative = value < 0;
  const product = BigInt(Math.abs(value)) * BigInt(numerator);
  const divisor = BigInt(denominator);
  let quotient = product / divisor;
  const remainder = product % divisor;
  if (remainder * 2n >= divisor) quotient += 1n;
  const signed = negative ? -quotient : quotient;
  const result = Number(signed);
  if (!Number.isSafeInteger(result)) {
    throw new ReadModelProjectionError("FX conversion exceeds safe integer range.");
  }
  return result;
}

function applicableQuote(
  source: CurrencyCode,
  target: CurrencyCode,
  monthId: string,
  quotes: FxRateQuote[],
): { quote: FxRateQuote; reverse: boolean } | null {
  if (source === target) return null;

  const candidates = quotes
    .filter(quote => quote.effectiveMonth === monthId)
    .flatMap(quote => {
      if (quote.baseCurrencyCode === source && quote.quoteCurrencyCode === target) {
        return [{ quote, reverse: false }];
      }
      if (quote.baseCurrencyCode === target && quote.quoteCurrencyCode === source) {
        return [{ quote, reverse: true }];
      }
      return [];
    });

  if (candidates.length > 1) {
    throw new ReadModelProjectionError(
      `Multiple applicable FX quotes exist for ${source}/${target} in ${monthId}.`,
    );
  }
  return candidates[0] ?? null;
}

export function convertMoneyForReporting(
  money: Money,
  target: CurrencyCode,
  monthId: string,
  quotes: FxRateQuote[],
): { value: Money | null; quoteLabel?: string } {
  if (money.currencyCode === target) return { value: money };

  const applicable = applicableQuote(money.currencyCode, target, monthId, quotes);
  if (!applicable) return { value: null };

  const { quote, reverse } = applicable;
  const amountMinor = reverse
    ? roundHalfUpRatio(money.amountMinor, quote.denominator, quote.numerator)
    : roundHalfUpRatio(money.amountMinor, quote.numerator, quote.denominator);

  return {
    value: { amountMinor, currencyCode: target },
    quoteLabel: quote.sourceLabel || quote.fxRateQuoteId,
  };
}

function consolidate(
  monies: Money[],
  target: CurrencyCode,
  monthId: string,
  quotes: FxRateQuote[],
): ConsolidatedMoney {
  let total = 0;
  let incomplete = false;
  const labels = new Set<string>();

  for (const money of monies) {
    const converted = convertMoneyForReporting(money, target, monthId, quotes);
    if (!converted.value) {
      incomplete = true;
      continue;
    }
    total = addMoney(total, converted.value);
    if (converted.quoteLabel) labels.add(converted.quoteLabel);
  }

  return {
    value: incomplete ? null : { amountMinor: total, currencyCode: target },
    incomplete,
    fxContext: labels.size > 0 ? `FX: ${[...labels].join(", ")}` : undefined,
  };
}

function currentMovements(workspace: CashFlowWorkspaceV2): CurrentMovement[] {
  const revisions = new Map<string, Map<number, MoneyMovementRevision>>();
  for (const revision of workspace.sourceState.moneyMovementRevisions) {
    const byNo = revisions.get(revision.movementId) ?? new Map<number, MoneyMovementRevision>();
    byNo.set(revision.revisionNo, revision);
    revisions.set(revision.movementId, byNo);
  }

  return workspace.sourceState.moneyMovements.map(movement => {
    const revision = revisions.get(movement.movementId)?.get(movement.currentRevisionNo);
    if (!revision) {
      throw new ReadModelProjectionError(
        `Current revision missing for movement ${movement.movementId}.`,
      );
    }
    return { movement, revision };
  });
}

function movementDate(row: CurrentMovement): string {
  return row.revision.payload.occurredOn;
}

function accountEffect(row: CurrentMovement, account: Account): number {
  if (row.movement.lifecycleStatus !== "ACTIVE") return 0;
  const payload = row.revision.payload;

  if (payload.movementType === "INCOME") {
    return payload.accountId === account.accountId ? payload.amount.amountMinor : 0;
  }
  if (payload.movementType === "EXPENSE") {
    return payload.accountId === account.accountId ? -payload.amount.amountMinor : 0;
  }

  if (payload.movementType === "TRANSFER") {
    if (payload.sourceAccountId === account.accountId) return -payload.sourceAmount.amountMinor;
    if (payload.destinationAccountId === account.accountId) return payload.destinationAmount.amountMinor;
  }
  return 0;
}

function accountPositionAt(
  workspace: CashFlowWorkspaceV2,
  current: CurrentMovement[],
  account: Account,
  throughDate: string,
): Money {
  const applicableAnchors = workspace.sourceState.accountBalanceAnchors
    .filter(anchor => anchor.accountId === account.accountId && dateOnly(anchor.effectiveAt) <= throughDate)
    .sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt));

  if (
    applicableAnchors.length > 1 &&
    applicableAnchors[0].effectiveAt === applicableAnchors[1].effectiveAt
  ) {
    throw new ReadModelProjectionError(
      `Account ${account.accountId} has multiple balance anchors at the same effective time.`,
    );
  }

  const anchor = applicableAnchors[0];
  const anchorDate = anchor ? dateOnly(anchor.effectiveAt) : null;

  if (
    anchorDate &&
    current.some(row =>
      row.movement.lifecycleStatus === "ACTIVE" &&
      movementDate(row) === anchorDate &&
      accountEffect(row, account) !== 0
    )
  ) {
    throw new ReadModelProjectionError(
      `Account ${account.accountId} has a movement on the same calendar date as its latest applicable balance anchor; date-only movement ordering is ambiguous.`,
    );
  }

  let amountMinor = anchor?.balance.amountMinor ?? 0;
  for (const row of current) {
    const occurredOn = movementDate(row);
    if (occurredOn > throughDate) continue;
    if (anchorDate && occurredOn <= anchorDate) continue;
    amountMinor += accountEffect(row, account);
  }

  return { amountMinor, currencyCode: account.currencyCode };
}

function allocationAmountsAt(
  workspace: CashFlowWorkspaceV2,
  allocationId: string,
  currencyCode: CurrencyCode,
  throughDate: string,
): AllocationAmounts {
  let grossReserved = 0;
  let applied = 0;

  for (const event of workspace.sourceState.allocationEvents) {
    if (event.allocationId !== allocationId || dateOnly(event.occurredAt) > throughDate) continue;
    switch (event.eventType) {
      case "RESERVE":
        grossReserved += event.amount.amountMinor;
        break;
      case "RELEASE":
        grossReserved -= event.amount.amountMinor;
        break;
      case "ADJUST":
        grossReserved += event.amount.amountMinor;
        break;
      case "APPLY":
        applied += event.amount.amountMinor;
        break;
    }
  }

  return {
    grossReserved: { amountMinor: grossReserved, currencyCode },
    applied: { amountMinor: applied, currencyCode },
    remaining: { amountMinor: grossReserved - applied, currencyCode },
  };
}

function activeReservedByAccount(
  workspace: CashFlowWorkspaceV2,
  throughDate: string,
): Map<string, Money> {
  const result = new Map<string, Money>();
  for (const allocation of workspace.sourceState.allocations) {
    if (allocation.state !== "ACTIVE") continue;
    const amounts = allocationAmountsAt(
      workspace,
      allocation.allocationId,
      allocation.currencyCode,
      throughDate,
    );
    const current = result.get(allocation.accountId)?.amountMinor ?? 0;
    result.set(allocation.accountId, {
      amountMinor: current + amounts.remaining.amountMinor,
      currencyCode: allocation.currencyCode,
    });
  }
  return result;
}

function realizationAmount(
  workspace: CashFlowWorkspaceV2,
  currentById: Map<string, CurrentMovement>,
  plan: PlanItem,
  throughDate?: string,
): Money {
  let amountMinor = 0;
  for (const realization of workspace.sourceState.planRealizations) {
    if (realization.planItemId !== plan.planItemId) continue;
    const current = currentById.get(realization.movementId);
    if (!current || current.movement.lifecycleStatus !== "ACTIVE") continue;
    if (throughDate && movementDate(current) > throughDate) continue;
    if (realization.realizedAmount.currencyCode !== plan.currentPlannedAmount.currencyCode) {
      throw new ReadModelProjectionError(
        `PlanRealization currency differs from plan currency for ${plan.planItemId}.`,
      );
    }
    amountMinor += realization.realizedAmount.amountMinor;
  }
  return { amountMinor, currencyCode: plan.currentPlannedAmount.currencyCode };
}

function monthActualFlows(
  current: CurrentMovement[],
  monthId: string,
): { income: Money[]; expense: Money[] } {
  const income: Money[] = [];
  const expense: Money[] = [];
  for (const row of current) {
    if (row.movement.lifecycleStatus !== "ACTIVE" || !movementDate(row).startsWith(monthId)) continue;
    const payload = row.revision.payload;
    if (payload.movementType === "INCOME") income.push(payload.amount);
    if (payload.movementType === "EXPENSE") expense.push(payload.amount);
  }
  return { income, expense };
}

function groupingLabel(
  workspace: CashFlowWorkspaceV2,
  plan: PlanItem,
  language: LanguageCode,
): string {
  if (plan.groupId) {
    const group = workspace.sourceState.groups.find(item => item.groupId === plan.groupId);
    if (group) return group.name;
  }
  if (plan.categoryId) {
    const category = workspace.sourceState.categories.find(item => item.categoryId === plan.categoryId);
    if (category) return category.name;
  }
  return language === "HU" ? "Nincs csoport" : language === "DE" ? "Ohne Gruppe" : "Ungrouped";
}

function buildMonthGroups(
  workspace: CashFlowWorkspaceV2,
  currentById: Map<string, CurrentMovement>,
  monthId: string,
  direction: "INCOME" | "EXPENSE",
  language: LanguageCode,
): MonthGroupModel[] {
  const groups = new Map<string, MonthGroupModel>();

  for (const plan of workspace.sourceState.planItems) {
    if (
      plan.monthId !== monthId ||
      plan.direction !== direction ||
      plan.planStatus !== "ACTIVE"
    ) continue;

    const label = groupingLabel(workspace, plan, language);
    const groupId = plan.groupId || plan.categoryId || `ungrouped-${direction}`;
    const group = groups.get(groupId) ?? { id: groupId, name: label, rows: [] };
    const realized = realizationAmount(workspace, currentById, plan);

    group.rows.push({
      id: plan.planItemId,
      name: plan.name,
      planned: plan.currentPlannedAmount,
      actual: realized.amountMinor > 0 ? realized : undefined,
      completionStatus: plan.completionStatus,
    });
    groups.set(groupId, group);
  }

  return [...groups.values()];
}

function transactionRowsAndDetails(
  workspace: CashFlowWorkspaceV2,
  current: CurrentMovement[],
): {
  rows: TransactionLedgerRowModel[];
  details: Record<string, TransactionDetailModel>;
} {
  const accounts = new Map(workspace.sourceState.accounts.map(x => [x.accountId, x]));
  const categories = new Map(workspace.sourceState.categories.map(x => [x.categoryId, x]));
  const plans = new Map(workspace.sourceState.planItems.map(x => [x.planItemId, x]));
  const rows: TransactionLedgerRowModel[] = [];
  const details: Record<string, TransactionDetailModel> = {};

  for (const row of current) {
    const payload = row.revision.payload;
    const realizations = workspace.sourceState.planRealizations.filter(x => x.movementId === row.movement.movementId);
    const linkedPlans = realizations.map(x => plans.get(x.planItemId)?.name).filter((x): x is string => Boolean(x));
    const dailyLabels = workspace.sourceState.dailyEvents
      .filter(event => event.movementIds.includes(row.movement.movementId))
      .map(event => event.title);
    const allocationLabels = workspace.sourceState.allocationEvents
      .filter(event => event.movementId === row.movement.movementId)
      .map(event => workspace.sourceState.allocations.find(x => x.allocationId === event.allocationId)?.purpose)
      .filter((x): x is string => Boolean(x));

    let ledger: TransactionLedgerRowModel;
    if (payload.movementType === "TRANSFER") {
      ledger = {
        movementId: row.movement.movementId,
        occurredOn: payload.occurredOn,
        description: payload.description,
        movementType: "TRANSFER",
        accountLabel: accounts.get(payload.sourceAccountId)?.name || payload.sourceAccountId,
        counterAccountLabel: accounts.get(payload.destinationAccountId)?.name || payload.destinationAccountId,
        amount: payload.sourceAmount,
        counterAmount: payload.destinationAmount,
        lifecycleStatus: row.movement.lifecycleStatus,
      };
    } else {
      const totalRealized = realizations
        .filter(realization => realization.realizedAmount.currencyCode === payload.amount.currencyCode)
        .reduce((sum, realization) => sum + realization.realizedAmount.amountMinor, 0);
      if (totalRealized > payload.amount.amountMinor) {
        throw new ReadModelProjectionError(
          `Plan realizations exceed movement amount for ${row.movement.movementId}.`,
        );
      }
      ledger = {
        movementId: row.movement.movementId,
        occurredOn: payload.occurredOn,
        description: payload.description,
        movementType: payload.movementType,
        accountLabel: payload.accountId
          ? accounts.get(payload.accountId)?.name || payload.accountId
          : "—",
        categoryLabel: payload.categoryId
          ? categories.get(payload.categoryId)?.name || payload.categoryId
          : undefined,
        amount: payload.amount,
        lifecycleStatus: row.movement.lifecycleStatus,
        reconciliationStatus:
          totalRealized === 0
            ? "Unmatched"
            : totalRealized === payload.amount.amountMinor
              ? "Matched"
              : "Partial",
      };
    }

    rows.push(ledger);

    const revisions = workspace.sourceState.moneyMovementRevisions
      .filter(revision => revision.movementId === row.movement.movementId)
      .sort((a, b) => a.revisionNo - b.revisionNo);

    details[row.movement.movementId] = {
      ...ledger,
      currentRevisionNo: row.movement.currentRevisionNo,
      planMatchLabel: linkedPlans.length ? linkedPlans.join(", ") : undefined,
      linkedDailyEventLabel: dailyLabels.length ? dailyLabels.join(", ") : undefined,
      allocationRelationLabel: allocationLabels.length ? allocationLabels.join(", ") : undefined,
      auditHistory: revisions.map(revision => ({
        revisionNo: revision.revisionNo,
        changedAt: revision.changedAt,
        summary: revision.revisionNo === 1 ? "Created" : "Revised",
      })),
    };
  }

  return { rows, details };
}

function recurrenceForTemplate(
  workspace: CashFlowWorkspaceV2,
  recurrenceRuleId: string | undefined,
): RecurrenceRule | null {
  if (!recurrenceRuleId) return null;
  return workspace.sourceState.recurrenceRules.find(x => x.recurrenceRuleId === recurrenceRuleId) ?? null;
}

function timingLabel(rule: RecurrenceRule | null, earliestAllowedDay?: number): string | undefined {
  const parts: string[] = [];
  if (rule?.kind === "ONE_TIME") parts.push(rule.date);
  if (rule?.kind === "MONTHLY" && rule.preferredDay) parts.push(`day ${rule.preferredDay}`);
  if (rule?.kind === "QUARTERLY") {
    parts.push(rule.anchorMonth);
    if (rule.preferredDay) parts.push(`day ${rule.preferredDay}`);
  }
  if (earliestAllowedDay) parts.push(`earliest day ${earliestAllowedDay}`);
  return parts.length ? parts.join(" · ") : undefined;
}

function calendarDays(
  workspace: CashFlowWorkspaceV2,
  current: CurrentMovement[],
  monthId: string,
): CalendarDayModel[] {
  const [year, month] = monthParts(monthId);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - mondayOffset);

  const entriesByDate = new Map<string, CalendarEntryModel[]>();
  const add = (date: string, entry: CalendarEntryModel) => {
    const entries = entriesByDate.get(date) ?? [];
    entries.push(entry);
    entriesByDate.set(date, entries);
  };

  for (const event of workspace.sourceState.dailyEvents) {
    add(event.date, { id: event.dailyEventId, kind: "EVENT", label: event.title });
    if (event.note) {
      add(event.date, { id: `${event.dailyEventId}:note`, kind: "NOTE", label: event.note });
    }
  }

  for (const plan of workspace.sourceState.planItems) {
    if (plan.planStatus !== "ACTIVE" || !plan.expectedDate) continue;
    const template = plan.planTemplateId
      ? workspace.sourceState.planTemplates.find(x => x.planTemplateId === plan.planTemplateId)
      : undefined;
    const recurrenceRuleId = plan.recurrenceRuleId ?? template?.recurrenceRuleId;
    const rule = recurrenceRuleId
      ? workspace.sourceState.recurrenceRules.find(x => x.recurrenceRuleId === recurrenceRuleId)
      : null;
    add(plan.expectedDate, {
      id: plan.planItemId,
      kind: "PLANNED",
      label: plan.name,
      amount: plan.currentPlannedAmount,
      recurring: Boolean(rule && rule.kind !== "ONE_TIME"),
    });
  }

  const sources = new Map(workspace.sourceState.incomeSources.map(x => [x.incomeSourceId, x]));
  for (const occurrence of workspace.sourceState.workOccurrences) {
    const source = sources.get(occurrence.incomeSourceId);
    add(occurrence.date, {
      id: occurrence.workOccurrenceId,
      kind: "WORK",
      label: source?.name || occurrence.incomeSourceId,
      amount: source?.unitPrice ? workExpectedValue(occurrence.quantity, source.unitPrice) ?? undefined : undefined,
      recurring: true,
    });
  }

  for (const row of current) {
    if (row.movement.lifecycleStatus !== "ACTIVE") continue;
    const payload = row.revision.payload;
    if (payload.movementType === "TRANSFER") {
      add(payload.occurredOn, {
        id: row.movement.movementId,
        kind: "TRANSFER",
        label: payload.description,
        amount: payload.sourceAmount,
        movementId: row.movement.movementId,
      });
    } else {
      add(payload.occurredOn, {
        id: row.movement.movementId,
        kind: payload.movementType === "INCOME" ? "ACTUAL_INCOME" : "ACTUAL_EXPENSE",
        label: payload.description,
        amount: payload.amount,
        movementId: row.movement.movementId,
      });
    }
  }

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const iso = date.toISOString().slice(0, 10);
    return {
      date: iso,
      dayOfMonth: date.getUTCDate(),
      inSelectedMonth: date.getUTCMonth() === month - 1,
      entries: entriesByDate.get(iso) ?? [],
    };
  });
}

function actualFlowConsolidated(
  workspace: CashFlowWorkspaceV2,
  current: CurrentMovement[],
  monthId: string,
): { income: ConsolidatedMoney; expense: ConsolidatedMoney } {
  const flows = monthActualFlows(current, monthId);
  return {
    income: consolidate(flows.income, workspace.reportingCurrencyCode, monthId, workspace.sourceState.fxRateQuotes),
    expense: consolidate(flows.expense, workspace.reportingCurrencyCode, monthId, workspace.sourceState.fxRateQuotes),
  };
}

function remainingPlanMoney(
  workspace: CashFlowWorkspaceV2,
  currentById: Map<string, CurrentMovement>,
  monthId: string,
  throughDate: string,
  direction: "INCOME" | "EXPENSE",
): Money[] {
  return workspace.sourceState.planItems
    .filter(plan =>
      plan.monthId === monthId &&
      plan.direction === direction &&
      plan.planStatus === "ACTIVE" &&
      plan.completionStatus === "OPEN"
    )
    .map(plan => {
      const realized = realizationAmount(workspace, currentById, plan, throughDate);
      return {
        amountMinor: Math.max(0, plan.currentPlannedAmount.amountMinor - realized.amountMinor),
        currencyCode: plan.currentPlannedAmount.currencyCode,
      };
    });
}

function accountPositions(
  workspace: CashFlowWorkspaceV2,
  current: CurrentMovement[],
  throughDate: string,
): PositionSummaryRow[] {
  const reserved = activeReservedByAccount(workspace, throughDate);
  return workspace.sourceState.accounts.map(account => {
    const position = accountPositionAt(workspace, current, account, throughDate);
    const allocated = reserved.get(account.accountId) ?? {
      amountMinor: 0,
      currencyCode: account.currencyCode,
    };
    return {
      id: account.accountId,
      label: account.name,
      position,
      allocated,
      free: {
        amountMinor: position.amountMinor - allocated.amountMinor,
        currencyCode: account.currencyCode,
      },
    };
  });
}

function consolidatedPositions(
  positions: PositionSummaryRow[],
  workspace: CashFlowWorkspaceV2,
  monthId: string,
): ConsolidatedMoney {
  return consolidate(
    positions.map(row => row.position),
    workspace.reportingCurrencyCode,
    monthId,
    workspace.sourceState.fxRateQuotes,
  );
}

function consolidatedFree(
  positions: PositionSummaryRow[],
  workspace: CashFlowWorkspaceV2,
  monthId: string,
): ConsolidatedMoney {
  return consolidate(
    positions.map(row => row.free),
    workspace.reportingCurrencyCode,
    monthId,
    workspace.sourceState.fxRateQuotes,
  );
}

function comparisonPoints(
  workspace: CashFlowWorkspaceV2,
  current: CurrentMovement[],
  selectedMonth: string,
): { points: ComparisonPoint[]; incomplete: boolean } {
  const points: ComparisonPoint[] = [];
  let incomplete = false;

  for (const delta of [-2, -1, 0]) {
    const monthId = shiftMonth(selectedMonth, delta);
    const flows = actualFlowConsolidated(workspace, current, monthId);
    if (!flows.income.value || !flows.expense.value) {
      incomplete = true;
      continue;
    }
    points.push({
      monthId,
      label: monthId,
      incomeMinor: flows.income.value.amountMinor,
      spendingMinor: flows.expense.value.amountMinor,
      resultMinor: flows.income.value.amountMinor - flows.expense.value.amountMinor,
    });
  }

  return { points, incomplete };
}

function trajectoryPoints(
  workspace: CashFlowWorkspaceV2,
  current: CurrentMovement[],
  currentById: Map<string, CurrentMovement>,
  selectedMonth: string,
): { points: TrajectoryPoint[]; incomplete: boolean } {
  const dates = new Set<string>([monthEndDate(selectedMonth), `${selectedMonth}-01`]);
  for (const row of current) {
    if (row.movement.lifecycleStatus === "ACTIVE" && movementDate(row).startsWith(selectedMonth)) {
      dates.add(movementDate(row));
    }
  }

  const points: TrajectoryPoint[] = [];
  let incomplete = false;

  for (const date of [...dates].sort()) {
    const positions = accountPositions(workspace, current, date);
    const actual = consolidatedPositions(positions, workspace, selectedMonth);
    const remainingIncome = consolidate(
      remainingPlanMoney(workspace, currentById, selectedMonth, date, "INCOME"),
      workspace.reportingCurrencyCode,
      selectedMonth,
      workspace.sourceState.fxRateQuotes,
    );
    const remainingExpense = consolidate(
      remainingPlanMoney(workspace, currentById, selectedMonth, date, "EXPENSE"),
      workspace.reportingCurrencyCode,
      selectedMonth,
      workspace.sourceState.fxRateQuotes,
    );

    if (!actual.value || !remainingIncome.value || !remainingExpense.value) {
      incomplete = true;
      continue;
    }

    points.push({
      date,
      label: String(Number(date.slice(8, 10))),
      actualMinor: actual.value.amountMinor,
      forecastMinor:
        actual.value.amountMinor +
        remainingIncome.value.amountMinor -
        remainingExpense.value.amountMinor,
    });
  }

  return { points, incomplete };
}

export function projectWorkspaceV2ToOperationalViewModels(
  workspace: CashFlowWorkspaceV2,
  selectedMonth: string,
  language: LanguageCode,
): HcfOperationalViewModels {
  validateWorkspaceV2(workspace);
  monthParts(selectedMonth);

  const current = currentMovements(workspace);
  const currentById = new Map(current.map(row => [row.movement.movementId, row]));
  const endDate = monthEndDate(selectedMonth);
  const positions = accountPositions(workspace, current, endDate);
  const freeEquivalent = consolidatedFree(positions, workspace, selectedMonth);
  const positionEquivalent = consolidatedPositions(positions, workspace, selectedMonth);
  const selectedFlows = actualFlowConsolidated(workspace, current, selectedMonth);
  const comparison = comparisonPoints(workspace, current, selectedMonth);
  const trajectory = trajectoryPoints(workspace, current, currentById, selectedMonth);
  const tx = transactionRowsAndDetails(workspace, current);

  const incomeValue = selectedFlows.income.value;
  const expenseValue = selectedFlows.expense.value;
  const resultValue =
    incomeValue && expenseValue
      ? {
          amountMinor: incomeValue.amountMinor - expenseValue.amountMinor,
          currencyCode: workspace.reportingCurrencyCode,
        }
      : null;

  const categories = new Map(workspace.sourceState.categories.map(x => [x.categoryId, x]));
  const groups = new Map(workspace.sourceState.groups.map(x => [x.groupId, x]));
  const rules = new Map(workspace.sourceState.recurrenceRules.map(x => [x.recurrenceRuleId, x]));
  const sources = new Map(workspace.sourceState.incomeSources.map(x => [x.incomeSourceId, x]));

  const allocationRows = workspace.sourceState.allocations.map(allocation => {
    const amounts = allocationAmountsAt(workspace, allocation.allocationId, allocation.currencyCode, endDate);
    const account = workspace.sourceState.accounts.find(x => x.accountId === allocation.accountId);
    const accountPosition = positions.find(x => x.id === allocation.accountId);
    const linkedPlan = allocation.linkedPlanItemId
      ? workspace.sourceState.planItems.find(x => x.planItemId === allocation.linkedPlanItemId)
      : undefined;

    return {
      allocationId: allocation.allocationId,
      purpose: allocation.purpose,
      accountLabel: account?.name || allocation.accountId,
      currencyCode: allocation.currencyCode,
      reserved: amounts.grossReserved,
      applied: amounts.applied,
      remaining: amounts.remaining,
      state: allocation.state,
      linkedPlanLabel: linkedPlan?.name,
      overAllocated: Boolean(
        allocation.state === "ACTIVE" &&
        accountPosition &&
        accountPosition.free.amountMinor < 0
      ),
    };
  });

  const planning = {
    templates: workspace.sourceState.planTemplates.map(template => {
      const rule = recurrenceForTemplate(workspace, template.recurrenceRuleId);
      const category = template.categoryId ? categories.get(template.categoryId)?.name : undefined;
      const group = template.groupId ? groups.get(template.groupId)?.name : undefined;
      return {
        planTemplateId: template.planTemplateId,
        name: template.name,
        direction: template.direction,
        plannedAmount: template.defaultPlannedAmount,
        recurrence: rule?.kind ?? "NONE" as const,
        timingLabel: timingLabel(rule, template.earliestAllowedDay),
        categoryGroupLabel: [category, group].filter(Boolean).join(" / ") || undefined,
        active: template.active,
      };
    }),
    incomeSources: workspace.sourceState.incomeSources.map(source => ({
      incomeSourceId: source.incomeSourceId,
      name: source.name,
      unit: source.unit,
      unitPrice: source.unitPrice,
      defaultCurrency: source.defaultCurrency,
      active: source.active,
    })),
    workOccurrences: workspace.sourceState.workOccurrences.map(occurrence => {
      const source = sources.get(occurrence.incomeSourceId);
      return {
        workOccurrenceId: occurrence.workOccurrenceId,
        date: occurrence.date,
        sourceLabel: source?.name || occurrence.incomeSourceId,
        quantity: occurrence.quantity,
        unit: source?.unit,
        expectedValue: source?.unitPrice
          ? workExpectedValue(occurrence.quantity, source.unitPrice) ?? undefined
          : undefined,
        state: occurrence.state,
        note: occurrence.note,
      };
    }),
  };

  const upcoming = [
    ...workspace.sourceState.planItems
      .filter(plan =>
        plan.monthId === selectedMonth &&
        plan.planStatus === "ACTIVE" &&
        plan.completionStatus === "OPEN" &&
        Boolean(plan.expectedDate)
      )
      .map(plan => ({
        id: plan.planItemId,
        date: plan.expectedDate!,
        label: plan.name,
        kind: "PLANNED" as const,
      })),
    ...workspace.sourceState.workOccurrences
      .filter(occurrence => occurrence.date.startsWith(selectedMonth))
      .map(occurrence => ({
        id: occurrence.workOccurrenceId,
        date: occurrence.date,
        label: sources.get(occurrence.incomeSourceId)?.name || occurrence.incomeSourceId,
        kind: "WORK" as const,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return {
    overview: {
      selectedMonth,
      kpis: [
        {
          id: "income",
          label: presentationText(language, "income"),
          value: incomeValue,
          incomplete: selectedFlows.income.incomplete,
          helpText: "Actual external income in the selected month.",
        },
        {
          id: "spending",
          label: presentationText(language, "spending"),
          value: expenseValue,
          incomplete: selectedFlows.expense.incomplete,
          helpText: "Actual external expense in the selected month.",
        },
        {
          id: "monthlyResult",
          label: presentationText(language, "monthlyResult"),
          value: resultValue,
          incomplete: !resultValue,
          helpText: "Actual monthly flow result; transfers are excluded.",
        },
        {
          id: "freeAvailable",
          label: presentationText(language, "freeAvailable"),
          value: freeEquivalent.value,
          incomplete: freeEquivalent.incomplete,
          helpText: "Derived account position less active allocations.",
        },
      ],
      comparison: {
        currencyCode: workspace.reportingCurrencyCode,
        points: comparison.points,
        incomplete: comparison.incomplete,
      },
      trajectory: {
        currencyCode: workspace.reportingCurrencyCode,
        points: trajectory.points,
        incomplete: trajectory.incomplete,
      },
      recentTransactions: tx.rows
        .filter(row => row.occurredOn.startsWith(selectedMonth))
        .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn))
        .map(row => ({
          movementId: row.movementId,
          occurredOn: row.occurredOn,
          description: row.description,
          movementType: row.movementType,
          amount: row.amount,
          counterAmount: row.counterAmount,
        })),
      upcoming,
      positions,
      reportingEquivalent: {
        value: positionEquivalent.value,
        incomplete: positionEquivalent.incomplete,
        fxContext: positionEquivalent.fxContext,
      },
    },
    month: {
      selectedMonth,
      incomeGroups: buildMonthGroups(workspace, currentById, selectedMonth, "INCOME", language),
      spendingGroups: buildMonthGroups(workspace, currentById, selectedMonth, "EXPENSE", language),
      accounts: positions.map(row => ({
        accountId: row.id,
        name: row.label,
        position: row.position,
        allocated: row.allocated,
        free: row.free,
      })),
      reportingEquivalent: {
        value: positionEquivalent.value,
        incomplete: positionEquivalent.incomplete,
        fxContext: positionEquivalent.fxContext,
      },
    },
    calendar: {
      selectedMonth,
      days: calendarDays(workspace, current, selectedMonth),
    },
    transactionRows: tx.rows,
    transactionDetails: tx.details,
    accounts: {
      accounts: workspace.sourceState.accounts.map(account => {
        const position = positions.find(row => row.id === account.accountId)!;
        return {
          accountId: account.accountId,
          name: account.name,
          accountType: account.accountType,
          currencyCode: account.currencyCode,
          position: position.position,
          allocated: position.allocated,
          free: position.free,
          active: account.active,
        };
      }),
      allocations: allocationRows,
      reportingEquivalent: {
        value: positionEquivalent.value,
        incomplete: positionEquivalent.incomplete,
        fxContext: positionEquivalent.fxContext,
      },
    },
    planning,
  };
}
