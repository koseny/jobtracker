import type { BufferPolicy, CashFlowItem } from "./cashFlow";
import { isValidIsoDate } from "./time";

export class DomainValidationError extends Error {}

export function validateItem(item: CashFlowItem): void {
  if (!item.name.trim()) throw new DomainValidationError("Item name is required.");

  const amount = item.direction === "income" ? item.expectedAmountHuf : item.estimatedAmountHuf;
  if (!Number.isInteger(amount) || amount < 0) {
    throw new DomainValidationError("Amount must be a non-negative integer HUF value.");
  }

  if (item.schedule.frequency === "oneTime" && !/^\d{4}-\d{2}-\d{2}$/.test(item.schedule.date)) {
    throw new DomainValidationError("One-time schedule date must use YYYY-MM-DD.");
  }
}

export function validateBufferPolicy(policy: BufferPolicy): void {
  if (!Number.isInteger(policy.roundingValueHuf) || policy.roundingValueHuf <= 0) {
    throw new DomainValidationError("Buffer rounding value must be a positive integer HUF value.");
  }
  if (!Number.isInteger(policy.roundingThresholdHuf) || policy.roundingThresholdHuf < 0) {
    throw new DomainValidationError("Buffer threshold must be a non-negative integer HUF value.");
  }
}
