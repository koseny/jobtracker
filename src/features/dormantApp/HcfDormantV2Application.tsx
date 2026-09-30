import { useEffect, useMemo, useState } from "react";
import type { IdentityUser } from "../../adapters/identity/identity";
import { loadValidatedWorkspaceV2ReadOnly } from "../../application/loadWorkspaceV2ReadOnly";
import type { OwnerPreferencesRepository } from "../../domain/ownerPreferences";
import type { CashFlowWorkspaceV2 } from "../../domain/v2/cashFlowV2";
import type { CashFlowRepositoryV2 } from "../../domain/v2/repositoryV2";
import { HcfAppShell } from "../appShell/HcfAppShell";
import { useHcfShellPreferences } from "../appShell/HcfShellPreferenceContext";
import type { AppDestination } from "../appShell/appShellModel";
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
}: {
  workspace: CashFlowWorkspaceV2;
  destination: AppDestination;
  selectedMonth: string;
  onNavigate: (destination: AppDestination) => void;
  onSelectedMonthChange: (monthId: string) => void;
  onCalendarFocusChange: (focus: boolean) => void;
  onActionIntent?: (intent: DormantActionIntent) => void;
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
      {workspace === undefined ? (
        <ReadOnlyStatus status="LOADING" />
      ) : loadError ? (
        <ReadOnlyStatus status="ERROR" />
      ) : workspace === null ? (
        <ReadOnlyStatus status="NOT_FOUND" />
      ) : (
        <CanonicalProjectedWorkspace
          workspace={workspace}
          destination={destination}
          selectedMonth={selectedMonth}
          onNavigate={navigate}
          onSelectedMonthChange={changeMonth}
          onCalendarFocusChange={setCalendarFocus}
          onActionIntent={onActionIntent}
        />
      )}
    </HcfAppShell>
  );
}
