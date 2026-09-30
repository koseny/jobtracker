import { describe, expect, it } from "vitest";
import type { CashFlowRepository, CashFlowWorkspace } from "../../domain/cashFlow";
import type { CashFlowRepositoryV2 } from "../../domain/v2/repositoryV2";
import { InMemoryCashFlowRepository } from "../../adapters/persistence/inMemoryCashFlowRepository";
import { InMemoryCashFlowRepositoryV2 } from "../../adapters/persistence/inMemoryCashFlowRepositoryV2";
import {
  createLegacyWorkspaceBackup,
  LegacyWorkspaceBackupError,
  restoreLegacyWorkspaceBackup,
} from "./legacyBackup";
import {
  MigrationRehearsalVerificationError,
  rehearseV1ToV2Migration,
} from "./rehearseV1ToV2";

function legacyWorkspace(ownerPartitionId = "owner-a"): CashFlowWorkspace {
  return {
    workspaceId: "home",
    ownerPartitionId,
    schemaVersion: 1,
    currency: "HUF",
    bufferPolicy: {
      roundingValueHuf: 1_000,
      roundingThresholdHuf: 500,
      applyToFixed: false,
    },
    items: [
      {
        id: "salary",
        name: "Salary",
        direction: "income",
        mode: "bank",
        planningStatus: "planned",
        schedule: { frequency: "monthly" },
        expectedAmountHuf: 500_000,
        expenseType: null,
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
      },
      {
        id: "groceries",
        name: "Groceries",
        direction: "spending",
        mode: "cash",
        planningStatus: "planned",
        schedule: { frequency: "weekly" },
        estimatedAmountHuf: 35_000,
        expenseType: "variable",
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
      },
    ],
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-29T00:00:00Z",
  };
}

class FailingV2Repository implements CashFlowRepositoryV2 {
  async load(): Promise<null> {
    return null;
  }

  async save(): Promise<void> {
    throw new Error("staging write failed");
  }
}

class MutatingLegacyRepository implements CashFlowRepository {
  private workspace: CashFlowWorkspace;
  private loads = 0;

  constructor(workspace: CashFlowWorkspace) {
    this.workspace = structuredClone(workspace);
  }

  async load(): Promise<CashFlowWorkspace> {
    this.loads += 1;
    if (this.loads > 1) {
      this.workspace = {
        ...this.workspace,
        updatedAt: "2099-01-01T00:00:00Z",
      };
    }
    return structuredClone(this.workspace);
  }

  async save(workspace: CashFlowWorkspace): Promise<void> {
    this.workspace = structuredClone(workspace);
  }
}

describe("legacy migration backup", () => {
  it("serializes an identity-neutral backup and restores it for the active owner", () => {
    const source = legacyWorkspace();
    const backup = createLegacyWorkspaceBackup(
      source,
      "owner-a",
      "2026-09-30T12:00:00Z",
    );

    expect(backup).not.toContain("ownerPartitionId");
    expect(backup).not.toContain("owner-a");

    const restored = restoreLegacyWorkspaceBackup(backup, "owner-a");
    expect(restored).toEqual(source);
  });

  it("rejects a backup created from invalid legacy data", () => {
    const source = legacyWorkspace();
    source.items[0] = { ...source.items[0], name: " " };

    expect(() =>
      createLegacyWorkspaceBackup(source, "owner-a", "2026-09-30T12:00:00Z"),
    ).toThrow();
  });

  it("rejects unknown backup formats", () => {
    expect(() =>
      restoreLegacyWorkspaceBackup(
        JSON.stringify({ format: "other", formatVersion: 1, workspace: {} }),
        "owner-a",
      ),
    ).toThrow(LegacyWorkspaceBackupError);
  });
});

describe("migration rehearsal", () => {
  it("creates backup, stages v2 candidate, verifies round trip and leaves v1 unchanged", async () => {
    const legacyRepository = new InMemoryCashFlowRepository();
    const stagingRepository = new InMemoryCashFlowRepositoryV2();
    const source = legacyWorkspace();
    await legacyRepository.save(source);

    const result = await rehearseV1ToV2Migration(
      legacyRepository,
      stagingRepository,
      "owner-a",
      "home",
      "2026-09-30T12:00:00Z",
    );

    expect(result.candidate.schemaVersion).toBe(2);
    expect(result.persistedCandidate).toEqual(result.candidate);
    expect(result.candidate.sourceState.accounts).toEqual([]);
    expect(result.candidate.sourceState.moneyMovements).toEqual([]);
    expect(result.backupJson).not.toContain("owner-a");
    expect(await legacyRepository.load("owner-a", "home")).toEqual(source);
  });

  it("does not mutate v1 if staging persistence fails", async () => {
    const legacyRepository = new InMemoryCashFlowRepository();
    const source = legacyWorkspace();
    await legacyRepository.save(source);

    await expect(
      rehearseV1ToV2Migration(
        legacyRepository,
        new FailingV2Repository(),
        "owner-a",
        "home",
        "2026-09-30T12:00:00Z",
      ),
    ).rejects.toThrow("staging write failed");

    expect(await legacyRepository.load("owner-a", "home")).toEqual(source);
  });

  it("detects unexpected source mutation during rehearsal", async () => {
    const legacyRepository = new MutatingLegacyRepository(legacyWorkspace());
    const stagingRepository = new InMemoryCashFlowRepositoryV2();

    await expect(
      rehearseV1ToV2Migration(
        legacyRepository,
        stagingRepository,
        "owner-a",
        "home",
        "2026-09-30T12:00:00Z",
      ),
    ).rejects.toBeInstanceOf(MigrationRehearsalVerificationError);
  });
});
