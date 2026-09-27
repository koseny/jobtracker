import type { BufferPolicy, CashFlowItem } from "./cashFlow";
import { plannedSpendingAmountHuf } from "./planning";
import { effectiveAmountHuf } from "./time";

export interface CashFlowTotals {
  incomeHuf: number;
  spendingHuf: number;
  netHuf: number;
}

export function calculateCashFlowTotals(
  items: readonly CashFlowItem[],
  bufferPolicy: BufferPolicy,
  viewMonth: string,
): CashFlowTotals {
  let incomeHuf = 0;
  let spendingHuf = 0;

  for (const item of items) {
    const sourceAmount =
      item.direction === "income"
        ? item.expectedAmountHuf
        : plannedSpendingAmountHuf(item, bufferPolicy);
    const effective = effectiveAmountHuf(sourceAmount, item.schedule, viewMonth);

    if (item.direction === "income") incomeHuf += effective;
    else spendingHuf += effective;
  }

  return { incomeHuf, spendingHuf, netHuf: incomeHuf - spendingHuf };
}
