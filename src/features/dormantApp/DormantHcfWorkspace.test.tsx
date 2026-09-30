import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HcfShellPreferenceProvider } from "../appShell/HcfShellPreferenceContext";
import { DormantHcfWorkspace } from "./HcfDormantApplication";
import type { AppDestination } from "../appShell/appShellModel";
import type { CashFlowWorkspaceV2 } from "../../domain/v2/cashFlowV2";
import { emptySourceStateV2 } from "../../domain/v2/validationV2";
import { projectWorkspaceV2ToOperationalViewModels } from "../readModel/projectWorkspaceV2";

function renderDestination(destination: AppDestination, language: "EN" | "HU" | "DE" = "EN") {
  return renderToStaticMarkup(
    <HcfShellPreferenceProvider value={{ language, theme: "LIGHT" }}>
      <DormantHcfWorkspace
        destination={destination}
        selectedMonth="2026-09"
        onNavigate={() => undefined}
        onSelectedMonthChange={() => undefined}
        onCalendarFocusChange={() => undefined}
      />
    </HcfShellPreferenceProvider>,
  );
}

describe("DormantHcfWorkspace", () => {
  it("composes every implemented operational destination", () => {
    expect(renderDestination("overview")).toContain("hcf-overview-screen");
    expect(renderDestination("month")).toContain("hcf-month-screen");
    expect(renderDestination("calendar")).toContain("hcf-calendar-screen");
    expect(renderDestination("transactions")).toContain("hcf-transactions-screen");
    expect(renderDestination("accounts")).toContain("hcf-ap-screen");
    expect(renderDestination("planning")).toContain("Plan Templates");
  });

  it("uses the shell preference language as the screen language SSOT", () => {
    const hu = renderDestination("overview", "HU");
    const de = renderDestination("planning", "DE");

    expect(hu).toContain("Bejövő");
    expect(hu).toContain("Legutóbbi tranzakciók");
    expect(de).toContain("Planvorlagen");
    expect(de).toContain("Einkommen &amp; Arbeit");
  });

  it("renders canonical v2 projected models instead of fixture fallback when provided", () => {
    const sourceState = emptySourceStateV2();
    sourceState.accounts.push({
      accountId: "canonical-bank",
      name: "Canonical Bank",
      accountType: "BANK",
      currencyCode: "HUF",
      active: true,
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-01T00:00:00Z",
    });
    sourceState.accountBalanceAnchors.push({
      accountBalanceAnchorId: "canonical-anchor",
      accountId: "canonical-bank",
      anchorType: "INITIAL",
      balance: { amountMinor: 123_000, currencyCode: "HUF" },
      effectiveAt: "2026-08-31T23:00:00Z",
    });
    const workspace: CashFlowWorkspaceV2 = {
      workspaceId: "home",
      ownerPartitionId: "owner",
      schemaVersion: 2,
      reportingCurrencyCode: "HUF",
      revision: 1,
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-09-30T00:00:00Z",
      sourceState,
    };
    const viewModels = projectWorkspaceV2ToOperationalViewModels(workspace, "2026-09", "EN");

    const html = renderToStaticMarkup(
      <HcfShellPreferenceProvider value={{ language: "EN", theme: "LIGHT" }}>
        <DormantHcfWorkspace
          destination="accounts"
          selectedMonth="2026-09"
          onNavigate={() => undefined}
          onSelectedMonthChange={() => undefined}
          onCalendarFocusChange={() => undefined}
          viewModels={viewModels}
        />
      </HcfShellPreferenceProvider>,
    );

    expect(html).toContain("Canonical Bank");
    expect(html).not.toContain("Main bank");
  });

  it("keeps unimplemented Reports and Settings as explicit dormant placeholders", () => {
    const reports = renderDestination("reports");
    const settings = renderDestination("settings");

    expect(reports).toContain("This navigation destination does not yet have a screen implementation");
    expect(settings).toContain("This navigation destination does not yet have a screen implementation");
  });
});
