import type { LanguageCode } from "../../domain/ownerPreferences";

export type CalendarTransactionTextKey =
  | "calendar"
  | "focusCalendar"
  | "exitFocus"
  | "today"
  | "previousMonth"
  | "nextMonth"
  | "currentMonth"
  | "selectedDay"
  | "eventsNotes"
  | "expectedPlanned"
  | "actualMovements"
  | "addEvent"
  | "addIncome"
  | "addExpense"
  | "addNote"
  | "more"
  | "transactions"
  | "search"
  | "type"
  | "status"
  | "account"
  | "category"
  | "all"
  | "income"
  | "expense"
  | "transfer"
  | "active"
  | "voided"
  | "date"
  | "description"
  | "amount"
  | "matchStatus"
  | "detail"
  | "movementId"
  | "revision"
  | "planMatch"
  | "dailyEvent"
  | "allocation"
  | "correct"
  | "void"
  | "duplicate"
  | "auditHistory"
  | "noRestore"
  | "dependencyWarning"
  | "close"
  | "noTransactions"
  | "noDayEntries";

const TEXT: Record<LanguageCode, Record<CalendarTransactionTextKey, string>> = {
  EN: {
    calendar: "Calendar",
    focusCalendar: "Focus Calendar",
    exitFocus: "Exit Focus",
    today: "Today",
    previousMonth: "Previous month",
    nextMonth: "Next month",
    currentMonth: "Current month",
    selectedDay: "Selected day",
    eventsNotes: "Events / Notes",
    expectedPlanned: "Expected / Planned",
    actualMovements: "Actual movements",
    addEvent: "Event",
    addIncome: "Income",
    addExpense: "Expense",
    addNote: "Note",
    more: "more",
    transactions: "Transactions",
    search: "Search",
    type: "Type",
    status: "Status",
    account: "Account",
    category: "Category",
    all: "All",
    income: "Income",
    expense: "Expense",
    transfer: "Transfer",
    active: "Active",
    voided: "Voided",
    date: "Date",
    description: "Description",
    amount: "Amount",
    matchStatus: "Match / Status",
    detail: "Transaction detail",
    movementId: "Movement ID",
    revision: "Revision",
    planMatch: "Plan match",
    dailyEvent: "Daily event",
    allocation: "Allocation",
    correct: "Correct",
    void: "Void",
    duplicate: "Duplicate as new actual",
    auditHistory: "Audit History",
    noRestore: "Restore is not available in R1.",
    dependencyWarning: "Dependency warning",
    close: "Close",
    noTransactions: "No transactions match the current filters.",
    noDayEntries: "No entries for this section.",
  },
  HU: {
    calendar: "Naptár",
    focusCalendar: "Naptár fókusz",
    exitFocus: "Kilépés a fókuszból",
    today: "Ma",
    previousMonth: "Előző hónap",
    nextMonth: "Következő hónap",
    currentMonth: "Aktuális hónap",
    selectedDay: "Kiválasztott nap",
    eventsNotes: "Események / Jegyzetek",
    expectedPlanned: "Várt / Tervezett",
    actualMovements: "Tényleges pénzmozgások",
    addEvent: "Esemény",
    addIncome: "Bevétel",
    addExpense: "Kiadás",
    addNote: "Jegyzet",
    more: "további",
    transactions: "Tranzakciók",
    search: "Keresés",
    type: "Típus",
    status: "Állapot",
    account: "Számla",
    category: "Kategória",
    all: "Mind",
    income: "Bevétel",
    expense: "Kiadás",
    transfer: "Átvezetés",
    active: "Aktív",
    voided: "Érvénytelenített",
    date: "Dátum",
    description: "Leírás",
    amount: "Összeg",
    matchStatus: "Egyeztetés / Állapot",
    detail: "Tranzakció részletei",
    movementId: "Mozgás azonosító",
    revision: "Revízió",
    planMatch: "Terv-egyeztetés",
    dailyEvent: "Naptári esemény",
    allocation: "Elkülönítés",
    correct: "Javítás",
    void: "Érvénytelenítés",
    duplicate: "Másolat új ténylegesként",
    auditHistory: "Audit előzmények",
    noRestore: "Visszaállítás R1-ben nem érhető el.",
    dependencyWarning: "Függőségi figyelmeztetés",
    close: "Bezárás",
    noTransactions: "Nincs a szűrésnek megfelelő tranzakció.",
    noDayEntries: "Nincs bejegyzés ebben a részben.",
  },
  DE: {
    calendar: "Kalender",
    focusCalendar: "Kalenderfokus",
    exitFocus: "Fokus beenden",
    today: "Heute",
    previousMonth: "Vorheriger Monat",
    nextMonth: "Nächster Monat",
    currentMonth: "Aktueller Monat",
    selectedDay: "Ausgewählter Tag",
    eventsNotes: "Ereignisse / Notizen",
    expectedPlanned: "Erwartet / Geplant",
    actualMovements: "Ist-Bewegungen",
    addEvent: "Ereignis",
    addIncome: "Eingang",
    addExpense: "Ausgang",
    addNote: "Notiz",
    more: "weitere",
    transactions: "Transaktionen",
    search: "Suchen",
    type: "Typ",
    status: "Status",
    account: "Konto",
    category: "Kategorie",
    all: "Alle",
    income: "Eingang",
    expense: "Ausgang",
    transfer: "Umbuchung",
    active: "Aktiv",
    voided: "Storniert",
    date: "Datum",
    description: "Beschreibung",
    amount: "Betrag",
    matchStatus: "Abgleich / Status",
    detail: "Transaktionsdetails",
    movementId: "Bewegungs-ID",
    revision: "Revision",
    planMatch: "Planabgleich",
    dailyEvent: "Kalendereintrag",
    allocation: "Reservierung",
    correct: "Korrigieren",
    void: "Stornieren",
    duplicate: "Als neuen Ist-Wert duplizieren",
    auditHistory: "Audit-Verlauf",
    noRestore: "Wiederherstellen ist in R1 nicht verfügbar.",
    dependencyWarning: "Abhängigkeitswarnung",
    close: "Schließen",
    noTransactions: "Keine Transaktionen entsprechen den Filtern.",
    noDayEntries: "Keine Einträge in diesem Bereich.",
  },
};

export function calendarTransactionText(
  language: LanguageCode,
  key: CalendarTransactionTextKey,
): string {
  return TEXT[language][key];
}
