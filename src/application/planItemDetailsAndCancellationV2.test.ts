import { describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { InMemoryCashFlowRepositoryV2 } from "../adapters/persistence/inMemoryCashFlowRepositoryV2";
import { IndexedDbCashFlowRepositoryV2Rehearsal } from "../adapters/persistence/indexedDbCashFlowRepositoryV2Rehearsal";
import type { CashFlowWorkspaceV2 } from "../domain/v2/cashFlowV2";
import { WorkspaceV2NotFoundError, WorkspaceV2RevisionConflictError } from "../domain/v2/repositoryV2";
import { DomainV2ValidationError, emptySourceStateV2 } from "../domain/v2/validationV2";
import { projectWorkspaceV2ToOperationalViewModels } from "../features/readModel/projectWorkspaceV2";
import { cancelPlanItemV2, type CancelPlanItemV2Command } from "./cancelPlanItemV2";
import { createPlanItemV2 } from "./createPlanItemV2";
import { revisePlanItemAmountV2 } from "./revisePlanItemAmountV2";
import { updatePlanItemDetailsV2, type UpdatePlanItemDetailsV2Command } from "./updatePlanItemDetailsV2";

const createdAt = "2026-10-01T12:00:00Z";
const editedAt = "2026-10-03T12:00:00Z";

function workspace(): CashFlowWorkspaceV2 {
  return {
    workspaceId: "home", ownerPartitionId: "owner-a", schemaVersion: 2,
    reportingCurrencyCode: "HUF", revision: 1, createdAt, updatedAt: createdAt,
    sourceState: emptySourceStateV2(),
  };
}

function edit(overrides: Partial<UpdatePlanItemDetailsV2Command> = {}): UpdatePlanItemDetailsV2Command {
  return {
    ownerPartitionId: "owner-a", workspaceId: "home", expectedRevision: 3,
    changedAt: editedAt, planItemId: "rent", name: "  New rent  ",
    expectedDate: "2026-10-20", ...overrides,
  };
}

function cancel(overrides: Partial<CancelPlanItemV2Command> = {}): CancelPlanItemV2Command {
  return {
    ownerPartitionId: "owner-a", workspaceId: "home", expectedRevision: 3,
    changedAt: editedAt, planItemId: "rent", ...overrides,
  };
}

const repositories = [
  { name: "memory", create: () => new InMemoryCashFlowRepositoryV2() },
  { name: "IndexedDB rehearsal", create: () => new IndexedDbCashFlowRepositoryV2Rehearsal(
    "hcf-v2-plan-details-cancel-test", new IDBFactory(),
  ) },
];

describe.each(repositories)("dormant v2 plan details and cancellation — $name", ({ create }) => {
  async function seeded() {
    const repository = create();
    await repository.save("owner-a", workspace(), null);
    await createPlanItemV2(repository, {
      ownerPartitionId: "owner-a", workspaceId: "home", expectedRevision: 1,
      changedAt: createdAt, planItemId: "rent",
      item: { monthId: "2026-10", direction: "EXPENSE", name: "Rent",
        expectedDate: "2026-10-15", currentPlannedAmount: { amountMinor: 5_000, currencyCode: "HUF" } },
    });
    await revisePlanItemAmountV2(repository, {
      ownerPartitionId: "owner-a", workspaceId: "home", expectedRevision: 2,
      changedAt: "2026-10-02T12:00:00Z", planItemId: "rent", planRevisionId: "rent-r1",
      newAmount: { amountMinor: 6_000, currencyCode: "HUF" },
    });
    return repository;
  }

  it("edits name and date without touching the approved amount history, then clears the date", async () => {
    const repository = await seeded();
    const before = await repository.load("owner-a", "home");
    const saved = await updatePlanItemDetailsV2(repository, edit());
    expect(saved.revision).toBe(4);
    expect(saved.sourceState.planItems[0]).toMatchObject({
      name: "New rent", expectedDate: "2026-10-20", updatedAt: editedAt,
      currentPlannedAmount: { amountMinor: 6_000, currencyCode: "HUF" },
    });
    expect(saved.sourceState.planRevisions).toEqual(before!.sourceState.planRevisions);
    expect(saved.sourceState.moneyMovements).toEqual([]);
    expect(await repository.load("owner-a", "home")).toEqual(saved);

    const cleared = await updatePlanItemDetailsV2(repository, edit({
      expectedRevision: 4, name: undefined, expectedDate: null,
      changedAt: "2026-10-04T12:00:00Z",
    }));
    expect(cleared.sourceState.planItems[0]).not.toHaveProperty("expectedDate");
    expect(cleared.sourceState.planRevisions).toEqual(before!.sourceState.planRevisions);
  });

  it("cancels the active expectation but retains its amount revision and identity", async () => {
    const repository = await seeded();
    const before = await repository.load("owner-a", "home");
    const saved = await cancelPlanItemV2(repository, cancel());
    expect(saved.revision).toBe(4);
    expect(saved.sourceState.planItems[0]).toMatchObject({
      planItemId: "rent", planStatus: "CANCELLED", currentPlannedAmount: { amountMinor: 6_000, currencyCode: "HUF" },
      updatedAt: editedAt,
    });
    expect(saved.sourceState.planRevisions).toEqual(before!.sourceState.planRevisions);
    expect(saved.sourceState.moneyMovements).toEqual([]);
    expect(projectWorkspaceV2ToOperationalViewModels(saved, "2026-10", "EN")
      .month.spendingGroups.flatMap(group => group.rows).some(row => row.id === "rent")).toBe(false);
    expect(await repository.load("owner-a", "home")).toEqual(saved);
  });

  it("rejects missing, invalid, unchanged and already-cancelled edits before persistence", async () => {
    const repository = await seeded();
    const before = await repository.load("owner-a", "home");
    const save = vi.spyOn(repository, "save");
    for (const change of [
      { planItemId: "absent" }, { planItemId: " " },
      { name: " ", expectedDate: undefined },
      { name: undefined, expectedDate: undefined },
      { name: "Rent", expectedDate: "2026-10-15" },
      { name: undefined, expectedDate: "2026-02-30" },
    ]) {
      await expect(updatePlanItemDetailsV2(repository, edit(change)))
        .rejects.toBeInstanceOf(DomainV2ValidationError);
    }
    await expect(cancelPlanItemV2(repository, cancel({ planItemId: "absent" })))
      .rejects.toBeInstanceOf(DomainV2ValidationError);
    expect(save).not.toHaveBeenCalled();
    expect(await repository.load("owner-a", "home")).toEqual(before);

    const cancelled = await cancelPlanItemV2(repository, cancel());
    save.mockClear();
    await expect(cancelPlanItemV2(repository, cancel({ expectedRevision: 4 })))
      .rejects.toBeInstanceOf(DomainV2ValidationError);
    expect(save).not.toHaveBeenCalled();
    expect(await repository.load("owner-a", "home")).toEqual(cancelled);
  });

  it("isolates owners, rejects stale writes and preserves state on storage failure", async () => {
    const repository = await seeded();
    await expect(updatePlanItemDetailsV2(repository, edit({ ownerPartitionId: "owner-b" })))
      .rejects.toBeInstanceOf(WorkspaceV2NotFoundError);
    await expect(cancelPlanItemV2(repository, cancel({ ownerPartitionId: "owner-b" })))
      .rejects.toBeInstanceOf(WorkspaceV2NotFoundError);
    const saved = await updatePlanItemDetailsV2(repository, edit());
    await expect(cancelPlanItemV2(repository, cancel()))
      .rejects.toBeInstanceOf(WorkspaceV2RevisionConflictError);
    vi.spyOn(repository, "save").mockRejectedValueOnce(new Error("storage failure"));
    await expect(cancelPlanItemV2(repository, cancel({ expectedRevision: 4 })))
      .rejects.toThrow("storage failure");
    expect(await repository.load("owner-a", "home")).toEqual(saved);
  });
});
