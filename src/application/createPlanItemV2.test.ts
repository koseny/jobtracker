import { describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { InMemoryCashFlowRepositoryV2 } from "../adapters/persistence/inMemoryCashFlowRepositoryV2";
import { IndexedDbCashFlowRepositoryV2Rehearsal } from "../adapters/persistence/indexedDbCashFlowRepositoryV2Rehearsal";
import type { CashFlowWorkspaceV2 } from "../domain/v2/cashFlowV2";
import { WorkspaceV2NotFoundError, WorkspaceV2RevisionConflictError } from "../domain/v2/repositoryV2";
import { DomainV2ValidationError, emptySourceStateV2 } from "../domain/v2/validationV2";
import { projectWorkspaceV2ToOperationalViewModels } from "../features/readModel/projectWorkspaceV2";
import { createPlanItemV2, type CreatePlanItemV2Command } from "./createPlanItemV2";

const createdAt = "2026-09-01T00:00:00Z";

function workspace(ownerPartitionId = "owner-a"): CashFlowWorkspaceV2 {
  return {
    workspaceId: "home", ownerPartitionId, schemaVersion: 2, reportingCurrencyCode: "HUF",
    revision: 1, createdAt, updatedAt: createdAt, sourceState: emptySourceStateV2(),
  };
}

function command(overrides: Partial<CreatePlanItemV2Command> = {}): CreatePlanItemV2Command {
  return {
    ownerPartitionId: "owner-a", workspaceId: "home", expectedRevision: 1,
    changedAt: "2026-10-01T12:00:00Z", planItemId: "plan-one",
    item: {
      monthId: "2026-10", direction: "INCOME", name: "  Work  ",
      currentPlannedAmount: { amountMinor: 5_000, currencyCode: "HUF" },
      expectedDate: "2026-10-15",
    },
    ...overrides,
  };
}

const repositories = [
  { name: "memory", create: () => new InMemoryCashFlowRepositoryV2() },
  { name: "IndexedDB rehearsal", create: () => new IndexedDbCashFlowRepositoryV2Rehearsal(
    "hcf-v2-plan-create-test", new IDBFactory(),
  ) },
];

describe.each(repositories)("dormant v2 plan creation — $name", ({ create }) => {
  it.each(["INCOME", "EXPENSE"] as const)("creates %s as a plan without an actual or reserve", async direction => {
    const repository = create();
    await repository.save("owner-a", workspace(), null);
    const request = command();
    request.item.direction = direction;
    const saved = await createPlanItemV2(repository, request);
    expect(saved.revision).toBe(2);
    expect(saved.sourceState.planItems).toEqual([{
      planItemId: "plan-one", monthId: "2026-10", direction, name: "Work",
      currentPlannedAmount: { amountMinor: 5_000, currencyCode: "HUF" },
      expectedDate: "2026-10-15", planStatus: "ACTIVE", completionStatus: "OPEN",
      createdAt: request.changedAt, updatedAt: request.changedAt,
    }]);
    expect(saved.sourceState.planRevisions).toEqual([]);
    expect(saved.sourceState.moneyMovements).toEqual([]);
    expect(saved.sourceState.allocations).toEqual([]);
    expect(await repository.load("owner-a", "home")).toEqual(saved);

    const model = projectWorkspaceV2ToOperationalViewModels(saved, "2026-10", "EN");
    const rows = direction === "INCOME" ? model.month.incomeGroups : model.month.spendingGroups;
    expect(rows.flatMap(group => group.rows)).toContainEqual(expect.objectContaining({
      id: "plan-one", planned: { amountMinor: 5_000, currencyCode: "HUF" },
    }));
    expect(model.transactionRows).toEqual([]);
  });

  it("refuses invalid input and duplicates without saving a partial plan", async () => {
    const repository = create();
    await repository.save("owner-a", workspace(), null);
    const save = vi.spyOn(repository, "save");
    for (const change of [
      { planItemId: " " },
      { item: { ...command().item, name: " " } },
      { item: { ...command().item, monthId: "2026-13" } },
      { item: { ...command().item, expectedDate: "2026-02-30" } },
      { item: { ...command().item, currentPlannedAmount: { amountMinor: 0.5, currencyCode: "HUF" as const } } },
      { item: { ...command().item, currentPlannedAmount: { amountMinor: Number.MAX_SAFE_INTEGER + 1, currencyCode: "HUF" as const } } },
    ]) {
      await expect(createPlanItemV2(repository, command(change)))
        .rejects.toBeInstanceOf(DomainV2ValidationError);
    }
    expect(save).not.toHaveBeenCalled();
    expect(await repository.load("owner-a", "home")).toEqual(workspace());

    const first = await createPlanItemV2(repository, command());
    save.mockClear();
    await expect(createPlanItemV2(repository, command({ expectedRevision: 2 })))
      .rejects.toBeInstanceOf(DomainV2ValidationError);
    expect(save).not.toHaveBeenCalled();
    expect(await repository.load("owner-a", "home")).toEqual(first);
  });

  it("isolates owners and rejects stale competing saves", async () => {
    const repository = create();
    await repository.save("owner-a", workspace(), null);
    await expect(createPlanItemV2(repository, command({ ownerPartitionId: "owner-b" })))
      .rejects.toBeInstanceOf(WorkspaceV2NotFoundError);
    const saved = await createPlanItemV2(repository, command());
    await expect(createPlanItemV2(repository, command({ planItemId: "plan-two" })))
      .rejects.toBeInstanceOf(WorkspaceV2RevisionConflictError);
    expect(await repository.load("owner-a", "home")).toEqual(saved);
  });

  it("snapshots caller input and leaves source untouched if persistence fails", async () => {
    const repository = create();
    await repository.save("owner-a", workspace(), null);
    const request = command();
    const pending = createPlanItemV2(repository, request);
    request.item.name = "Changed later";
    const saved = await pending;
    expect(saved.sourceState.planItems[0].name).toBe("Work");

    const original = await repository.load("owner-a", "home");
    vi.spyOn(repository, "save").mockRejectedValueOnce(new Error("storage failure"));
    await expect(createPlanItemV2(repository, command({ expectedRevision: 2, planItemId: "plan-two" })))
      .rejects.toThrow("storage failure");
    expect(await repository.load("owner-a", "home")).toEqual(original);
  });
});
