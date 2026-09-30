import type { LanguageCode } from "../../domain/ownerPreferences";

export type AccountsPlanningTextKey =
  | "accounts"
  | "allocations"
  | "account"
  | "type"
  | "currency"
  | "position"
  | "allocated"
  | "free"
  | "status"
  | "active"
  | "inactive"
  | "addAccount"
  | "transfer"
  | "reconcile"
  | "transferReserve"
  | "reportingEquivalent"
  | "fxUnavailable"
  | "purpose"
  | "reserved"
  | "applied"
  | "remaining"
  | "linkedPlan"
  | "reserve"
  | "release"
  | "apply"
  | "adjust"
  | "overAllocated"
  | "planning"
  | "planTemplates"
  | "incomeWork"
  | "name"
  | "direction"
  | "plannedAmount"
  | "recurrence"
  | "timing"
  | "categoryGroup"
  | "income"
  | "expense"
  | "none"
  | "oneTime"
  | "monthly"
  | "quarterly"
  | "weekly"
  | "multipleWithinMonth"
  | "incomeSources"
  | "unit"
  | "unitPrice"
  | "workOccurrences"
  | "date"
  | "source"
  | "quantity"
  | "expectedValue"
  | "completed"
  | "planned"
  | "recordPayment"
  | "nonCashNotice";

const TEXT: Record<LanguageCode, Record<AccountsPlanningTextKey, string>> = {
  EN: {
    accounts:"Accounts", allocations:"Allocations", account:"Account", type:"Type", currency:"Currency",
    position:"Position", allocated:"Allocated", free:"Free", status:"Status", active:"Active", inactive:"Inactive",
    addAccount:"Account", transfer:"Transfer", reconcile:"Reconcile", transferReserve:"Transfer & Reserve",
    reportingEquivalent:"Reporting equivalent", fxUnavailable:"Consolidated value unavailable without an applicable FX quote.",
    purpose:"Purpose", reserved:"Reserved", applied:"Applied", remaining:"Remaining", linkedPlan:"Linked plan",
    reserve:"Reserve", release:"Release", apply:"Apply", adjust:"Adjust", overAllocated:"Over-allocation / under-coverage",
    planning:"Planning", planTemplates:"Plan Templates", incomeWork:"Income & Work", name:"Name",
    direction:"Direction", plannedAmount:"Planned amount", recurrence:"Recurrence", timing:"Timing",
    categoryGroup:"Category / Group", income:"Income", expense:"Expense", oneTime:"One time", monthly:"Monthly",
    quarterly:"Quarterly", weekly:"Weekly", multipleWithinMonth:"Multiple within month", none:"No recurrence", incomeSources:"Income Sources",
    unit:"Unit", unitPrice:"Unit price", workOccurrences:"Work Occurrences", date:"Date", source:"Source",
    quantity:"Quantity", expectedValue:"Expected value", completed:"Completed", planned:"Planned",
    recordPayment:"Record payment", nonCashNotice:"Completing work is operational only; it does not create actual income."
  },
  HU: {
    accounts:"Számlák", allocations:"Elkülönítések", account:"Számla", type:"Típus", currency:"Deviza",
    position:"Pozíció", allocated:"Elkülönítve", free:"Szabad", status:"Állapot", active:"Aktív", inactive:"Inaktív",
    addAccount:"Számla", transfer:"Átvezetés", reconcile:"Egyeztetés", transferReserve:"Átvezetés és elkülönítés",
    reportingEquivalent:"Riport devizás érték", fxUnavailable:"Összesített érték csak alkalmazható FX árfolyammal jeleníthető meg.",
    purpose:"Cél", reserved:"Félretéve", applied:"Felhasználva", remaining:"Maradék", linkedPlan:"Kapcsolt terv",
    reserve:"Elkülönítés", release:"Feloldás", apply:"Felhasználás", adjust:"Korrekció", overAllocated:"Túlelkülönítés / fedezethiány",
    planning:"Tervezés", planTemplates:"Tervsablonok", incomeWork:"Bevétel és munka", name:"Név",
    direction:"Irány", plannedAmount:"Tervezett összeg", recurrence:"Ismétlődés", timing:"Időzítés",
    categoryGroup:"Kategória / Csoport", income:"Bevétel", expense:"Kiadás", oneTime:"Egyszeri", monthly:"Havi",
    quarterly:"Negyedéves", weekly:"Heti", multipleWithinMonth:"Többször egy hónapon belül", none:"Nincs ismétlődés", incomeSources:"Bevételi források",
    unit:"Egység", unitPrice:"Egységár", workOccurrences:"Munkavégzések", date:"Dátum", source:"Forrás",
    quantity:"Mennyiség", expectedValue:"Várt érték", completed:"Teljesítve", planned:"Tervezett",
    recordPayment:"Fizetés rögzítése", nonCashNotice:"A munka teljesítése csak működési állapot; nem hoz létre tényleges bevételt."
  },
  DE: {
    accounts:"Konten", allocations:"Reservierungen", account:"Konto", type:"Typ", currency:"Währung",
    position:"Position", allocated:"Reserviert", free:"Frei", status:"Status", active:"Aktiv", inactive:"Inaktiv",
    addAccount:"Konto", transfer:"Umbuchung", reconcile:"Abgleichen", transferReserve:"Umbuchen & Reservieren",
    reportingEquivalent:"Berichtswährungswert", fxUnavailable:"Konsolidierter Wert ist ohne anwendbaren FX-Kurs nicht verfügbar.",
    purpose:"Zweck", reserved:"Reserviert", applied:"Verwendet", remaining:"Verbleibend", linkedPlan:"Verknüpfter Plan",
    reserve:"Reservieren", release:"Freigeben", apply:"Anwenden", adjust:"Anpassen", overAllocated:"Überreservierung / Unterdeckung",
    planning:"Planung", planTemplates:"Planvorlagen", incomeWork:"Einkommen & Arbeit", name:"Name",
    direction:"Richtung", plannedAmount:"Planbetrag", recurrence:"Wiederholung", timing:"Zeitpunkt",
    categoryGroup:"Kategorie / Gruppe", income:"Eingang", expense:"Ausgang", oneTime:"Einmalig", monthly:"Monatlich",
    quarterly:"Vierteljährlich", weekly:"Wöchentlich", multipleWithinMonth:"Mehrfach im Monat", none:"Keine Wiederholung", incomeSources:"Einkommensquellen",
    unit:"Einheit", unitPrice:"Einheitspreis", workOccurrences:"Arbeitseinsätze", date:"Datum", source:"Quelle",
    quantity:"Menge", expectedValue:"Erwarteter Wert", completed:"Erledigt", planned:"Geplant",
    recordPayment:"Zahlung erfassen", nonCashNotice:"Arbeitsabschluss ist nur operativ und erzeugt keinen Ist-Eingang."
  }
};

export function accountsPlanningText(language: LanguageCode, key: AccountsPlanningTextKey): string {
  return TEXT[language][key];
}
