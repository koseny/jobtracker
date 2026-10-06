import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import type { IdentityUser } from "../../adapters/identity/identity";
import { cancelPlanItemV2 } from "../../application/cancelPlanItemV2";
import { createPlanItemV2 } from "../../application/createPlanItemV2";
import { loadValidatedWorkspaceV2ReadOnly } from "../../application/loadWorkspaceV2ReadOnly";
import { movePlanItemV2, planMoveAvailability } from "../../application/movePlanItemV2";
import { revisePlanItemAmountV2 } from "../../application/revisePlanItemAmountV2";
import { updatePlanItemDetailsV2 } from "../../application/updatePlanItemDetailsV2";
import type { OwnerPreferencesRepository } from "../../domain/ownerPreferences";
import type { CashFlowWorkspaceV2, Money, PlanDirection } from "../../domain/v2/cashFlowV2";
import type { CashFlowRepositoryV2 } from "../../domain/v2/repositoryV2";
import { WorkspaceV2RevisionConflictError } from "../../domain/v2/repositoryV2";
import { HcfAppShell } from "../appShell/HcfAppShell";
import { useHcfShellPreferences } from "../appShell/HcfShellPreferenceContext";
import type { AppDestination } from "../appShell/appShellModel";
import { PlanEditor, type PlanEditorSelection } from "../month/PlanEditor";
import { projectWorkspaceV2ToOperationalViewModels } from "../readModel/projectWorkspaceV2";
import { shellFocusMode } from "./dormantAppModel";
import {
  DormantHcfWorkspace,
  type DormantActionIntent,
} from "./HcfDormantApplication";
import { normalizeMonthId } from "./dormantFixtureData";

type Props = {
  user: IdentityUser;
  preferencesRepository: OwnerPreferencesRepository;
  financialRepository: CashFlowRepositoryV2;
  workspaceId: string;
  onSignOut: () => Promise<void>;
  initialDestination?: AppDestination;
  initialSelectedMonth?: string;
  onActionIntent?: (intent: DormantActionIntent) => void;
};

function currentMonthId(): string {
  return new Date().toISOString().slice(0, 7);
}

function ConnectedPlanEditor(props: Omit<ComponentProps<typeof PlanEditor>, "language">) {
  const { language } = useHcfShellPreferences();
  return <PlanEditor {...props} language={language} />;
}

function ReadOnlyStatus({
  status,
}: {
  status: "LOADING" | "NOT_FOUND" | "ERROR";
}) {
  const { language } = useHcfShellPreferences();

  const text =
    status === "LOADING"
      ? language === "HU"
        ? "A kanonikus v2 pénzügyi állapot betöltése…"
        : language === "DE"
          ? "Kanonischer v2-Finanzzustand wird geladen…"
          : "Loading canonical v2 financial state…"
      : status === "NOT_FOUND"
        ? language === "HU"
          ? "Ehhez a tulajdonoshoz és munkaterülethez nem található v2 pénzügyi állapot."
          : language === "DE"
            ? "Für diesen Eigentümer und Arbeitsbereich wurde kein v2-Finanzzustand gefunden."
            : "No v2 financial state was found for this owner and workspace."
        : language === "HU"
          ? "A kanonikus v2 pénzügyi állapot nem vetíthető ki biztonságosan."
          : language === "DE"
            ? "Der kanonische v2-Finanzzustand kann nicht sicher projiziert werden."
            : "The canonical v2 financial state could not be projected safely.";

  return (
    <section className="hcf-dormant-deferred" role={status === "ERROR" ? "alert" : "status"}>
      <strong>{text}</strong>
    </section>
  );
}

function CanonicalProjectedWorkspace({
  workspace,
  destination,
  selectedMonth,
  onNavigate,
  onSelectedMonthChange,
  onCalendarFocusChange,
  onActionIntent,
  onPlanAdd,
  onPlanOpen,
  onPlanMove,
  canPlanMove,
  planBusy,
}: {
  workspace: CashFlowWorkspaceV2;
  destination: AppDestination;
  selectedMonth: string;
  onNavigate: (destination: AppDestination) => void;
  onSelectedMonthChange: (monthId: string) => void;
  onCalendarFocusChange: (focus: boolean) => void;
  onActionIntent?: (intent: DormantActionIntent) => void;
  onPlanAdd: (direction: PlanDirection) => void;
  onPlanOpen: (id: string) => void;
  onPlanMove: (id: string, move: "UP" | "DOWN") => void;
  canPlanMove: (id: string, move: "UP" | "DOWN") => boolean;
  planBusy: boolean;
}) {
  const { language } = useHcfShellPreferences();
  const models = useMemo(
    () => projectWorkspaceV2ToOperationalViewModels(workspace, selectedMonth, language),
    [language, selectedMonth, workspace],
  );

  return (
    <DormantHcfWorkspace
      destination={destination}
      selectedMonth={selectedMonth}
      onNavigate={onNavigate}
      onSelectedMonthChange={onSelectedMonthChange}
      onCalendarFocusChange={onCalendarFocusChange}
      viewModels={models}
      onActionIntent={onActionIntent}
      onPlanAdd={onPlanAdd}
      onPlanOpen={onPlanOpen}
      onPlanMove={onPlanMove}
      canPlanMove={canPlanMove}
      planBusy={planBusy}
    />
  );
}

