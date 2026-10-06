import type { CurrencyCode, Money } from "../../domain/v2/cashFlowV2";
import { DomainV2ValidationError } from "../../domain/v2/validationV2";

/** Currency display units at the UI boundary; canonical storage remains integer minor units. */
export function parsePlanAmountInput(value: string, currencyCode: CurrencyCode): Money {
  const input = value.trim();
  const pattern = currencyCode === "HUF" ? /^\d+$/ : /^\d+(?:[.,]\d{1,2})?$/;
  if (!pattern.test(input)) {
    throw new DomainV2ValidationError(
      currencyCode === "HUF" ? "Enter a whole HUF amount." : "Enter a EUR amount with up to two decimals.",
    );
  }
  const [whole, fraction = ""] = input.replace(",", ".").split(".");
  const amount = currencyCode === "HUF"
    ? BigInt(whole)
    : BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new DomainV2ValidationError("Plan amount exceeds exact integer precision.");
  }
  return { amountMinor: Number(amount), currencyCode };
}

export function formatPlanAmountInput(money: Money): string {
  if (money.currencyCode === "HUF") return String(money.amountMinor);
  const whole = Math.floor(money.amountMinor / 100);
  return `${whole}.${String(money.amountMinor % 100).padStart(2, "0")}`;
}
