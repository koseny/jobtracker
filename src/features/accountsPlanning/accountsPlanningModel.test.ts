import { describe, expect, it } from "vitest";
import {
  accountTotalsByCurrency,
  allocationRemaining,
  recurrenceLabelKey,
  workExpectedValue,
  type AccountPresentationRow,
} from "./accountsPlanningModel";

const accounts: AccountPresentationRow[] = [
  {
    accountId: "huf-bank",
    name: "HUF bank",
    accountType: "BANK",
    currencyCode: "HUF",
    position: { amountMinor: 300_000, currencyCode: "HUF" },
    allocated: { amountMinor: 100_000, currencyCode: "HUF" },
    free: { amountMinor: 200_000, currencyCode: "HUF" },
    active: true,
  },
  {
    accountId: "eur-bank",
    name: "EUR bank",
    accountType: "BANK",
    currencyCode: "EUR",
    position: { amountMinor: 50_000, currencyCode: "EUR" },
    allocated: { amountMinor: 10_000, currencyCode: "EUR" },
    free: { amountMinor: 40_000, currencyCode: "EUR" },
    active: true,
  },
];

describe("Accounts/Planning presentation model", () => {
  it("keeps account subtotals separated by native currency", () => {
    expect(accountTotalsByCurrency(accounts)).toEqual([
      {
        currencyCode: "EUR",
        positionMinor: 50_000,
        allocatedMinor: 10_000,
        freeMinor: 40_000,
      },
      {
        currencyCode: "HUF",
        positionMinor: 300_000,
        allocatedMinor: 100_000,
        freeMinor: 200_000,
      },
    ]);
  });

  it("rejects mixed account currencies", () => {
    const invalid = [{
      ...accounts[0],
      free: { amountMinor: 2_000, currencyCode: "EUR" as const },
    }];
    expect(() => accountTotalsByCurrency(invalid)).toThrow("mixes currencies");
  });

  it("derives allocation remaining only within one currency", () => {
    expect(allocationRemaining(
      { amountMinor: 100_000, currencyCode: "HUF" },
      { amountMinor: 30_000, currencyCode: "HUF" },
    )).toEqual({ amountMinor: 70_000, currencyCode: "HUF" });

    expect(() => allocationRemaining(
      { amountMinor: 100_000, currencyCode: "HUF" },
      { amountMinor: 100, currencyCode: "EUR" },
    )).toThrow("currency mismatch");
  });

  it("exposes only the bounded R1 recurrence label set", () => {
    expect([
      recurrenceLabelKey("ONE_TIME"),
      recurrenceLabelKey("MONTHLY"),
      recurrenceLabelKey("QUARTERLY"),
      recurrenceLabelKey("WEEKLY"),
      recurrenceLabelKey("MULTIPLE_WITHIN_MONTH"),
    ]).toEqual([
      "oneTime",
      "monthly",
      "quarterly",
      "weekly",
      "multipleWithinMonth",
    ]);
  });

  it("calculates work expected value without creating actual-income semantics", () => {
    expect(workExpectedValue(
      3.5,
      { amountMinor: 10_000, currencyCode: "HUF" },
    )).toEqual({ amountMinor: 35_000, currencyCode: "HUF" });
    expect(workExpectedValue(2, undefined)).toBeNull();
  });
});
