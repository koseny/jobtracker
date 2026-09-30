import { describe, expect, it } from "vitest";
import {
  isImplementedDormantDestination,
  shellFocusMode,
} from "./dormantAppModel";

describe("dormant application routing model", () => {
  it("recognizes implemented operational destinations", () => {
    expect([
      "overview",
      "month",
      "calendar",
      "transactions",
      "accounts",
      "planning",
    ].every(destination =>
      isImplementedDormantDestination(destination as Parameters<typeof isImplementedDormantDestination>[0]),
    )).toBe(true);

    expect(isImplementedDormantDestination("reports")).toBe(false);
    expect(isImplementedDormantDestination("settings")).toBe(false);
  });

  it("activates the shell focus rail only for Calendar Focus", () => {
    expect(shellFocusMode("calendar", true)).toBe("CALENDAR");
    expect(shellFocusMode("calendar", false)).toBe("NONE");
    expect(shellFocusMode("month", true)).toBe("NONE");
  });
});
