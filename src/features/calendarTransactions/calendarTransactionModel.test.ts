import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRANSACTION_FILTERS,
  filterTransactions,
  newestFirst,
  partitionSelectedDay,
  validateCalendarMonthModel,
  visibleCalendarEntries,
  type CalendarDayModel,
  type CalendarMonthViewModel,
  type TransactionLedgerRowModel,
} from "./calendarTransactionModel";

const entries = Array.from({ length: 7 }, (_, index) => ({
  id: `e-${index}`,
  kind: index === 0 ? "EVENT" as const : "PLANNED" as const,
  label: `Entry ${index}`,
}));

describe("Calendar presentation model", () => {
  it("caps integrated density at 3 lines and Focus density at 6", () => {
    expect(visibleCalendarEntries(entries, false)).toMatchObject({
      visible: entries.slice(0, 3),
      overflowCount: 4,
    });
    expect(visibleCalendarEntries(entries, true)).toMatchObject({
      visible: entries.slice(0, 6),
      overflowCount: 1,
    });
  });

  it("partitions selected-day content without mixing plan and actual semantics", () => {
    const day: CalendarDayModel = {
      date: "2026-09-15",
      dayOfMonth: 15,
      inSelectedMonth: true,
      entries: [
        { id: "event", kind: "EVENT", label: "Dentist" },
        { id: "note", kind: "NOTE", label: "Bring document" },
        { id: "plan", kind: "PLANNED", label: "Insurance due" },
        { id: "work", kind: "WORK", label: "Client work" },
        {
          id: "income",
          kind: "ACTUAL_INCOME",
          label: "Salary",
          amount: { amountMinor: 500_000, currencyCode: "HUF" },
          movementId: "m-income",
        },
        {
          id: "expense",
          kind: "ACTUAL_EXPENSE",
          label: "Groceries",
          amount: { amountMinor: 30_000, currencyCode: "HUF" },
          movementId: "m-expense",
        },
      ],
    };

    const partitioned = partitionSelectedDay(day);
    expect(partitioned.eventsAndNotes.map(x => x.id)).toEqual(["event", "note"]);
    expect(partitioned.expectedAndPlanned.map(x => x.id)).toEqual(["plan", "work"]);
    expect(partitioned.actualMovements.map(x => x.id)).toEqual(["income", "expense"]);
  });

  it("requires a bounded 42-cell month model", () => {
    const days = Array.from({ length: 42 }, (_, index) => ({
      date: `2026-09-${String((index % 30) + 1).padStart(2, "0")}`,
      dayOfMonth: (index % 30) + 1,
      inSelectedMonth: true,
      entries: [],
    }));
    const invalid: CalendarMonthViewModel = { selectedMonth: "2026-09", days };
    expect(() => validateCalendarMonthModel(invalid)).toThrow("Duplicate calendar day");
  });
});

const rows: TransactionLedgerRowModel[] = [
  {
    movementId: "m-older",
    occurredOn: "2026-09-03",
    description: "Older expense",
    movementType: "EXPENSE",
    accountLabel: "Bank",
    categoryLabel: "Food",
    amount: { amountMinor: 20_000, currencyCode: "HUF" },
    lifecycleStatus: "ACTIVE",
  },
  {
    movementId: "m-newer",
    occurredOn: "2026-09-29",
    description: "New salary",
    movementType: "INCOME",
    accountLabel: "Bank",
    categoryLabel: "Income",
    amount: { amountMinor: 500_000, currencyCode: "HUF" },
    lifecycleStatus: "ACTIVE",
  },
  {
    movementId: "m-void",
    occurredOn: "2026-09-12",
    description: "Voided entry",
    movementType: "EXPENSE",
    accountLabel: "Cash",
    categoryLabel: "Other",
    amount: { amountMinor: 5_000, currencyCode: "HUF" },
    lifecycleStatus: "VOIDED",
  },
];

describe("Transactions presentation model", () => {
  it("orders the ledger newest first", () => {
    expect(newestFirst(rows).map(row => row.movementId)).toEqual([
      "m-newer",
      "m-void",
      "m-older",
    ]);
  });

  it("filters by query, type, owner-facing account/category and lifecycle status", () => {
    expect(filterTransactions(rows, {
      ...DEFAULT_TRANSACTION_FILTERS,
      query: "salary",
    }).map(row => row.movementId)).toEqual(["m-newer"]);

    expect(filterTransactions(rows, {
      ...DEFAULT_TRANSACTION_FILTERS,
      movementType: "EXPENSE",
      lifecycleStatus: "VOIDED",
      accountLabel: "cash",
      categoryLabel: "other",
    }).map(row => row.movementId)).toEqual(["m-void"]);
  });
});
