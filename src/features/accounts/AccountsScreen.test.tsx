import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountsScreen } from "./AccountsScreen";
import type { AccountsViewModel } from "../accountsPlanning/accountsPlanningModel";

const model: AccountsViewModel = {
  accounts: [
    {
      accountId: "bank",
      name: "Main bank",
      accountType: "BANK",
      currencyCode: "HUF",
      position: { amountMinor: 300_000, currencyCode: "HUF" },
      allocated: { amountMinor: 100_000, currencyCode: "HUF" },
      free: { amountMinor: 200_000, currencyCode: "HUF" },
      active: true,
    },
    {
      accountId: "eur",
      name: "EUR savings",
      accountType: "SAVINGS",
      currencyCode: "EUR",
      position: { amountMinor: 50_000, currencyCode: "EUR" },
      allocated: { amountMinor: 10_000, currencyCode: "EUR" },
      free: { amountMinor: 40_000, currencyCode: "EUR" },
      active: true,
    },
  ],
  allocations: [
    {
      allocationId: "reserve-1",
      purpose: "Insurance",
      accountLabel: "Main bank",
      currencyCode: "HUF",
      reserved: { amountMinor: 120_000, currencyCode: "HUF" },
      applied: { amountMinor: 20_000, currencyCode: "HUF" },
      remaining: { amountMinor: 100_000, currencyCode: "HUF" },
      state: "ACTIVE",
      linkedPlanLabel: "Annual insurance",
      overAllocated: true,
    },
  ],
  reportingEquivalent: {
    value: null,
    incomplete: true,
  },
};

describe("AccountsScreen", () => {
  it("renders native account positions, per-currency summary and approved account actions", () => {
    const html = renderToStaticMarkup(
      <AccountsScreen language="EN" model={model} />,
    );

    expect(html).toContain("Main bank");
    expect(html).toContain("EUR savings");
    expect(html).toContain("HUF");
    expect(html).toContain("EUR");
    expect(html).toContain("Transfer &amp; Reserve");
    expect(html).toContain("Reconcile");
    expect(html).toContain("Consolidated value unavailable");
  });

  it("renders Allocation semantics separately from account position", () => {
    const html = renderToStaticMarkup(
      <AccountsScreen language="EN" model={model} initialSubview="ALLOCATIONS" />,
    );

    expect(html).toContain("Insurance");
    expect(html).toContain("Reserved");
    expect(html).toContain("Applied");
    expect(html).toContain("Remaining");
    expect(html).toContain("Release");
    expect(html).toContain("Adjust");
    expect(html).toContain("Over-allocation / under-coverage");
  });
});
