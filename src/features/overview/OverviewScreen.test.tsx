import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OverviewScreen } from "./OverviewScreen";
import type { OverviewViewModel } from "../presentation/presentationModel";

const model: OverviewViewModel = {
  selectedMonth: "2026-09",
  kpis: [
    {
      id: "income",
      label: "Income",
      value: { amountMinor: 620_000, currencyCode: "HUF" },
      helpText: "Expected and actual income context.",
    },
    {
      id: "spending",
      label: "Spending",
      value: { amountMinor: 480_000, currencyCode: "HUF" },
      helpText: "Planned and actual spending context.",
    },
    {
      id: "monthlyResult",
      label: "M",
      value: { amountMinor: 140_000, currencyCode: "HUF" },
      helpText: "Monthly flow result, not account balance.",
    },
    {
      id: "freeAvailable",
      label: "Free available",
      value: null,
      incomplete: true,
      helpText: "Available position after allocations.",
    },
  ],
  comparison: {
    currencyCode: "HUF",
    points: [
      { monthId: "2026-08", label: "Aug", incomeMinor: 600_000, spendingMinor: 500_000, resultMinor: 100_000 },
      { monthId: "2026-09", label: "Sep", incomeMinor: 620_000, spendingMinor: 480_000, resultMinor: 140_000 },
    ],
  },
  trajectory: {
    currencyCode: "HUF",
    points: [
      { date: "2026-09-01", label: "1", actualMinor: 250_000, forecastMinor: 250_000 },
      { date: "2026-09-30", label: "30", actualMinor: 140_000, forecastMinor: 85_000 },
    ],
  },
  recentTransactions: [
    {
      movementId: "m-1",
      occurredOn: "2026-09-30",
      description: "Actual salary",
      movementType: "INCOME",
      amount: { amountMinor: 500_000, currencyCode: "HUF" },
    },
  ],
  upcoming: [
    { id: "u-1", date: "2026-10-02", label: "Insurance", kind: "PLANNED" },
  ],
  positions: [
    {
      id: "bank",
      label: "Main bank",
      position: { amountMinor: 300_000, currencyCode: "HUF" },
      allocated: { amountMinor: 100_000, currencyCode: "HUF" },
      free: { amountMinor: 200_000, currencyCode: "HUF" },
    },
  ],
  reportingEquivalent: {
    value: null,
    incomplete: true,
  },
};

describe("OverviewScreen", () => {
  it("renders approved Overview regions and actual Recent Transactions", () => {
    const html = renderToStaticMarkup(
      <OverviewScreen language="EN" model={model} />,
    );

    expect(html).toContain("hcf-overview-kpis");
    expect(html).toContain("hcf-overview-outlook");
    expect(html).toContain("Recent Transactions");
    expect(html).toContain("Actual salary");
    expect(html).toContain("Upcoming / Calendar");
    expect(html).toContain("hcf-overview-position");
    expect(html).toContain("Comparison");
    expect(html).toContain("Trajectory");
  });

  it("does not guess a consolidated reporting value when FX context is incomplete", () => {
    const html = renderToStaticMarkup(
      <OverviewScreen language="EN" model={model} />,
    );

    expect(html).toContain("Consolidated value unavailable without an applicable FX quote.");
  });
});
