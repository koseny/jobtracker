import { describe, expect, it } from "vitest";
import type { BufferPolicy, CashFlowItem } from "./cashFlow";
import { calculateCashFlowTotals } from "./calculator";

const noBuffer: BufferPolicy = {
  roundingValueHuf: 1_000,
  roundingThresholdHuf: 0,
  applyToFixed: false,
};

const common = {
  mode: "bank" as const,
  planningStatus: "planned" as const,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("calculateCashFlowTotals", () => {
  it("reproduces the approved March precision regression totals", () => {
    const items: CashFlowItem[] = [
      {
        ...common,
        id: "salary",
        name: "Salary",
        direction: "income",
        expenseType: null,
        schedule: { frequency: "monthly" },
        expectedAmountHuf: 1_050_000,
      },
      {
        ...common,
        id: "side-cash",
        name: "Side Cash",
        direction: "income",
        expenseType: null,
        schedule: { frequency: "weekly" },
        expectedAmountHuf: 25_000,
      },
      {
        ...common,
        id: "monthly-spending",
        name: "Monthly Spending",
        direction: "spending",
        expenseType: "fixed",
        schedule: { frequency: "monthly" },
        estimatedAmountHuf: 433_500,
      },
      {
        ...common,
        id: "weekly-menu",
        name: "Weekly Menu",
        direction: "spending",
        expenseType: "variable",
        schedule: { frequency: "weekly" },
        estimatedAmountHuf: 12_000,
      },
    ];

    expect(calculateCashFlowTotals(items, noBuffer, "2026-03")).toEqual({
      incomeHuf: 1_160_714,
      spendingHuf: 486_643,
      netHuf: 674_071,
    });
  });
});
