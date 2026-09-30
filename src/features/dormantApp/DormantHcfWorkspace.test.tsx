import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HcfShellPreferenceProvider } from "../appShell/HcfShellPreferenceContext";
import { DormantHcfWorkspace } from "./HcfDormantApplication";
import type { AppDestination } from "../appShell/appShellModel";

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

  it("keeps unimplemented Reports and Settings as explicit dormant placeholders", () => {
    const reports = renderDestination("reports");
    const settings = renderDestination("settings");

    expect(reports).toContain("This navigation destination does not yet have a screen implementation");
    expect(settings).toContain("This navigation destination does not yet have a screen implementation");
  });
});
