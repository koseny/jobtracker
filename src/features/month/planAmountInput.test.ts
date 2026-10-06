import { describe, expect, it } from "vitest";
import { formatPlanAmountInput, parsePlanAmountInput } from "./planAmountInput";

describe("plan amount UI conversion", () => {
  it("uses exact HUF units and EUR cents", () => {
    expect(parsePlanAmountInput("180000", "HUF")).toEqual({ amountMinor: 180000, currencyCode: "HUF" });
    expect(parsePlanAmountInput("12,5", "EUR")).toEqual({ amountMinor: 1250, currencyCode: "EUR" });
    expect(formatPlanAmountInput({ amountMinor: 1250, currencyCode: "EUR" })).toBe("12.50");
  });

  it("rejects imprecise, negative and out-of-range inputs", () => {
    for (const [value, currency] of [["1.2", "HUF"], ["-1", "HUF"], ["1.234", "EUR"], ["9007199254740992", "HUF"]] as const) {
      expect(() => parsePlanAmountInput(value, currency)).toThrow();
    }
  });
});
