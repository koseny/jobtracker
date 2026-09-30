import type { LanguageCode } from "../../domain/ownerPreferences";
import type { AccountsViewModel, PlanningViewModel } from "../accountsPlanning/accountsPlanningModel";
import type {
  CalendarDayModel,
  CalendarMonthViewModel,
  TransactionDetailModel,
  TransactionLedgerRowModel,
} from "../calendarTransactions/calendarTransactionModel";
import type { MonthViewModel, OverviewViewModel } from "../presentation/presentationModel";
import { presentationText } from "../presentation/presentationText";

export interface DormantHcfFixture {
  overview: OverviewViewModel;
  month: MonthViewModel;
  calendar: CalendarMonthViewModel;
  transactionRows: TransactionLedgerRowModel[];
  transactionDetails: Record<string, TransactionDetailModel>;
  accounts: AccountsViewModel;
  planning: PlanningViewModel;
}

export function normalizeMonthId(monthId: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthId)) {
    throw new Error("Month ID must use YYYY-MM.");
  }
  return monthId;
}

export function shiftMonth(monthId: string, delta: number): string {
  normalizeMonthId(monthId);
  if (!Number.isInteger(delta)) throw new Error("Month shift must be an integer.");
  const [yearText, monthText] = monthId.split("-");
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function calendarDays(selectedMonth: string): CalendarDayModel[] {
  const [yearText, monthText] = selectedMonth.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const iso = date.toISOString().slice(0, 10);
    const entries = [];

    if (iso === `${selectedMonth}-05`) {
      entries.push(
        { id: "cal-salary-plan", kind: "PLANNED" as const, label: "Salary expected", recurring: true },
        {
          id: "cal-salary-actual",
          kind: "ACTUAL_INCOME" as const,
          label: "Salary received",
          amount: { amountMinor: 505_000, currencyCode: "HUF" as const },
          movementId: "movement-salary",
        },
      );
    }
    if (iso === `${selectedMonth}-14`) {
      entries.push(
        { id: "cal-family", kind: "EVENT" as const, label: "Family appointment" },
        { id: "cal-note", kind: "NOTE" as const, label: "Bring documents" },
        {
          id: "cal-groceries",
          kind: "ACTUAL_EXPENSE" as const,
          label: "Groceries",
          amount: { amountMinor: 34_500, currencyCode: "HUF" as const },
          movementId: "movement-groceries",
        },
      );
    }
    if (iso === `${selectedMonth}-20`) {
      entries.push(
        { id: "cal-client-work", kind: "WORK" as const, label: "Client work", recurring: true },
        { id: "cal-insurance-plan", kind: "PLANNED" as const, label: "Insurance reserve" },
      );
    }

    return {
      date: iso,
      dayOfMonth: date.getUTCDate(),
      inSelectedMonth: date.getUTCMonth() === monthIndex,
      entries,
    };
  });
}