export function HcfDormantV2Application({
  user,
  preferencesRepository,
  financialRepository,
  workspaceId,
  onSignOut,
  initialDestination = "overview",
  initialSelectedMonth = currentMonthId(),
  onActionIntent,
}: Props) {
  const [destination, setDestination] = useState<AppDestination>(initialDestination);
  const [selectedMonth, setSelectedMonth] = useState(() => normalizeMonthId(initialSelectedMonth));
  const [calendarFocus, setCalendarFocus] = useState(false);
  const [workspace, setWorkspace] = useState<CashFlowWorkspaceV2 | null | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);
  const [selection, setSelection] = useState<PlanEditorSelection | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setWorkspace(undefined);
    setLoadError(false);

    loadValidatedWorkspaceV2ReadOnly(
      financialRepository,
      user.id,
      workspaceId,
    )
      .then(result => {
        if (active) setWorkspace(result);
      })
      .catch(cause => {
        console.error(cause);
        if (active) {
          setLoadError(true);
          setWorkspace(null);
        }
      });

    return () => {
      active = false;
    };
  }, [financialRepository, user.id, workspaceId]);

  function navigate(next: AppDestination) {
    if (next !== "calendar") setCalendarFocus(false);
    setSelection(null);
    setDestination(next);
  }

  function changeMonth(next: string) {
    setCalendarFocus(false);
    setSelectedMonth(normalizeMonthId(next));
    setSelection(null);
  }

  function openPlan(id: string) {
    if (busyRef.current) return;
    const item = workspace?.sourceState.planItems.find(value => value.planItemId === id && value.planStatus === "ACTIVE");
    if (!item) return;
    setActionError(null);
    setSelection({ kind: "EDIT", item });
  }

  async function runPlanCommand(command: (current: CashFlowWorkspaceV2) => Promise<CashFlowWorkspaceV2>) {
    if (!workspace || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setActionError(null);
    try {
      const next = await command(workspace);
      setWorkspace(next);
      setSelection(null);
    } catch (cause) {
      if (cause instanceof WorkspaceV2RevisionConflictError) {
        try {
          const refreshed = await loadValidatedWorkspaceV2ReadOnly(financialRepository, user.id, workspaceId);
          setWorkspace(refreshed);
          setSelection(null);
        } catch (reloadCause) {
          console.error(reloadCause);
          setLoadError(true);
        }
      }
      setActionError(cause instanceof Error ? cause.message : "Plan change failed.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const context = (current: CashFlowWorkspaceV2) => ({
    ownerPartitionId: user.id,
    workspaceId,
    expectedRevision: current.revision,
    changedAt: new Date().toISOString(),
  });

  const selectedId = selection?.kind === "EDIT" ? selection.item.planItemId : null;

  return (
    <HcfAppShell
      user={user}
      preferencesRepository={preferencesRepository}
      activeDestination={destination}
      onNavigate={navigate}
      onSignOut={onSignOut}
      focusMode={shellFocusMode(destination, calendarFocus)}
    >
      {workspace === undefined ? (
        <ReadOnlyStatus status="LOADING" />
      ) : loadError ? (
        <ReadOnlyStatus status="ERROR" />
      ) : workspace === null ? (
        <ReadOnlyStatus status="NOT_FOUND" />
      ) : (
        <>
        {actionError && !selection && <p role="alert" className="hcf-dormant-deferred">{actionError}</p>}
        <CanonicalProjectedWorkspace
          workspace={workspace}
          destination={destination}
          selectedMonth={selectedMonth}
          onNavigate={navigate}
          onSelectedMonthChange={changeMonth}
          onCalendarFocusChange={setCalendarFocus}
          onActionIntent={onActionIntent}
          onPlanAdd={direction => { if (busyRef.current) return; setActionError(null); setSelection({ kind: "CREATE", direction, monthId: selectedMonth }); }}
          onPlanOpen={openPlan}
          onPlanMove={(id, move) => void runPlanCommand(current => movePlanItemV2(financialRepository, { ...context(current), planItemId: id, move }))}
          canPlanMove={(id, move) => planMoveAvailability(workspace.sourceState, id)[move]}
          planBusy={busy}
        />
        {selection && <ConnectedPlanEditor
          key={selection.kind === "CREATE" ? `${selection.monthId}-${selection.direction}` : selection.item.planItemId}
          selection={selection}
          busy={busy}
          error={actionError}
          onClose={() => { setSelection(null); setActionError(null); }}
          onCreate={(name, amount, expectedDate) => {
            if (selection.kind !== "CREATE") return;
            void runPlanCommand(current => createPlanItemV2(financialRepository, {
              ...context(current), planItemId: crypto.randomUUID(),
              item: { monthId: selection.monthId, direction: selection.direction, name, currentPlannedAmount: amount, ...(expectedDate ? { expectedDate } : {}) },
            }));
          }}
          onDetails={(name, expectedDate) => { if (selectedId) void runPlanCommand(current => updatePlanItemDetailsV2(financialRepository, { ...context(current), planItemId: selectedId, name, expectedDate })); }}
          onAmount={(newAmount: Money) => { if (selectedId) void runPlanCommand(current => revisePlanItemAmountV2(financialRepository, { ...context(current), planItemId: selectedId, planRevisionId: crypto.randomUUID(), newAmount })); }}
          onCancel={() => { if (selectedId) void runPlanCommand(current => cancelPlanItemV2(financialRepository, { ...context(current), planItemId: selectedId })); }}
        />}
        </>
      )}
    </HcfAppShell>
  );
}
