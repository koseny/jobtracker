import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TransactionsScreen } from "./TransactionsScreen";
import type {
  TransactionDetailModel,
  TransactionLedgerRowModel,
} from "../calendarTransactions/calendarTransactionModel";

const rows: TransactionLedgerRowModel[] = [
  {
    movementId: "m-1",
    occurredOn: "2026-09-30",
    description: "Salary",
    movementType: "INCOME",
    accountLabel: "Main bank",
    categoryLabel: "Income",
    amount: { amountMinor: 500_000, currencyCode: "HUF" },
    lifecycleStatus: "ACTIVE",
    reconciliationStatus: "Matched",
  },
  {
    movementId: "m-2",
    occurredOn: "2026-09-14",
    description: "Groceries",
    movementType: "EXPENSE",
    accountLabel: "Main bank",
    categoryLabel: "Household",
    amount: { amountMinor: 35_000, currencyCode: "HUF" },
    lifecycleStatus: "VOIDED",
  },
  {
    movementId: "m-old-month",
    occurredOn: "2026-08-31",
    description: "August item",
    movementType: "EXPENSE",
    accountLabel: "Cash",
    amount: { amountMinor: 10_000, currencyCode: "HUF" },
    lifecycleStatus: "ACTIVE",
  },
];

const detail: TransactionDetailModel = {
  ...rows[1],
  currentRevisionNo: 2,
  planMatchLabel: "Groceries plan",
  linkedDailyEventLabel: "14 Sep — shopping",
  allocationRelationLabel: "Household reserve APPLY",
  dependencyWarning: "Resolve allocation dependency before another void attempt.",
  auditHistory: [
    { revisionNo: 1, changedAt: "2026-09-14T10:00:00Z", summary: "Created" },
    { revisionNo: 2, changedAt: "2026-09-14T11:00:00Z", summary: "Corrected amount" },
  ],
};

describe("TransactionsScreen", () => {
  it("renders selected-month actual ledger and excludes another month", () => {
    const html = renderToStaticMarkup(
      <TransactionsScreen language="EN" selectedMonth="2026-09" rows={rows} />,
    );

    expect(html).toContain("Salary");
    expect(html).toContain("Groceries");
    expect(html).not.toContain("August item");
    expect(html).toContain("Search");
    expect(html).toContain("Match / Status");
  });

  it("renders correction/audit detail with stable movement identity and no Restore action", () => {
    const html = renderToStaticMarkup(
      <TransactionsScreen
        language="EN"
        selectedMonth="2026-09"
        rows={rows}
        detailsByMovementId={{ "m-2": detail }}
        initialMovementId="m-2"
      />,
    );

    expect(html).toContain("Movement ID");
    expect(html).toContain("m-2");
    expect(html).toContain("Revision");
    expect(html).toContain("Correct");
    expect(html).toContain(">Void<");
    expect(html).toContain("Duplicate as new actual");
    expect(html).toContain("Audit History");
    expect(html).toContain("Restore is not available in R1.");
    expect(html).not.toContain(">Restore<");
    expect(html).toContain("Resolve allocation dependency");
  });
});
