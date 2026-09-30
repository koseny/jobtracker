import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { OwnerPreferences } from "../../domain/ownerPreferences";
import { InMemoryOwnerPreferencesRepository } from "../../adapters/persistence/inMemoryOwnerPreferencesRepository";
import { HcfDormantApplication } from "./HcfDormantApplication";

describe("HcfDormantApplication", () => {
  it("renders the dormant shell + Overview composition without production persistence", async () => {
    const repository = new InMemoryOwnerPreferencesRepository();
    const preferences: OwnerPreferences = {
      ownerPartitionId: "owner-fixture",
      language: "EN",
      theme: "LIGHT",
      revision: 1,
      createdAt: "2026-09-30T19:00:00Z",
      updatedAt: "2026-09-30T19:00:00Z",
    };
    await repository.save(preferences, null);

    const html = renderToStaticMarkup(
      <HcfDormantApplication
        user={{ id: "owner-fixture", displayName: "Fixture User", email: "fixture@example.com", photoUrl: null }}
        preferencesRepository={repository}
        onSignOut={async () => undefined}
        initialDestination="overview"
        initialSelectedMonth="2026-09"
      />,
    );

    expect(html).toContain("hcf-app-shell");
    expect(html).toContain("hcf-overview-screen");
    expect(html).toContain("Home Cash Flow");
    expect(html).toContain("Fixture User");
  });
});
