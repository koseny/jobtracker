import { describe, expect, it } from "vitest";
import {
  navigationModeForWidth,
  PRIMARY_NAVIGATION,
  shellText,
} from "./appShellModel";

describe("HCF application shell model", () => {
  it("uses the approved top-level destination order", () => {
    expect(PRIMARY_NAVIGATION.map(item => item.id)).toEqual([
      "overview",
      "month",
      "calendar",
      "transactions",
      "accounts",
      "planning",
      "reports",
      "settings",
    ]);
  });

  it("provides HU, EN and DE shell labels", () => {
    expect(shellText("HU", "calendar")).toBe("Naptár");
    expect(shellText("EN", "calendar")).toBe("Calendar");
    expect(shellText("DE", "calendar")).toBe("Kalender");
    expect(shellText("HU", "theme")).toBe("Téma");
    expect(shellText("DE", "signOut")).toBe("Abmelden");
  });

  it("adapts navigation from sidebar to rail to mobile drawer", () => {
    expect(navigationModeForWidth(1920)).toBe("SIDEBAR");
    expect(navigationModeForWidth(1366)).toBe("SIDEBAR");
    expect(navigationModeForWidth(1024)).toBe("RAIL");
    expect(navigationModeForWidth(720)).toBe("RAIL");
    expect(navigationModeForWidth(719)).toBe("DRAWER");
    expect(navigationModeForWidth(360)).toBe("DRAWER");
  });

  it("rejects invalid viewport widths", () => {
    expect(() => navigationModeForWidth(0)).toThrow();
    expect(() => navigationModeForWidth(Number.NaN)).toThrow();
  });
});
