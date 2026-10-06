import { describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { InMemoryCashFlowRepositoryV2 } from "../adapters/persistence/inMemoryCashFlowRepositoryV2";
import { IndexedDbCashFlowRepositoryV2Rehearsal } from "../adapters/persistence/indexedDbCashFlowRepositoryV2Rehearsal";
import type { CashFlowWorkspaceV2 } from "../domain/v2/cashFlowV2";
import { WorkspaceV2NotFoundError, WorkspaceV2RevisionConflictError } from "../domain/v2/repositoryV2";
import { DomainV2ValidationError, emptySourceStateV2, validateWorkspaceV2 } from "../domain/v2/validationV2";
import { projectWorkspaceV2ToOperationalViewModels } from "../features/readModel/projectWorkspaceV2";
import { createPlanItemV2 } from "./createPlanItemV2";
import { revisePlanItemAmountV2, type RevisePlanItemAmountV2Command } from "./revisePlanItemAmountV2";

const createdAt = "2026-09-01T00:00:00Z";

function workspace(ownerPartitionId = "owner-a"): CashFlowWorkspaceV2 {
  return {
    workspaceId: "home", ownerPartitionId, schemaVersion: 2, reportingCurrencyCode: "HUF",
    revision: 1, createdAt, updatedAt: createdAt, sourceState: emptySourceStateV2(),
  };
}

function command(overrides: Partial<RevisePlanItemAmountV2Command> = {}): RevisePlanItemAmountV2Command {
  return {
    ownerPartitionId: "owner-a", workspaceId: "home", expectedRevision: 2,
    changedAt: "2026-10-02T12:00:00Z", planItemId: "plan-one", planRevisionId: "plan-r1",
    newAmount: { amountMinor: 6_000, currencyCode: "HUF" }, reason: "  Re-estimated  ",
    ...overrides,
  };
}

const repositories = [
  { name: "memory", create: () => new InMemoryCashFlowRepositoryV2() },
  { name: "IndexedDB rehearsal", create: () => new IndexedDbCashFlowRepositoryV2Rehearsal(
    "hcf-v2-plan-revision-test", new IDBFactory(),
  ) },
];

describe.each(repositories)("dormant v2 plan amount revision — $name", ({ create }) => {
  async function seeded() {
    const repository = create();
    await repository.save("owner-a", workspace(), null);
    await createPlanItemV2(repository, {
      ownerPartitionId: "owner-a", workspaceId: "home", expectedRevision: 1,
      changedAt: "2026-10-01T12:00:00Z", planItemId: "plan-one",
      item: { monthId: "2026-10", direction: "EXPENSE", name: "Rent",
        currentPlannedAmount: { amountMinor: 5_000, currencyCode: "HUF" } },
    });
    return repository;
  }

  it("preserves original and intermediate amounts in append-only revisions without posting actuals", async () => {
    const repository = await seeded();
    const first = await revisePlanItemAmountV2(repository, command());
    expect(first.revision).toBe(3);
    expect(first.sourceState.planRevisions).toEqual([{
      planRevisionId: "plan-r1", planItemId: "plan-one", revisionNo: 1,
      previousAmount: { amountMinor: 5_000, currencyCode: "HUF" },
      newAmount: { amountMinor: 6_000, currencyCode: "HUF" },
      changedAt: "2026-10-02T12:00:00Z", reason: "Re-estimated",
    }]);
    const second = await revisePlanItemAmountV2(repository, command({
      expectedRevision: 3, planRevisionId: "plan-r2", changedAt: "2026-10-03T12:00:00Z",
      newAmount: { amountMinor: 4_000, currencyCode: "HUF" }, reason: undefined,
    }));
    expect(second.sourceState.planRevisions[0]).toEqual(first.sourceState.planRevisions[0]);
    expect(second.sourceState.planRevisions[1]).toMatchObject({
      revisionNo: 2, previousAmount: { amountMinor: 6_000, currencyCode: "HUF" },
      newAmount: { amountMinor: 4_000, currencyCode: "HUF" },
    });
    expect(second.sourceState.planItems[0].currentPlannedAmount.amountMinor).toBe(4_000);
    expect(second.sourceState.moneyMovements).toEqual([]);
    expect(second.sourceState.allocations).toEqual([]);
    expect(await repository.load("owner-a", "home")).toEqual(second);
    const model = projectWorkspaceV2ToOperationalViewModels(second, "2026-10", "EN");
    expect(model.month.spendingGroups.flatMap(group => group.rows).find(row => row.id === "plan-one")?.planned)
      .toEqual({ amountMinor: 4_000, currencyCode: "HUF" });
    expect(model.transactionRows).toEqual([]);
  });

  it("refuses malformed, same-value, cross-currency and duplicate revision writes", async () => {
    const repository = await seeded();
    const before = await repository.load("owner-a", "home");
    const save = vi.spyOn(repository, "save");
    for (const change of [
      { planRevisionId: " " },
      { newAmount: { amountMinor: -1, currencyCode: "HUF" as const } },
      { newAmount: { amountMinor: Number.MAX_SAFE_INTEGER + 1, currencyCode: "HUF" as const } },
      { newAmount: { amountMinor: 5_000, currencyCode: "HUF" as const } },
      { newAmount: { amountMinor: 6_000, currencyCode: "EUR" as const } },
      { reason: " " },
    ]) {
      await expect(revisePlanItemAmountV2(repository, command(change)))
        .rejects.toBeInstanceOf(DomainV2ValidationError);
    }
    expect(save).not.toHaveBeenCalled();
    expect(await repository.load("owner-a", "home")).toEqual(before);

    const first = await revisePlanItemAmountV2(repository, command());
    save.mockClear();
    await expect(revisePlanItemAmountV2(repository, command({
      expectedRevision: 3, newAmount: { amountMinor: 7_000, currencyCode: "HUF" },
    }))).rejects.toBeInstanceOf(DomainV2ValidationError);
    expect(save).not.toHaveBeenCalled();
    expect(await repository.load("owner-a", "home")).toEqual(first);
  });

  it("rejects broken revision continuity and a current amount that diverges from history", async () => {
    const repository = await seeded();
    const first = await revisePlanItemAmountV2(repository, command());
    const brokenPrevious = structuredClone(first);
    brokenPrevious.sourceState.planRevisions[0].previousAmount.amountMinor = -1;
    expect(() => validateWorkspaceV2(brokenPrevious)).toThrow(DomainV2ValidationError);
    const brokenCurrent = structuredClone(first);
    brokenCurrent.sourceState.planItems[0].currentPlannedAmount.amountMinor = 7_000;
    expect(() => validateWorkspaceV2(brokenCurrent)).toThrow("current amount must match");
    const brokenSequence = structuredClone(first);
    brokenSequence.sourceState.planRevisions[0].revisionNo = 2;
    expect(() => validateWorkspaceV2(brokenSequence)).toThrow("history must be continuous");
    const oldShape = structuredClone(first);
    Reflect.deleteProperty(oldShape.sourceState.planRevisions[0], "previousAmount");
    expect(() => validateWorkspaceV2(oldShape)).toThrow("amount shape is unsupported");
    const second = await revisePlanItemAmountV2(repository, command({
      expectedRevision: 3, planRevisionId: "plan-r2",
      newAmount: { amountMinor: 7_000, currencyCode: "HUF" },
    }));
    const brokenChain = structuredClone(second);
    brokenChain.sourceState.planRevisions[1].previousAmount.amountMinor = 5_000;
    expect(() => validateWorkspaceV2(brokenChain)).toThrow("history must be continuous");
  });

  it("isolates owner, rejects stale revision and leaves state untouched on save failure", async () => {
    const repository = await seeded();
    await expect(revisePlanItemAmountV2(repository, command({ ownerPartitionId: "owner-b" })))
      .rejects.toBeInstanceOf(WorkspaceV2NotFoundError);
    const first = await revisePlanItemAmountV2(repository, command());
    await expect(revisePlanItemAmountV2(repository, command({ planRevisionId: "plan-r2" })))
      .rejects.toBeInstanceOf(WorkspaceV2RevisionConflictError);
    vi.spyOn(repository, "save").mockRejectedValueOnce(new Error("storage failure"));
    await expect(revisePlanItemAmountV2(repository, command({
      expectedRevision: 3, planRevisionId: "plan-r2", newAmount: { amountMinor: 7_000, currencyCode: "HUF" },
    }))).rejects.toThrow("storage failure");
    expect(await repository.load("owner-a", "home")).toEqual(first);
  });
});
