import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlanningScreen } from "./PlanningScreen";
import type { PlanningViewModel } from "../accountsPlanning/accountsPlanningModel";

const model: PlanningViewModel = {
  templates: [
    {
      planTemplateId: "tpl-monthly",
      name: "Salary",
      direction: "INCOME",
      plannedAmount: { amountMinor: 500_000, currencyCode: "HUF" },
      recurrence: "MONTHLY",
      timingLabel: "day 5",
      categoryGroupLabel: "Income / Salary",
      active: true,
    },
    {
      planTemplateId: "tpl-quarterly",
      name: "Quarterly tax",
      direction: "EXPENSE",
      plannedAmount: { amountMinor: 120_000, currencyCode: "HUF" },
      recurrence: "QUARTERLY",
      active: true,
    },
  ],
  incomeSources: [
    {
      incomeSourceId: "client-a",
      name: "Client A",
      unit: "hour",
      unitPrice: { amountMinor: 12_000, currencyCode: "HUF" },
      defaultCurrency: "HUF",
      active: true,
    },
  ],
  workOccurrences: [
    {
      workOccurrenceId: "work-1",
      date: "2026-09-20",
      sourceLabel: "Client A",
      quantity: 4,
      unit: "hour",
      expectedValue: { amountMinor: 48_000, currencyCode: "HUF" },
      state: "COMPLETED",
      note: "Completed delivery",
    },
  ],
};

describe("PlanningScreen", () => {
  it("renders Plan Templates with bounded recurrence and no RRULE engine", () => {
    const html = renderToStaticMarkup(
      <PlanningScreen language="EN" model={model} />,
    );

    expect(html).toContain("Plan Templates");
    expect(html).toContain("Monthly");
    expect(html).toContain("Quarterly");
    expect(html).not.toContain("RRULE");
    expect(html).toContain("Salary");
  });

  it("keeps work completion non-cash and exposes explicit Record payment", () => {
    const html = renderToStaticMarkup(
      <PlanningScreen language="EN" model={model} initialSubview="INCOME_WORK" />,
    );

    expect(html).toContain("Income Sources");
    expect(html).toContain("Work Occurrences");
    expect(html).toContain("Completing work is operational only");
    expect(html).toContain("Record payment");
    expect(html).toContain("Completed");
  });
});
