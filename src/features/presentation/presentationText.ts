import type { LanguageCode } from "../../domain/ownerPreferences";

export type PresentationTextKey =
  | "planned"
  | "actual"
  | "difference"
  | "status"
  | "add"
  | "focus"
  | "backToMonth"
  | "search"
  | "filter"
  | "group"
  | "collapseAll"
  | "expandAll"
  | "all"
  | "open"
  | "completed"
  | "comparison"
  | "trajectory"
  | "recentTransactions"
  | "viewAll"
  | "upcoming"
  | "position"
  | "accounts"
  | "allocated"
  | "free"
  | "reportingEquivalent"
  | "fxUnavailable"
  | "income"
  | "spending"
  | "monthlyResult"
  | "freeAvailable"
  | "previousMonth"
  | "nextMonth"
  | "currentMonth"
  | "month"
  | "noItems"
  | "noTransactions"
  | "noUpcoming"
  | "information";

const TEXT: Record<LanguageCode, Record<PresentationTextKey, string>> = {
  EN: {
    planned: "Plan",
    actual: "Actual",
    difference: "Δ",
    status: "Status",
    add: "Add",
    focus: "Focus",
    backToMonth: "Back to Month",
    search: "Search",
    filter: "Filter",
    group: "Group",
    collapseAll: "Collapse all",
    expandAll: "Expand all",
    all: "All",
    open: "Open",
    completed: "Completed",
    comparison: "Comparison",
    trajectory: "Trajectory",
    recentTransactions: "Recent Transactions",
    viewAll: "View all",
    upcoming: "Upcoming / Calendar",
    position: "Position",
    accounts: "Accounts",
    allocated: "Allocated",
    free: "Free",
    reportingEquivalent: "Reporting equivalent",
    fxUnavailable: "Consolidated value unavailable without an applicable FX quote.",
    income: "Income",
    spending: "Spending",
    monthlyResult: "Monthly result",
    freeAvailable: "Free available",
    previousMonth: "Previous month",
    nextMonth: "Next month",
    currentMonth: "Current month",
    month: "Month",
    noItems: "No items in this view.",
    noTransactions: "No recent actual transactions.",
    noUpcoming: "No upcoming items.",
    information: "Information",
  },
  HU: {
    planned: "Terv",
    actual: "Tény",
    difference: "Δ",
    status: "Állapot",
    add: "Hozzáadás",
    focus: "Fókusz",
    backToMonth: "Vissza a hónaphoz",
    search: "Keresés",
    filter: "Szűrő",
    group: "Csoport",
    collapseAll: "Összecsukás",
    expandAll: "Kibontás",
    all: "Mind",
    open: "Nyitott",
    completed: "Teljesítve",
    comparison: "Összehasonlítás",
    trajectory: "Pálya",
    recentTransactions: "Legutóbbi tranzakciók",
    viewAll: "Összes",
    upcoming: "Közelgő / Naptár",
    position: "Pozíció",
    accounts: "Számlák",
    allocated: "Elkülönítve",
    free: "Szabad",
    reportingEquivalent: "Riport devizás érték",
    fxUnavailable: "Összesített érték csak alkalmazható FX árfolyammal jeleníthető meg.",
    income: "Bejövő",
    spending: "Kimenő",
    monthlyResult: "Havi eredmény",
    freeAvailable: "Szabadon elérhető",
    previousMonth: "Előző hónap",
    nextMonth: "Következő hónap",
    currentMonth: "Aktuális hónap",
    month: "Hónap",
    noItems: "Nincs elem ebben a nézetben.",
    noTransactions: "Nincs legutóbbi tényleges tranzakció.",
    noUpcoming: "Nincs közelgő elem.",
    information: "Információ",
  },
  DE: {
    planned: "Plan",
    actual: "Ist",
    difference: "Δ",
    status: "Status",
    add: "Hinzufügen",
    focus: "Fokus",
    backToMonth: "Zurück zum Monat",
    search: "Suchen",
    filter: "Filter",
    group: "Gruppe",
    collapseAll: "Alle einklappen",
    expandAll: "Alle ausklappen",
    all: "Alle",
    open: "Offen",
    completed: "Erledigt",
    comparison: "Vergleich",
    trajectory: "Verlauf",
    recentTransactions: "Letzte Transaktionen",
    viewAll: "Alle anzeigen",
    upcoming: "Demnächst / Kalender",
    position: "Position",
    accounts: "Konten",
    allocated: "Reserviert",
    free: "Frei",
    reportingEquivalent: "Berichtswährungswert",
    fxUnavailable: "Konsolidierter Wert ist ohne anwendbaren FX-Kurs nicht verfügbar.",
    income: "Eingang",
    spending: "Ausgang",
    monthlyResult: "Monatsergebnis",
    freeAvailable: "Frei verfügbar",
    previousMonth: "Vorheriger Monat",
    nextMonth: "Nächster Monat",
    currentMonth: "Aktueller Monat",
    month: "Monat",
    noItems: "Keine Elemente in dieser Ansicht.",
    noTransactions: "Keine letzten Ist-Transaktionen.",
    noUpcoming: "Keine anstehenden Elemente.",
    information: "Information",
  },
};

export function presentationText(
  language: LanguageCode,
  key: PresentationTextKey,
): string {
  return TEXT[language][key];
}
