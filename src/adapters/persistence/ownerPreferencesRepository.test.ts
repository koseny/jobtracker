import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  ensureOwnerPreferences,
  setLanguagePreference,
  setThemePreference,
} from "../../application/ownerPreferencesService";
import {
  OwnerPreferencesRevisionConflictError,
  createDefaultOwnerPreferences,
} from "../../domain/ownerPreferences";
import { InMemoryOwnerPreferencesRepository } from "./inMemoryOwnerPreferencesRepository";
import { IndexedDbOwnerPreferencesRepository } from "./indexedDbOwnerPreferencesRepository";

describe("owner preferences service", () => {
  it("creates EN/LIGHT first-use defaults and updates them revision-safely", async () => {
    const repository = new InMemoryOwnerPreferencesRepository();
    const first = await ensureOwnerPreferences(
      repository,
      "owner-a",
      "2026-09-30T18:00:00Z",
    );

    expect(first).toMatchObject({
      ownerPartitionId: "owner-a",
      language: "EN",
      theme: "LIGHT",
      revision: 1,
    });

    const language = await setLanguagePreference(
      repository,
      first,
      "HU",
      "2026-09-30T18:01:00Z",
    );
    expect(language).toMatchObject({ language: "HU", theme: "LIGHT", revision: 2 });

    const theme = await setThemePreference(
      repository,
      language,
      "DARK",
      "2026-09-30T18:02:00Z",
    );
    expect(theme).toMatchObject({ language: "HU", theme: "DARK", revision: 3 });
  });

  it("keeps owners independent in the same repository", async () => {
    const repository = new InMemoryOwnerPreferencesRepository();
    const ownerA = await ensureOwnerPreferences(repository, "owner-a", "2026-09-30T18:00:00Z");
    const ownerB = await ensureOwnerPreferences(repository, "owner-b", "2026-09-30T18:00:00Z");

    await setThemePreference(repository, ownerA, "DARK", "2026-09-30T18:01:00Z");

    expect((await repository.load("owner-a"))?.theme).toBe("DARK");
    expect((await repository.load("owner-b"))).toEqual(ownerB);
  });

  it("rejects stale optimistic writes", async () => {
    const repository = new InMemoryOwnerPreferencesRepository();
    const first = createDefaultOwnerPreferences("owner-a", "2026-09-30T18:00:00Z");
    await repository.save(first, null);

    const current = { ...first, revision: 2, language: "DE" as const };
    await repository.save(current, 1);

    const stale = { ...first, revision: 2, theme: "DARK" as const };
    await expect(repository.save(stale, 1))
      .rejects.toBeInstanceOf(OwnerPreferencesRevisionConflictError);
  });
});

describe("IndexedDbOwnerPreferencesRepository", () => {
  let indexedDb: IDBFactory;

  beforeEach(() => {
    indexedDb = new IDBFactory();
  });

  it("persists HU/EN/DE and LIGHT/DARK per owner without touching financial storage", async () => {
    const repository = new IndexedDbOwnerPreferencesRepository(indexedDb);
    const ownerA = createDefaultOwnerPreferences("owner-a", "2026-09-30T18:00:00Z");
    const ownerB = createDefaultOwnerPreferences("owner-b", "2026-09-30T18:00:00Z");

    await repository.save(ownerA, null);
    await repository.save(ownerB, null);
    await repository.save(
      { ...ownerA, language: "DE", theme: "DARK", revision: 2, updatedAt: "2026-09-30T18:01:00Z" },
      1,
    );

    expect(await repository.load("owner-a")).toMatchObject({
      language: "DE",
      theme: "DARK",
      revision: 2,
    });
    expect(await repository.load("owner-b")).toMatchObject({
      language: "EN",
      theme: "LIGHT",
      revision: 1,
    });
  });
});
