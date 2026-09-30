import { describe, expect, it } from "vitest";
import {
  buildDormantHcfFixture,
  normalizeMonthId,
  shiftMonth,
} from "./dormantFixtureData";

describe("dormant HCF fixture adapter", () => {
  it("keeps all screen models on one selected month", () => {
    const fixture = buildDormantHcfFixture("2026-09", "EN");

    expect(fixture.overview.selectedMonth).toBe("2026-09");
    expect(fixture.month.selectedMonth).toBe("2026-09");
    expect(fixture.calendar.selectedMonth).toBe("2026-09");
    expect(fixture.transactionRows.every(row => row.occurredOn.startsWith("2026-09"))).toBe(true);
    expect(fixture.planning.workOccurrences.every(row => row.date.startsWith("2026-09"))).toBe(true);
  });

  it("builds a unique 42-cell Monday-first calendar surface", () => {
    const fixture = buildDormantHcfFixture("2026-09", "EN");
    const dates = fixture.calendar.days.map(day => day.date);

    expect(dates).toHaveLength(42);
    expect(new Set(dates).size).toBe(42);
    expect(dates[0]).toBe("2026-08-31");
    expect(dates[41]).toBe("2026-10-11");
  });

  it("keeps actual Recent Transactions aligned with ledger movement IDs", () => {
    const fixture = buildDormantHcfFixture("2026-09", "EN");
    expect(fixture.overview.recentTransactions.map(row => row.movementId))
      .toEqual(fixture.transactionRows.map(row => row.movementId));
  });

  it("shifts month view state across year boundaries without creating facts", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-09", 0)).toBe("2026-09");
  });

  it("rejects malformed month IDs", () => {
    expect(() => normalizeMonthId("2026-9")).toThrow();
    expect(() => normalizeMonthId("September")).toThrow();
  });
});
