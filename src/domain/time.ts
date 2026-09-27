import type { CashFlowSchedule } from "./cashFlow";

export function daysInMonth(viewMonth: string): number {
  const [year, month] = viewMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function effectiveAmountHuf(amountHuf: number, schedule: CashFlowSchedule, viewMonth: string): number {
  if (schedule.frequency === "monthly") return amountHuf;
  if (schedule.frequency === "weekly") return Math.floor((amountHuf / 7) * daysInMonth(viewMonth) + 0.5);
  return schedule.date.startsWith(`${viewMonth}-`) ? amountHuf : 0;
}
