import type { CashFlowSchedule } from "./cashFlow";

const VIEW_MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const ISO_DATE_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function assertViewMonth(viewMonth: string): void {
  if (!VIEW_MONTH_PATTERN.test(viewMonth)) throw new Error("View month must use YYYY-MM.");
}

export function isValidIsoDate(date: string): boolean {
  const match = ISO_DATE_PATTERN.exec(date);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function daysInMonth(viewMonth: string): number {
  assertViewMonth(viewMonth);
  const [year, month] = viewMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function effectiveAmountHuf(amountHuf: number, schedule: CashFlowSchedule, viewMonth: string): number {
  assertViewMonth(viewMonth);
  if (schedule.frequency === "monthly") return amountHuf;
  if (schedule.frequency === "weekly") return Math.floor((amountHuf / 7) * daysInMonth(viewMonth) + 0.5);
  return schedule.date.slice(0, 7) === viewMonth ? amountHuf : 0;
}
