import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import type { CashFlowWorkspaceV2 } from "../../domain/v2/cashFlowV2";
import {
  WorkspaceV2AlreadyExistsError,
  WorkspaceV2OwnershipError,
  WorkspaceV2RevisionConflictError,
} from "../../domain/v2/repositoryV2";
import { emptySourceStateV2 } from "../../domain/v2/validationV2";
import { InMemoryCashFlowRepositoryV2 } from "./inMemoryCashFlowRepositoryV2";
import {
  IndexedDbCashFlowRepositoryV2Rehearsal,
  RehearsalDatabaseNameError,
} from "./indexedDbCashFlowRepositoryV2Rehearsal";

function workspace(
  ownerPartitionId = "owner-a",
  revision = 1,
): CashFlowWorkspaceV2 {
  return {
    workspaceId: "home",
    ownerPartitionId,
    schemaVersion: 2,
    reportingCurrencyCode: "HUF",
    revision,
    createdAt: "2026-09-30T00:00:00Z",
    updatedAt: "2026-09-30T00:00:00Z",
    sourceState: emptySourceStateV2(),
  };
}

describe("CashFlowRepositoryV2 contract", () => {
  it("isolates in-memory workspaces by owner and returns detached values", async () => {
    const repository = new InMemoryCashFlowRepositoryV2();
    const original = workspace();

    await repository.save("owner-a", original, null);
    expect(await repository.load("owner-b", "home")).toBeNull();

    const loaded = await repository.load("owner-a", "home");
    expect(loaded).toEqual(original);
    loaded!.reportingCurrencyCode = "EUR";

    expect((await repository.load("owner-a", "home"))?.reportingCurrencyCode).toBe("HUF");
  });

  it("enforces ownership and optimistic revision transitions", async () => {
    const repository = new InMemoryCashFlowRepositoryV2();

    await expect(repository.save("owner-b", workspace("owner-a"), null))
      .rejects.toBeInstanceOf(WorkspaceV2OwnershipError);

    await repository.save("owner-a", workspace("owner-a", 1), null);

    await expect(repository.save("owner-a", workspace("owner-a", 1), null))
      .rejects.toBeInstanceOf(WorkspaceV2AlreadyExistsError);

    await expect(repository.save("owner-a", workspace("owner-a", 3), 1))
      .rejects.toBeInstanceOf(WorkspaceV2RevisionConflictError);

    await repository.save("owner-a", workspace("owner-a", 2), 1);
    expect((await repository.load("owner-a", "home"))?.revision).toBe(2);
  });
});

describe("IndexedDbCashFlowRepositoryV2Rehearsal", () => {
  let indexedDb: IDBFactory;

  beforeEach(() => {
    indexedDb = new IDBFactory();
  });

  it("refuses the production database name", () => {
    expect(
      () => new IndexedDbCashFlowRepositoryV2Rehearsal("civilbonus-hcf", indexedDb),
    ).toThrow(RehearsalDatabaseNameError);
  });

  it("round-trips canonical v2 state only in a dedicated rehearsal database", async () => {
    const repository = new IndexedDbCashFlowRepositoryV2Rehearsal(
      "civilbonus-hcf-v2-rehearsal-test",
      indexedDb,
    );
    const original = workspace();

    await repository.save("owner-a", original, null);
    await expect(repository.load("owner-a", "home")).resolves.toEqual(original);
    await expect(repository.load("owner-b", "home")).resolves.toBeNull();
  });

  it("enforces revision conflicts before overwriting rehearsal state", async () => {
    const repository = new IndexedDbCashFlowRepositoryV2Rehearsal(
      "civilbonus-hcf-v2-rehearsal-conflict-test",
      indexedDb,
    );
    await repository.save("owner-a", workspace("owner-a", 1), null);

    await expect(repository.save("owner-a", workspace("owner-a", 3), 1))
      .rejects.toBeInstanceOf(WorkspaceV2RevisionConflictError);

    await expect(repository.load("owner-a", "home")).resolves.toEqual(
      workspace("owner-a", 1),
    );
  });
});
