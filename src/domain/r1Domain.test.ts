import { describe, expect, it } from "vitest";
import type { SpendingItem } from "./cashFlow";
import { plannedSpendingAmountHuf } from "./planning";
import { daysInMonth, effectiveAmountHuf } from "./time";
import { DomainValidationError, validateItem } from "./validation";

const spending: SpendingItem = {
  id: "weekly-menu",
  name: "Weekly Menu",
  direction: "spending",
  mode: "cash",
  planningStatus: "planned",
  expenseType: "variable",
  schedule: { frequency: "weekly" },
  estimatedAmountHuf: 12_000,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("HCF R1 domain core", () => {
  it("handles leap years deterministically", () => {
    expect(daysInMonth("2024-02")).toBe(29);
    expect(daysInMonth("2025-02")).toBe(28);
  });

  it("prorates weekly values using item-level round-half-up", () => {
    expect(effectiveAmountHuf(12_000, spending.schedule, "2026-03")).toBe(53_143);
    expect(effectiveAmountHuf(25_000, { frequency: "weekly" }, "2026-03")).toBe(110_714);
  });

  it("assigns one-time values only to their dated month", () => {
    const schedule = { frequency: "oneTime", date: "2026-03-15" } as const;
    expect(effectiveAmountHuf(10_000, schedule, "2026-03")).toBe(10_000);
    expect(effectiveAmountHuf(10_000, schedule, "2026-04")).toBe(0);
  });

  it("applies the deterministic spending buffer policy", () => {
    expect(plannedSpendingAmountHuf({ ...spending, estimatedAmountHuf: 9_600 }, {
      roundingValueHuf: 1_000,
      roundingThresholdHuf: 500,
      applyToFixed: false,
    })).toBe(10_000);
    expect(plannedSpendingAmountHuf({ ...spending, estimatedAmountHuf: 9_400 }, {
      roundingValueHuf: 1_000,
      roundingThresholdHuf: 500,
      applyToFixed: false,
    })).toBe(9_900);
  });

  it("rejects invalid item input before commit", () => {
    expect(() => validateItem({ ...spending, name: "   " })).toThrow(DomainValidationError);
    expect(() => validateItem({ ...spending, estimatedAmountHuf: 12.5 })).toThrow(DomainValidationError);
    expect(() => validateItem({ ...spending, schedule: { frequency: "oneTime", date: "2026-02-30" } })).toThrow(DomainValidationError);
  });
});
