import type { AppDestination } from "../appShell/appShellModel";

export type ImplementedDormantDestination =
  | "overview"
  | "month"
  | "calendar"
  | "transactions"
  | "accounts"
  | "planning";

export function isImplementedDormantDestination(
  destination: AppDestination,
): destination is ImplementedDormantDestination {
  return destination !== "reports" && destination !== "settings";
}

export function shellFocusMode(
  destination: AppDestination,
  calendarFocus: boolean,
): "NONE" | "CALENDAR" {
  return destination === "calendar" && calendarFocus ? "CALENDAR" : "NONE";
}
