import type { LanguageCode } from "../../domain/ownerPreferences";

export type AppDestination =
  | "overview"
  | "month"
  | "calendar"
  | "transactions"
  | "accounts"
  | "planning"
  | "reports"
  | "settings";

export interface NavigationItem {
  id: AppDestination;
  symbol: string;
}

export const PRIMARY_NAVIGATION: readonly NavigationItem[] = [
  { id: "overview", symbol: "⌂" },
  { id: "month", symbol: "▦" },
  { id: "calendar", symbol: "□" },
  { id: "transactions", symbol: "⇄" },
  { id: "accounts", symbol: "¤" },
  { id: "planning", symbol: "✓" },
  { id: "reports", symbol: "⌁" },
  { id: "settings", symbol: "⚙" },
] as const;

export type NavigationMode = "SIDEBAR" | "RAIL" | "DRAWER";

export function navigationModeForWidth(widthCssPx: number): NavigationMode {
  if (!Number.isFinite(widthCssPx) || widthCssPx <= 0) {
    throw new Error("Viewport width must be a positive finite number.");
  }
  if (widthCssPx < 720) return "DRAWER";
  if (widthCssPx < 1100) return "RAIL";
  return "SIDEBAR";
}

type ShellTextKey =
  | "appName"
  | "navigation"
  | "menu"
  | "closeMenu"
  | "language"
  | "theme"
  | "light"
  | "dark"
  | "signOut"
  | "preferencesLoading"
  | "preferencesError"
  | AppDestination;

const TEXT: Record<LanguageCode, Record<ShellTextKey, string>> = {
  EN: {
    appName: "Home Cash Flow",
    navigation: "Navigation",
    menu: "Menu",
    closeMenu: "Close menu",
    language: "Language",
    theme: "Theme",
    light: "Light",
    dark: "Dark",
    signOut: "Sign out",
    preferencesLoading: "Loading preferences…",
    preferencesError: "Preferences could not be saved.",
    overview: "Overview",
    month: "Month",
    calendar: "Calendar",
    transactions: "Transactions",
    accounts: "Accounts",
    planning: "Planning",
    reports: "Reports",
    settings: "Settings",
  },
  HU: {
    appName: "Otthoni Cash Flow",
    navigation: "Navigáció",
    menu: "Menü",
    closeMenu: "Menü bezárása",
    language: "Nyelv",
    theme: "Téma",
    light: "Világos",
    dark: "Sötét",
    signOut: "Kijelentkezés",
    preferencesLoading: "Beállítások betöltése…",
    preferencesError: "A beállításokat nem sikerült menteni.",
    overview: "Áttekintés",
    month: "Hónap",
    calendar: "Naptár",
    transactions: "Tranzakciók",
    accounts: "Számlák",
    planning: "Tervezés",
    reports: "Jelentések",
    settings: "Beállítások",
  },
  DE: {
    appName: "Home Cash Flow",
    navigation: "Navigation",
    menu: "Menü",
    closeMenu: "Menü schließen",
    language: "Sprache",
    theme: "Design",
    light: "Hell",
    dark: "Dunkel",
    signOut: "Abmelden",
    preferencesLoading: "Einstellungen werden geladen…",
    preferencesError: "Einstellungen konnten nicht gespeichert werden.",
    overview: "Übersicht",
    month: "Monat",
    calendar: "Kalender",
    transactions: "Transaktionen",
    accounts: "Konten",
    planning: "Planung",
    reports: "Berichte",
    settings: "Einstellungen",
  },
};

export function shellText(language: LanguageCode, key: ShellTextKey): string {
  return TEXT[language][key];
}
