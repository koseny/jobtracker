import { describe, expect, it } from "vitest";
import {
  chartExtent,
  filterMonthGroups,
  minorToMajor,
  signedMoneyDifference,
  totalsByCurrency,
  type MonthGroupModel,
} from "./presentationModel";

const groups: MonthGroupModel[] = [
  {
    id: "income-main",
    name: "Income",
    rows: [
      {
        id: "salary",
        name: "Salary",
        planned: { amountMinor: 500_000, currencyCode: "HUF" },
        actual: { amountMinor: 505_000, currencyCode: "HUF" },
        completionStatus: "COMPLETED",
      },
      {
        id: "client",
        name: "Client EUR",
        planned: { amountMinor: 25_000, currencyCode: "EUR" },
        actual: { amountMinor: 20_000, currencyCode: "EUR" },
        completionStatus: "OPEN",
      },
    ],
  },
];

describe("presentation model", () => {
  it("converts minor units by currency without floating storage semantics", () => {
    expect(minorToMajor({ amountMinor: 123_456, currencyCode: "HUF" })).toBe(123_456);
    expect(minorToMajor({ amountMinor: 12_345, currencyCode: "EUR" })).toBe(123.45);
  });

  it("keeps Month totals separated by currency", () => {
    expect(totalsByCurrency(groups)).toEqual([
      {
        currencyCode: "EUR",
        plannedMinor: 25_000,
        actualMinor: 20_000,
      },
      {
        currencyCode: "HUF",
        plannedMinor: 500_000,
        actualMinor: 505_000,
      },
    ]);
  });

  it("rejects a row that mixes planned and actual currency", () => {
    const invalid: MonthGroupModel[] = [{
      id: "mixed",
      name: "Mixed",
      rows: [{
        id: "mixed-row",
        name: "Mixed row",
        planned: { amountMinor: 10_000, currencyCode: "HUF" },
        actual: { amountMinor: 100, currencyCode: "EUR" },
        completionStatus: "OPEN",
      }],
    }];

    expect(() => totalsByCurrency(invalid)).toThrow(
      "Month row mixed-row mixes planned and actual currencies.",
    );
  });

  it("filters focus-mode groups by search and completion status", () => {
    expect(filterMonthGroups(groups, "client", "ALL")[0].rows.map(row => row.id))
      .toEqual(["client"]);
    expect(filterMonthGroups(groups, "", "COMPLETED")[0].rows.map(row => row.id))
      .toEqual(["salary"]);
    expect(filterMonthGroups(groups, "missing", "ALL")).toEqual([]);
  });

  it("derives signed row difference without cross-currency mixing", () => {
    expect(
      signedMoneyDifference(
        { amountMinor: 110_000, currencyCode: "HUF" },
        { amountMinor: 100_000, currencyCode: "HUF" },
      ),
    ).toEqual({ amountMinor: 10_000, currencyCode: "HUF" });

    expect(
      signedMoneyDifference(
        { amountMinor: 100, currencyCode: "EUR" },
        { amountMinor: 100_000, currencyCode: "HUF" },
      ),
    ).toBeNull();
  });

  it("keeps chart scaling stable for zero and negative series", () => {
    expect(chartExtent([0, 0, 0])).toBe(1);
    expect(chartExtent([-10, 4, 6])).toBe(10);
  });
});
