import { useMemo, useState } from "react";
import type { IdentityUser } from "../../adapters/identity/identity";
import type { OwnerPreferencesRepository } from "../../domain/ownerPreferences";
import { AccountsScreen } from "../accounts/AccountsScreen";
import { HcfAppShell } from "../appShell/HcfAppShell";
import { useHcfShellPreferences } from "../appShell/HcfShellPreferenceContext";
import { shellText, type AppDestination } from "../appShell/appShellModel";
import { CalendarScreen } from "../calendar/CalendarScreen";
import { MonthScreen } from "../month/MonthScreen";
import { OverviewScreen } from "../overview/OverviewScreen";
import { PlanningScreen } from "../planning/PlanningScreen";
import { TransactionsScreen } from "../transactions/TransactionsScreen";
import type { HcfOperationalViewModels } from "../readModel/operationalViewModels";
import { shellFocusMode } from "./dormantAppModel";
import {
  buildDormantHcfFixture,
  normalizeMonthId,
  shiftMonth,
} from "./dormantFixtureData";
import "./dormantApp.css";

export interface DormantActionIntent {
  kind:
    | "MONTH_ADD"
    | "MONTH_OPEN_ITEM"
    | "CALENDAR_QUICK_ADD"
    | "CALENDAR_OPEN_ENTRY"
    | "TRANSACTION_CORRECT"
    | "TRANSACTION_VOID"
    | "TRANSACTION_DUPLICATE"
    | "ACCOUNT_ADD"
    | "ACCOUNT_TRANSFER"
    | "ACCOUNT_RECONCILE"
    | "ACCOUNT_TRANSFER_RESERVE"
    | "ACCOUNT_OPEN"
    | "ALLOCATION_RESERVE"
    | "ALLOCATION_RELEASE"
    | "ALLOCATION_APPLY"
    | "ALLOCATION_ADJUST"
    | "PLAN_TEMPLATE_ADD"
    | "PLAN_TEMPLATE_OPEN"
    | "INCOME_SOURCE_ADD"
    | "INCOME_SOURCE_OPEN"
    | "WORK_RECORD_PAYMENT";
  id?: string;
  detail?: string;
}

type Props = {
  user: IdentityUser;
  preferencesRepository: OwnerPreferencesRepository;
  onSignOut: () => Promise<void>;
  initialDestination?: AppDestination;
  initialSelectedMonth?: string;
  onActionIntent?: (intent: DormantActionIntent) => void;
};

function currentMonthId(): string {
  return new Date().toISOString().slice(0, 7);
}

function DeferredDestination({ destination }: { destination: "reports" | "settings" }) {
  const { language } = useHcfShellPreferences();
  const description =
    language === "HU"
      ? "Ez a navigációs cél a jelenlegi alvó integrációs szeletben még nem kapott képernyő-implementációt."
      : language === "DE"
        ? "Dieses Navigationsziel hat in diesem ruhenden Integrations-Slice noch keine Bildschirmimplementierung."
        : "This navigation destination does not yet have a screen implementation in the current dormant integration slice.";

  return (
    <section className="hcf-dormant-deferred" aria-label={shellText(language, destination)}>
      <strong>{shellText(language, destination)}</strong>
      <p>{description}</p>
    </section>
  );
}

type WorkspaceProps = {
  destination: AppDestination;
  selectedMonth: string;
  onNavigate: (destination: AppDestination) => void;
  onSelectedMonthChange: (monthId: string) => void;
  onCalendarFocusChange: (focus: boolean) => void;
  viewModels?: HcfOperationalViewModels;
  onActionIntent?: (intent: DormantActionIntent) => void;
  onPlanAdd?: (direction: "INCOME" | "EXPENSE") => void;
  onPlanOpen?: (id: string) => void;
  onPlanMove?: (id: string, move: "UP" | "DOWN") => void;
  canPlanMove?: (id: string, move: "UP" | "DOWN") => boolean;
  planBusy?: boolean;
};