export function buildDormantHcfFixture(
  selectedMonth: string,
  language: LanguageCode,
): DormantHcfFixture {
  normalizeMonthId(selectedMonth);

  const transactionRows: TransactionLedgerRowModel[] = [
    {
      movementId: "movement-salary",
      occurredOn: `${selectedMonth}-05`,
      description: "Salary",
      movementType: "INCOME",
      accountLabel: "Main bank",
      categoryLabel: "Income",
      amount: { amountMinor: 505_000, currencyCode: "HUF" },
      lifecycleStatus: "ACTIVE",
      reconciliationStatus: "Matched",
    },
    {
      movementId: "movement-groceries",
      occurredOn: `${selectedMonth}-14`,
      description: "Groceries",
      movementType: "EXPENSE",
      accountLabel: "Main bank",
      categoryLabel: "Household",
      amount: { amountMinor: 34_500, currencyCode: "HUF" },
      lifecycleStatus: "ACTIVE",
      reconciliationStatus: "Matched",
    },
    {
      movementId: "movement-transfer",
      occurredOn: `${selectedMonth}-20`,
      description: "Transfer to savings",
      movementType: "TRANSFER",
      accountLabel: "Main bank",
      counterAccountLabel: "EUR savings",
      amount: { amountMinor: 40_000, currencyCode: "HUF" },
      lifecycleStatus: "ACTIVE",
    },
  ];

  const transactionDetails: Record<string, TransactionDetailModel> = {
    "movement-salary": {
      ...transactionRows[0],
      currentRevisionNo: 1,
      planMatchLabel: "Monthly salary plan",
      linkedDailyEventLabel: "Salary day",
      auditHistory: [
        { revisionNo: 1, changedAt: `${selectedMonth}-05T08:00:00Z`, summary: "Created" },
      ],
    },
    "movement-groceries": {
      ...transactionRows[1],
      currentRevisionNo: 2,
      planMatchLabel: "Groceries plan",
      linkedDailyEventLabel: "Shopping day",
      allocationRelationLabel: "Household reserve APPLY",
      auditHistory: [
        { revisionNo: 1, changedAt: `${selectedMonth}-14T15:00:00Z`, summary: "Created" },
        { revisionNo: 2, changedAt: `${selectedMonth}-14T15:10:00Z`, summary: "Corrected amount" },
      ],
    },
    "movement-transfer": {
      ...transactionRows[2],
      currentRevisionNo: 1,
      allocationRelationLabel: "Savings reserve",
      auditHistory: [
        { revisionNo: 1, changedAt: `${selectedMonth}-20T09:00:00Z`, summary: "Created transfer" },
      ],
    },
  };

  const accounts: AccountsViewModel = {
    accounts: [
      {
        accountId: "account-main-huf",
        name: "Main bank",
        accountType: "BANK",
        currencyCode: "HUF",
        position: { amountMinor: 640_500, currencyCode: "HUF" },
        allocated: { amountMinor: 120_000, currencyCode: "HUF" },
        free: { amountMinor: 520_500, currencyCode: "HUF" },
        active: true,
      },
      {
        accountId: "account-eur-savings",
        name: "EUR savings",
        accountType: "SAVINGS",
        currencyCode: "EUR",
        position: { amountMinor: 125_00, currencyCode: "EUR" },
        allocated: { amountMinor: 25_00, currencyCode: "EUR" },
        free: { amountMinor: 100_00, currencyCode: "EUR" },
        active: true,
      },
      {
        accountId: "account-cash",
        name: "Cash",
        accountType: "CASH",
        currencyCode: "HUF",
        position: { amountMinor: 60_000, currencyCode: "HUF" },
        allocated: { amountMinor: 0, currencyCode: "HUF" },
        free: { amountMinor: 60_000, currencyCode: "HUF" },
        active: true,
      },
    ],
    allocations: [
      {
        allocationId: "allocation-insurance",
        purpose: "Insurance",
        accountLabel: "Main bank",
        currencyCode: "HUF",
        reserved: { amountMinor: 120_000, currencyCode: "HUF" },
        applied: { amountMinor: 20_000, currencyCode: "HUF" },
        remaining: { amountMinor: 100_000, currencyCode: "HUF" },
        state: "ACTIVE",
        linkedPlanLabel: "Annual insurance",
      },
      {
        allocationId: "allocation-travel",
        purpose: "Travel",
        accountLabel: "EUR savings",
        currencyCode: "EUR",
        reserved: { amountMinor: 25_00, currencyCode: "EUR" },
        applied: { amountMinor: 0, currencyCode: "EUR" },
        remaining: { amountMinor: 25_00, currencyCode: "EUR" },
        state: "ACTIVE",
        linkedPlanLabel: "Travel plan",
      },
    ],
    reportingEquivalent: {
      value: null,
      incomplete: true,
    },
  };

  const month: MonthViewModel = {
    selectedMonth,
    incomeGroups: [
      {
        id: "income-regular",
        name: "Regular income",
        rows: [
          {
            id: "plan-salary",
            name: "Salary",
            planned: { amountMinor: 500_000, currencyCode: "HUF" },
            actual: { amountMinor: 505_000, currencyCode: "HUF" },
            completionStatus: "COMPLETED",
          },
          {
            id: "plan-client",
            name: "Client work",
            planned: { amountMinor: 48_000, currencyCode: "HUF" },
            completionStatus: "OPEN",
          },
        ],
      },
    ],
    spendingGroups: [
      {
        id: "spending-household",
        name: "Household",
        rows: [
          {
            id: "plan-groceries",
            name: "Groceries",
            planned: { amountMinor: 120_000, currencyCode: "HUF" },
            actual: { amountMinor: 34_500, currencyCode: "HUF" },
            completionStatus: "OPEN",
          },
          {
            id: "plan-insurance",
            name: "Insurance",
            planned: { amountMinor: 120_000, currencyCode: "HUF" },
            completionStatus: "OPEN",
          },
        ],
      },
    ],
    accounts: accounts.accounts.map(account => ({
      accountId: account.accountId,
      name: account.name,
      position: account.position,
      allocated: account.allocated,
      free: account.free,
    })),
    reportingEquivalent: accounts.reportingEquivalent,
  };

  const overview: OverviewViewModel = {
    selectedMonth,
    kpis: [
      {
        id: "income",
        label: presentationText(language, "income"),
        value: { amountMinor: 553_000, currencyCode: "HUF" },
        helpText: "Planned and actual income context for the selected month.",
      },
      {
        id: "spending",
        label: presentationText(language, "spending"),
        value: { amountMinor: 240_000, currencyCode: "HUF" },
        helpText: "Planned and actual spending context for the selected month.",
      },
      {
        id: "monthlyResult",
        label: presentationText(language, "monthlyResult"),
        value: { amountMinor: 313_000, currencyCode: "HUF" },
        helpText: "Monthly flow result; this is not an account balance.",
      },
      {
        id: "freeAvailable",
        label: presentationText(language, "freeAvailable"),
        value: null,
        incomplete: true,
        helpText: "Free position after allocations; cross-currency consolidation requires explicit FX.",
      },
    ],
    comparison: {
      currencyCode: "HUF",
      points: [
        { monthId: shiftMonth(selectedMonth, -2), label: shiftMonth(selectedMonth, -2), incomeMinor: 510_000, spendingMinor: 310_000, resultMinor: 200_000 },
        { monthId: shiftMonth(selectedMonth, -1), label: shiftMonth(selectedMonth, -1), incomeMinor: 530_000, spendingMinor: 290_000, resultMinor: 240_000 },
        { monthId: selectedMonth, label: selectedMonth, incomeMinor: 553_000, spendingMinor: 240_000, resultMinor: 313_000 },
      ],
    },
    trajectory: {
      currencyCode: "HUF",
      points: [
        { date: `${selectedMonth}-01`, label: "1", actualMinor: 210_000, forecastMinor: 210_000 },
        { date: `${selectedMonth}-14`, label: "14", actualMinor: 430_000, forecastMinor: 410_000 },
        { date: `${selectedMonth}-25`, label: "25", actualMinor: 313_000, forecastMinor: 280_000 },
      ],
    },
    recentTransactions: transactionRows.map(row => ({
      movementId: row.movementId,
      occurredOn: row.occurredOn,
      description: row.description,
      movementType: row.movementType,
      amount: row.amount,
    })),
    upcoming: [
      { id: "upcoming-insurance", date: `${selectedMonth}-25`, label: "Insurance", kind: "PLANNED" },
      { id: "upcoming-work", date: `${selectedMonth}-20`, label: "Client work", kind: "WORK" },
    ],
    positions: accounts.accounts.map(account => ({
      id: account.accountId,
      label: account.name,
      position: account.position,
      allocated: account.allocated,
      free: account.free,
    })),
    reportingEquivalent: accounts.reportingEquivalent,
  };

  const planning: PlanningViewModel = {
    templates: [
      {
        planTemplateId: "template-salary",
        name: "Salary",
        direction: "INCOME",
        plannedAmount: { amountMinor: 500_000, currencyCode: "HUF" },
        recurrence: "MONTHLY",
        timingLabel: "day 5",
        categoryGroupLabel: "Income / Regular",
        active: true,
      },
      {
        planTemplateId: "template-insurance",
        name: "Insurance",
        direction: "EXPENSE",
        plannedAmount: { amountMinor: 120_000, currencyCode: "HUF" },
        recurrence: "QUARTERLY",
        timingLabel: "day 25",
        categoryGroupLabel: "Household / Fixed",
        active: true,
      },
    ],
    incomeSources: [
      {
        incomeSourceId: "income-source-client",
        name: "Client work",
        unit: "hour",
        unitPrice: { amountMinor: 12_000, currencyCode: "HUF" },
        defaultCurrency: "HUF",
        active: true,
      },
    ],
    workOccurrences: [
      {
        workOccurrenceId: "work-client-20",
        date: `${selectedMonth}-20`,
        sourceLabel: "Client work",
        quantity: 4,
        unit: "hour",
        expectedValue: { amountMinor: 48_000, currencyCode: "HUF" },
        state: "COMPLETED",
        note: "Fixture work occurrence",
      },
    ],
  };

  return {
    overview,
    month,
    calendar: { selectedMonth, days: calendarDays(selectedMonth) },
    transactionRows,
    transactionDetails,
    accounts,
    planning,
  };
}
