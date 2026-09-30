import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MonthScreen } from "./MonthScreen";
import type { MonthViewModel } from "../presentation/presentationModel";

const model: MonthViewModel = {
  selectedMonth: "2026-09",
  incomeGroups: [{
    id: "income-group",
    name: "Regular income",
    rows: [{
      id: "salary",
      name: "Salary",
      planned: { amountMinor: 500_000, currencyCode: "HUF" },
      actual: { amountMinor: 500_000, currencyCode: "HUF" },
      completionStatus: "COMPLETED",
    }],
  }],
  spendingGroups: [{
    id: "spending-group",
    name: "Household",
    rows: [{
      id: "groceries",
      name: "Groceries",
      planned: { amountMinor: 120_000, currencyCode: "HUF" },
      actual: { amountMinor: 90_000, currencyCode: "HUF" },
      completionStatus: "OPEN",
    }],
  }],
  accounts: [{
    accountId: "bank",
    name: "Main bank",
    position: { amountMinor: 300_000, currencyCode: "HUF" },
    allocated: { amountMinor: 100_000, currencyCode: "HUF" },
    free: { amountMinor: 200_000, currencyCode: "HUF" },
  }],
};

describe("MonthScreen", () => {
  it("renders the normal Income / Spending / Position three-region workspace", () => {
    const html = renderToStaticMarkup(
      <MonthScreen language="EN" model={model} />,
    );

    expect(html).toContain("hcf-month-panel--income");
    expect(html).toContain("hcf-month-panel--spending");
    expect(html).toContain("hcf-month-position");
    expect(html).toContain("Salary");
    expect(html).toContain("Groceries");
    expect(html).toContain("Current month");
  });

  it("renders a single full-workspace Income panel in Focus Mode", () => {
    const html = renderToStaticMarkup(
      <MonthScreen language="EN" model={model} initialFocusPanel="INCOME" />,
    );

    expect(html).toContain("hcf-month-screen--focus");
    expect(html).toContain("hcf-month-panel--focused");
    expect(html).toContain("Back to Month");
    expect(html).toContain("Search");
    expect(html).not.toContain("hcf-month-panel--spending");
    expect(html).not.toContain("hcf-month-position");
  });
});
