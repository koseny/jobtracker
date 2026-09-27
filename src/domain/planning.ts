import type { BufferPolicy, SpendingItem } from "./cashFlow";

export function plannedSpendingAmountHuf(item: SpendingItem, policy: BufferPolicy): number {
  if (item.expenseType === "fixed" && !policy.applyToFixed) return item.estimatedAmountHuf;

  const ceiling = Math.ceil(item.estimatedAmountHuf / policy.roundingValueHuf) * policy.roundingValueHuf;
  const delta = ceiling - item.estimatedAmountHuf;
  return delta <= policy.roundingThresholdHuf
    ? ceiling
    : item.estimatedAmountHuf + policy.roundingThresholdHuf;
}