export function DormantHcfWorkspace({
  destination,
  selectedMonth,
  onNavigate,
  onSelectedMonthChange,
  onCalendarFocusChange,
  viewModels,
  onActionIntent,
  onPlanAdd,
  onPlanOpen,
  onPlanMove,
  canPlanMove,
  planBusy,
}: WorkspaceProps) {
  const { language } = useHcfShellPreferences();
  const models = useMemo(
    () => viewModels ?? buildDormantHcfFixture(selectedMonth, language),
    [language, selectedMonth, viewModels],
  );

  const emit = (intent: DormantActionIntent) => onActionIntent?.(intent);
  const previousMonth = () => onSelectedMonthChange(shiftMonth(selectedMonth, -1));
  const nextMonth = () => onSelectedMonthChange(shiftMonth(selectedMonth, 1));
  const currentMonth = () => onSelectedMonthChange(currentMonthId());

  switch (destination) {
    case "overview":
      return (
        <OverviewScreen
          language={language}
          model={models.overview}
          onViewAllTransactions={() => onNavigate("transactions")}
          onOpenCalendar={() => onNavigate("calendar")}
          onOpenAccounts={() => onNavigate("accounts")}
        />
      );
    case "month":
      return (
        <MonthScreen
          language={language}
          model={models.month}
          onPreviousMonth={previousMonth}
          onNextMonth={nextMonth}
          onCurrentMonth={currentMonth}
          onSelectedMonthChange={onSelectedMonthChange}
          onAdd={direction => onPlanAdd ? onPlanAdd(direction) : emit({ kind: "MONTH_ADD", detail: direction })}
          onOpenItem={id => onPlanOpen ? onPlanOpen(id) : emit({ kind: "MONTH_OPEN_ITEM", id })}
          onMoveItem={onPlanMove}
          canMoveItem={canPlanMove}
          planBusy={planBusy}
          onOpenAccounts={() => onNavigate("accounts")}
        />
      );
    case "calendar":
      return (
        <CalendarScreen
          key={selectedMonth}
          language={language}
          model={models.calendar}
          onModeChange={mode => onCalendarFocusChange(mode === "FOCUS")}
          onPreviousMonth={previousMonth}
          onNextMonth={nextMonth}
          onCurrentMonth={currentMonth}
          onSelectedMonthChange={onSelectedMonthChange}
          onQuickAdd={(date, kind) => emit({ kind: "CALENDAR_QUICK_ADD", id: date, detail: kind })}
          onOpenEntry={id => emit({ kind: "CALENDAR_OPEN_ENTRY", id })}
        />
      );
    case "transactions":
      return (
        <TransactionsScreen
          key={selectedMonth}
          language={language}
          selectedMonth={selectedMonth}
          rows={models.transactionRows}
          detailsByMovementId={models.transactionDetails}
          onSelectedMonthChange={onSelectedMonthChange}
          onCorrect={id => emit({ kind: "TRANSACTION_CORRECT", id })}
          onVoid={id => emit({ kind: "TRANSACTION_VOID", id })}
          onDuplicate={id => emit({ kind: "TRANSACTION_DUPLICATE", id })}
        />
      );
    case "accounts":
      return (
        <AccountsScreen
          language={language}
          model={models.accounts}
          onAddAccount={() => emit({ kind: "ACCOUNT_ADD" })}
          onTransfer={() => emit({ kind: "ACCOUNT_TRANSFER" })}
          onReconcile={() => emit({ kind: "ACCOUNT_RECONCILE" })}
          onTransferReserve={() => emit({ kind: "ACCOUNT_TRANSFER_RESERVE" })}
          onOpenAccount={id => emit({ kind: "ACCOUNT_OPEN", id })}
          onReserve={() => emit({ kind: "ALLOCATION_RESERVE" })}
          onRelease={id => emit({ kind: "ALLOCATION_RELEASE", id })}
          onApply={id => emit({ kind: "ALLOCATION_APPLY", id })}
          onAdjust={id => emit({ kind: "ALLOCATION_ADJUST", id })}
        />
      );
    case "planning":
      return (
        <PlanningScreen
          language={language}
          model={models.planning}
          onAddTemplate={() => emit({ kind: "PLAN_TEMPLATE_ADD" })}
          onOpenTemplate={id => emit({ kind: "PLAN_TEMPLATE_OPEN", id })}
          onAddIncomeSource={() => emit({ kind: "INCOME_SOURCE_ADD" })}
          onOpenIncomeSource={id => emit({ kind: "INCOME_SOURCE_OPEN", id })}
          onRecordPayment={id => emit({ kind: "WORK_RECORD_PAYMENT", id })}
        />
      );
    case "reports":
    case "settings":
      return <DeferredDestination destination={destination} />;
  }
}

export function HcfDormantApplication({
  user,
  preferencesRepository,
  onSignOut,
  initialDestination = "overview",
  initialSelectedMonth = currentMonthId(),
  onActionIntent,
}: Props) {
  const [destination, setDestination] = useState<AppDestination>(initialDestination);
  const [selectedMonth, setSelectedMonth] = useState(() => normalizeMonthId(initialSelectedMonth));
  const [calendarFocus, setCalendarFocus] = useState(false);

  function navigate(next: AppDestination) {
    if (next !== "calendar") setCalendarFocus(false);
    setDestination(next);
  }

  function changeMonth(next: string) {
    setCalendarFocus(false);
    setSelectedMonth(normalizeMonthId(next));
  }

  return (
    <HcfAppShell
      user={user}
      preferencesRepository={preferencesRepository}
      activeDestination={destination}
      onNavigate={navigate}
      onSignOut={onSignOut}
      focusMode={shellFocusMode(destination, calendarFocus)}
    >
      <DormantHcfWorkspace
        destination={destination}
        selectedMonth={selectedMonth}
        onNavigate={navigate}
        onSelectedMonthChange={changeMonth}
        onCalendarFocusChange={setCalendarFocus}
        onActionIntent={onActionIntent}
      />
    </HcfAppShell>
  );
}
